import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteWorkspaceStore } from "../src/storage/sqlite/sqlite-store.js";
import {
  DEMO_CLOCK,
  DEMO_WORKSPACE,
  demoConfig,
  demoPolicy,
  seedSyntheticDemo,
} from "../src/demo/seed.js";
import { evaluateCoverage } from "../src/matching/engine.js";
import {
  buildCoverageReport,
  reportToCsv,
  reportToTerminal,
  writePrivateArtifact,
} from "../src/reporting/report.js";
import { assertResetPath } from "../src/cli/path-safety.js";
import { runCli } from "../src/cli/main.js";

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "wpa-report-"));
  const store = new SqliteWorkspaceStore(join(root, "workspace.db"));
  seedSyntheticDemo(store);
  const output = evaluateCoverage(
    {
      workspaceId: DEMO_WORKSPACE,
      config: demoConfig,
      policy: demoPolicy,
      runClock: DEMO_CLOCK,
    },
    store,
  );
  return { root, store, runId: output.auditRun.auditRunId };
};
describe("privacy-safe deterministic reporting", () => {
  it("emits exactly A-D, redacts brokers and is byte-stable", () => {
    const { store, runId } = setup();
    const one = buildCoverageReport(store, {
      workspaceId: DEMO_WORKSPACE,
      auditRunId: runId,
      config: demoConfig,
      at: DEMO_CLOCK,
    });
    const two = buildCoverageReport(store, {
      workspaceId: DEMO_WORKSPACE,
      auditRunId: runId,
      config: demoConfig,
      at: DEMO_CLOCK,
    });
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(one.findings.map((x) => x.category)).toEqual(["A", "B", "C", "D"]);
    expect(JSON.stringify(one)).not.toMatch(
      /contributor_broker|edge_person_casey|edge_person_devon/,
    );
    expect(
      one.findings
        .filter((x) => x.category === "B" || x.category === "D")
        .every(
          (x) =>
            x.candidate_label === "review-pending coach/champion candidate",
        ),
    ).toBe(true);
    expect(one.blocked).toHaveLength(2);
    store.close();
  });
  it("reveals broker and exact edge only in an authorized reviewer view", () => {
    const { store, runId } = setup();
    const safe = buildCoverageReport(store, {
      workspaceId: DEMO_WORKSPACE,
      auditRunId: runId,
      config: demoConfig,
      at: DEMO_CLOCK,
    });
    const reviewer = buildCoverageReport(store, {
      workspaceId: DEMO_WORKSPACE,
      auditRunId: runId,
      config: demoConfig,
      at: DEMO_CLOCK,
      view: "reviewer",
    });
    expect(JSON.stringify(safe)).not.toContain("edge_person_casey");
    expect(JSON.stringify(reviewer)).toContain("contributor_broker");
    expect(JSON.stringify(reviewer)).toContain("edge_person_casey");
    store.close();
  });
  it("neutralizes every CSV cell and escapes terminal controls", () => {
    const { store, runId } = setup();
    const person = store.get(DEMO_WORKSPACE, "person", "person_alex");
    if (person?.entityType !== "person") throw new Error("missing");
    store.put(DEMO_WORKSPACE, {
      entityType: "person",
      value: { ...person.value, displayName: " =2+2\u001b[31m" },
    });
    const report = buildCoverageReport(store, {
      workspaceId: DEMO_WORKSPACE,
      auditRunId: runId,
      config: demoConfig,
      at: DEMO_CLOCK,
    });
    expect(reportToCsv(report)).toContain("\"' =2+2");
    expect(reportToTerminal(report)).not.toContain("\u001b");
    expect(reportToTerminal(report)).toContain("\\u001b");
    store.close();
  });
  it("immediately invalidates display after suppression and consent withdrawal", () => {
    const { store, runId } = setup();
    store.put(DEMO_WORKSPACE, {
      entityType: "suppression_rule",
      value: {
        workspaceId: DEMO_WORKSPACE,
        suppressionRuleId: "suppress_casey",
        kind: "person",
        value: "person_casey",
        reasonCode: "OPERATOR_SUPPRESSION",
        effectiveAt: DEMO_CLOCK,
      },
    });
    const suppressed = buildCoverageReport(store, {
      workspaceId: DEMO_WORKSPACE,
      auditRunId: runId,
      config: demoConfig,
      at: DEMO_CLOCK,
    });
    expect(suppressed.findings.map((x) => x.category)).toEqual(["A", "B", "D"]);
    const consent = store.get(
      DEMO_WORKSPACE,
      "consent",
      "consent_contributor_owner",
    );
    if (consent?.entityType !== "consent") throw new Error("missing");
    store.put(DEMO_WORKSPACE, {
      entityType: "consent",
      value: { ...consent.value, status: "withdrawn", withdrawnAt: DEMO_CLOCK },
    });
    const withdrawn = buildCoverageReport(store, {
      workspaceId: DEMO_WORKSPACE,
      auditRunId: runId,
      config: demoConfig,
      at: DEMO_CLOCK,
    });
    expect(withdrawn.findings.map((x) => x.category)).toEqual(["D"]);
    store.close();
  });
  it("enforces export permissions, mode 0600, no overwrite and path safety", () => {
    const root = mkdtempSync(join(tmpdir(), "wpa-output-"));
    const file = join(root, "report.json");
    writePrivateArtifact(file, "{}\n", { allowedRoot: root });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(() =>
      writePrivateArtifact(file, "x", { allowedRoot: root }),
    ).toThrow("OUTPUT_EXISTS_USE_OVERWRITE");
    expect(() =>
      writePrivateArtifact(join(root, "..", "escape.json"), "x", {
        allowedRoot: root,
      }),
    ).toThrow("OUTPUT_OUTSIDE_ALLOWED_ROOT");
    const target = join(root, "target");
    writeFileSync(target, "x");
    const link = join(root, "link");
    symlinkSync(target, link);
    expect(() =>
      writePrivateArtifact(link, "x", { overwrite: true, allowedRoot: root }),
    ).toThrow("SYMLINK_OUTPUT_REJECTED");
    expect(readFileSync(file, "utf8")).toBe("{}\n");
  });
  it("runs the credential-free CLI demo end to end with parseable artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "wpa-cli-"));
    const db = join(root, "workspace.db"),
      reports = join(root, "reports");
    expect(runCli(["demo", "--db", db, "--reports", reports])).toBe(0);
    const report = JSON.parse(
      readFileSync(join(reports, "coverage-report.json"), "utf8"),
    ) as { findings: { category: string }[] };
    expect(report.findings.map((x) => x.category)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(
      readFileSync(join(reports, "coverage-report.csv"), "utf8").split("\n")
        .length,
    ).toBe(6);
  });
  it("rejects unsafe reset paths and cross-scope paths", () => {
    const root = mkdtempSync(join(tmpdir(), "wpa-reset-"));
    mkdirSync(join(root, "safe"));
    expect(() => assertResetPath("/", root)).toThrow("UNSAFE_DATABASE_PATH");
    expect(() => assertResetPath(join(tmpdir(), "outside.db"), root)).toThrow(
      "RESET_PATH_OUTSIDE_SCOPE",
    );
    expect(() =>
      assertResetPath(join(root, "safe", "workspace.db"), root),
    ).not.toThrow();
  });
});
