#!/usr/bin/env node
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { z } from "zod";
import {
  consentRecordSchema,
  contributorSchema,
  suppressionRuleSchema,
  verifyAuditChain,
} from "../index.js";
import { importCsv } from "../import/import-service.js";
import { engineConfigSchema, enginePolicySchema } from "../matching/config.js";
import { evaluateCoverage } from "../matching/engine.js";
import { decideOrganizationAlias } from "../resolution/review.js";
import { decidePersonResolution } from "../resolution/person-review.js";
import { SqliteWorkspaceStore } from "../storage/sqlite/sqlite-store.js";
import { workspaceScopedId } from "../security/deterministic.js";
import { appendOperationAudit } from "../security/operations.js";
import { withdrawContributorConsent } from "../consent/withdrawal.js";
import {
  buildCoverageReport,
  reportToCsv,
  reportToTerminal,
  writePrivateArtifact,
} from "../reporting/report.js";
import {
  DEMO_CLOCK,
  DEMO_WORKSPACE,
  demoConfig,
  demoPolicy,
  seedSyntheticDemo,
} from "../demo/seed.js";
import { assertResetPath, assertSafeDatabasePath } from "./path-safety.js";

const iso = z.iso.datetime({ offset: true });
type Flags = Record<string, string | boolean>;
function parse(argv: string[]): {
  command: string;
  sub?: string;
  flags: Flags;
} {
  const [command = "help", maybeSub, ...rest] = argv;
  const hasSub = maybeSub !== undefined && !maybeSub.startsWith("--");
  const tokens = hasSub ? rest : maybeSub ? [maybeSub, ...rest] : rest;
  const flags: Flags = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token?.startsWith("--"))
      throw new Error(`UNEXPECTED_ARGUMENT:${token ?? ""}`);
    const eq = token.indexOf("=");
    if (eq > 2) flags[token.slice(2, eq)] = token.slice(eq + 1);
    else if (tokens[i + 1] && !tokens[i + 1]?.startsWith("--"))
      flags[token.slice(2)] = tokens[++i] ?? "";
    else flags[token.slice(2)] = true;
  }
  return { command, ...(hasSub ? { sub: maybeSub } : {}), flags };
}
const stringFlag = (flags: Flags, name: string, required = true): string => {
  const value = flags[name];
  if (typeof value === "string" && value) return value;
  if (required) throw new Error(`MISSING_FLAG:--${name}`);
  return "";
};
const boolFlag = (flags: Flags, name: string) =>
  flags[name] === true || flags[name] === "true";
const jsonFile = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(path), "utf8"));
const clock = (flags: Flags, name = "at") => iso.parse(stringFlag(flags, name));
const openStore = (flags: Flags) => {
  const db = resolve(stringFlag(flags, "db"));
  assertSafeDatabasePath(db);
  mkdirSync(dirname(db), { recursive: true, mode: 0o700 });
  chmodSync(dirname(db), 0o700);
  return new SqliteWorkspaceStore(db);
};
const emit = (value: unknown, flags: Flags) =>
  process.stdout.write(
    boolFlag(flags, "json")
      ? `${JSON.stringify(value)}\n`
      : `${String(value)}\n`,
  );
function usage(): string {
  return `warm-path-audit <command> [subcommand] [flags]

Commands:
  init --db PATH --workspace ID --name NAME --owner ACTOR --purpose ID --at ISO
  contributor add --db PATH --workspace ID --file contributor.json --actor ID --at ISO
  consent add --db PATH --workspace ID --file consent.json --actor ID --at ISO
  consent withdraw --db PATH --workspace ID --consent ID --actor ID --reason TEXT --at ISO
  import csv --db PATH --workspace ID --contributor ID --consent ID --source-kind KIND --mapping mapping.json --file data.csv --import-root DIR --at ISO
  review list --db PATH --workspace ID [--json]
  review decide --db PATH --workspace ID --candidate ID --decision approve|reject --actor ID --reason TEXT --at ISO
  config validate --config config.json --policy policy.json [--json]
  run --db PATH --workspace ID --config config.json --policy policy.json --at ISO [--actor ID] [--json]
  inspect findings|blocked|dependencies|consent|suppressions|audit|receipts --db PATH --workspace ID [--run ID --config FILE --at ISO] [--json]
  suppress add --db PATH --workspace ID --kind KIND --value VALUE --reason CODE --actor ID --at ISO [--expires ISO]
  suppress remove --db PATH --workspace ID --suppression ID --actor ID --reason TEXT --at ISO
  export json|csv --db PATH --workspace ID --run ID --config FILE --at ISO --out PATH [--view safe|reviewer] [--overwrite] [--authorized-reviewer]
  demo --db PATH --reports DIR [--overwrite]
  reset --db PATH --allowed-root DIR --yes

Every action is local and credential-free. No networking, outreach, CRM writes, or URL guessing.`;
}

export function runCli(argv: string[]): number {
  const { command, sub, flags } = parse(argv);
  if (command === "help" || boolFlag(flags, "help")) {
    emit(usage(), flags);
    return 0;
  }
  if (command === "config" && sub === "validate") {
    const config = engineConfigSchema.parse(
      jsonFile(stringFlag(flags, "config")),
    );
    const policy = enginePolicySchema.parse(
      jsonFile(stringFlag(flags, "policy")),
    );
    if (config.workspaceId !== policy.workspaceId)
      throw new Error("Cross-workspace configuration denied");
    emit(
      boolFlag(flags, "json")
        ? {
            valid: true,
            workspace_id: config.workspaceId,
            config_id: config.configId,
            policy_id: policy.policyId,
          }
        : "Configuration and policy are valid.",
      flags,
    );
    return 0;
  }
  if (command === "reset") {
    const db = resolve(stringFlag(flags, "db")),
      root = resolve(stringFlag(flags, "allowed-root"));
    if (!boolFlag(flags, "yes"))
      throw new Error("RESET_REQUIRES_EXPLICIT_--yes");
    assertResetPath(db, root);
    for (const path of [db, `${db}-wal`, `${db}-shm`])
      if (existsSync(path)) rmSync(path);
    emit(`Reset local database ${db}`, flags);
    return 0;
  }
  if (command === "demo") {
    const db = resolve(stringFlag(flags, "db")),
      reports = resolve(stringFlag(flags, "reports"));
    assertSafeDatabasePath(db);
    if (existsSync(db) && !boolFlag(flags, "overwrite"))
      throw new Error("DEMO_DATABASE_EXISTS_USE_OVERWRITE");
    if (existsSync(db))
      for (const path of [db, `${db}-wal`, `${db}-shm`])
        rmSync(path, { force: true });
    mkdirSync(dirname(db), { recursive: true, mode: 0o700 });
    const store = new SqliteWorkspaceStore(db);
    try {
      seedSyntheticDemo(store);
      const out = evaluateCoverage(
        {
          workspaceId: DEMO_WORKSPACE,
          config: demoConfig,
          policy: demoPolicy,
          runClock: DEMO_CLOCK,
          actorId: "actor_demo",
        },
        store,
      );
      const report = buildCoverageReport(store, {
        workspaceId: DEMO_WORKSPACE,
        auditRunId: out.auditRun.auditRunId,
        config: demoConfig,
        at: DEMO_CLOCK,
      });
      if (report.findings.map((x) => x.category).join("") !== "ABCD")
        throw new Error("DEMO_EXPECTED_EXACTLY_ONE_A_B_C_D");
      writePrivateArtifact(
        resolve(reports, "coverage-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        { overwrite: boolFlag(flags, "overwrite"), allowedRoot: reports },
      );
      writePrivateArtifact(
        resolve(reports, "coverage-report.csv"),
        reportToCsv(report),
        { overwrite: boolFlag(flags, "overwrite"), allowedRoot: reports },
      );
      emit(reportToTerminal(report), flags);
    } finally {
      store.close();
    }
    return 0;
  }
  if (command === "init") {
    const store = openStore(flags);
    try {
      store.createWorkspace({
        workspaceId: stringFlag(flags, "workspace"),
        name: stringFlag(flags, "name"),
        ownerActorId: stringFlag(flags, "owner"),
        purposeId: stringFlag(flags, "purpose"),
        policyVersion: "1",
        createdAt: clock(flags),
      });
      emit(
        `Initialized private workspace ${stringFlag(flags, "workspace")} at ${store.databasePath}`,
        flags,
      );
    } finally {
      store.close();
    }
    return 0;
  }
  const store = openStore(flags),
    workspaceId = stringFlag(flags, "workspace");
  try {
    if (command === "contributor" && sub === "add") {
      const value = contributorSchema.parse(
        jsonFile(stringFlag(flags, "file")),
      );
      if (value.workspaceId !== workspaceId)
        throw new Error("Cross-workspace contributor denied");
      store.put(workspaceId, { entityType: "contributor", value });
      appendOperationAudit(store, workspaceId, {
        eventType: "contributor.registered",
        actorId: stringFlag(flags, "actor"),
        occurredAt: clock(flags),
        subjectType: "contributor",
        subjectId: value.contributorId,
        payload: { kind: value.kind },
      });
      emit(value.contributorId, flags);
    } else if (command === "consent" && sub === "add") {
      const value = consentRecordSchema.parse(
        jsonFile(stringFlag(flags, "file")),
      );
      if (value.workspaceId !== workspaceId)
        throw new Error("Cross-workspace consent denied");
      store.put(workspaceId, { entityType: "consent", value });
      appendOperationAudit(store, workspaceId, {
        eventType: "consent.registered",
        actorId: stringFlag(flags, "actor"),
        occurredAt: clock(flags),
        subjectType: "consent",
        subjectId: value.consentRecordId,
        payload: {
          contributorId: value.contributorId,
          purposeId: value.purposeId,
          sourceClasses: value.sourceClasses,
          allowedCategories: value.allowedCategories,
        },
      });
      emit(value.consentRecordId, flags);
    } else if (command === "consent" && sub === "withdraw") {
      const receipt = withdrawContributorConsent(
        store,
        workspaceId,
        stringFlag(flags, "consent"),
        stringFlag(flags, "actor"),
        stringFlag(flags, "reason"),
        clock(flags),
      );
      appendOperationAudit(store, workspaceId, {
        eventType: "consent.withdrawn",
        actorId: stringFlag(flags, "actor"),
        occurredAt: clock(flags),
        subjectType: "deletion_receipt",
        subjectId: receipt.receiptId,
        payload: { receiptId: receipt.receiptId, counts: receipt.counts },
      });
      emit(
        boolFlag(flags, "json")
          ? receipt
          : `Consent withdrawn; receipt ${receipt.receiptId}`,
        flags,
      );
    } else if (command === "import" && sub === "csv") {
      const result = importCsv(
        {
          workspaceId,
          contributorId: stringFlag(flags, "contributor"),
          consentRecordId: stringFlag(flags, "consent"),
          sourceKind: stringFlag(flags, "source-kind"),
          mappingId: stringFlag(flags, "mapping-id", false) || "mapping_cli",
          mappingVersion: stringFlag(flags, "mapping-version", false) || "1",
          file: resolve(stringFlag(flags, "file")),
          importRoots: [resolve(stringFlag(flags, "import-root"))],
          importedAt: clock(flags),
          mapping: jsonFile(stringFlag(flags, "mapping")) as never,
        },
        store,
      );
      appendOperationAudit(store, workspaceId, {
        eventType: "csv.imported",
        actorId: stringFlag(flags, "actor", false) || "actor_operator",
        occurredAt: clock(flags),
        subjectType: "source_snapshot",
        subjectId: result.sourceSnapshotId,
        payload: { recordCount: result.recordCount, status: result.status },
      });
      emit(
        boolFlag(flags, "json")
          ? result
          : `Imported ${String(result.recordCount)} rows into ${result.sourceSnapshotId}`,
        flags,
      );
    } else if (command === "review" && sub === "list") {
      const output = {
        person: store
          .list(workspaceId, "person_resolution_candidate")
          .map((x) => x.value),
        organization: store
          .list(workspaceId, "organization_alias_candidate")
          .map((x) => x.value),
      };
      emit(
        boolFlag(flags, "json") ? output : JSON.stringify(output, null, 2),
        flags,
      );
    } else if (command === "review" && sub === "decide") {
      const decision = stringFlag(flags, "decision");
      if (decision !== "approve" && decision !== "reject")
        throw new Error("DECISION_MUST_BE_APPROVE_OR_REJECT");
      const candidateId = stringFlag(flags, "candidate");
      const isPerson =
        store.get(workspaceId, "person_resolution_candidate", candidateId)
          ?.entityType === "person_resolution_candidate";
      const result = isPerson
        ? decidePersonResolution(
            store,
            workspaceId,
            candidateId,
            decision,
            stringFlag(flags, "actor"),
            stringFlag(flags, "reason"),
            clock(flags),
          )
        : decideOrganizationAlias(
            store,
            workspaceId,
            candidateId,
            decision,
            stringFlag(flags, "actor"),
            stringFlag(flags, "reason"),
            clock(flags),
          );
      appendOperationAudit(store, workspaceId, {
        eventType: isPerson
          ? "person_resolution.decided"
          : "organization_alias.decided",
        actorId: stringFlag(flags, "actor"),
        occurredAt: clock(flags),
        subjectType: isPerson
          ? "person_resolution_candidate"
          : "organization_alias_candidate",
        subjectId: candidateId,
        payload: {
          decision,
          reviewDecisionId: result.decision.reviewDecisionId,
        },
      });
      emit(
        boolFlag(flags, "json") ? result : result.decision.reviewDecisionId,
        flags,
      );
    } else if (command === "run") {
      const output = evaluateCoverage(
        {
          workspaceId,
          config: jsonFile(stringFlag(flags, "config")),
          policy: jsonFile(stringFlag(flags, "policy")),
          runClock: clock(flags),
          actorId: stringFlag(flags, "actor", false) || "actor_operator",
        },
        store,
      );
      emit(
        boolFlag(flags, "json")
          ? output
          : `Completed ${output.auditRun.auditRunId}: ${String(output.results.length)} eligible, ${String(output.blocked.length)} blocked, ${String(output.reviewOnly.length)} review-only`,
        flags,
      );
    } else if (command === "suppress" && sub === "add") {
      const at = clock(flags),
        kind = stringFlag(flags, "kind"),
        value = stringFlag(flags, "value"),
        reasonCode = stringFlag(flags, "reason");
      const rule = suppressionRuleSchema.parse({
        workspaceId,
        suppressionRuleId: workspaceScopedId(workspaceId, "suppression", {
          kind,
          value,
          at,
        }),
        kind,
        value,
        reasonCode,
        effectiveAt: at,
        ...(stringFlag(flags, "expires", false)
          ? { expiresAt: iso.parse(stringFlag(flags, "expires")) }
          : {}),
      });
      store.put(workspaceId, { entityType: "suppression_rule", value: rule });
      appendOperationAudit(store, workspaceId, {
        eventType: "suppression.added",
        actorId: stringFlag(flags, "actor"),
        occurredAt: at,
        subjectType: "suppression_rule",
        subjectId: rule.suppressionRuleId,
        payload: { kind, value, reasonCode },
      });
      emit(rule.suppressionRuleId, flags);
    } else if (command === "suppress" && sub === "remove") {
      const id = stringFlag(flags, "suppression");
      if (!store.get(workspaceId, "suppression_rule", id))
        throw new Error("SUPPRESSION_NOT_FOUND");
      store.delete(workspaceId, "suppression_rule", id);
      appendOperationAudit(store, workspaceId, {
        eventType: "suppression.removed",
        actorId: stringFlag(flags, "actor"),
        occurredAt: clock(flags),
        subjectType: "suppression_rule",
        subjectId: id,
        payload: { reason: stringFlag(flags, "reason") },
      });
      emit(id, flags);
    } else if (command === "export" && (sub === "json" || sub === "csv")) {
      const view = stringFlag(flags, "view", false) || "safe";
      if (view !== "safe" && view !== "reviewer")
        throw new Error("VIEW_MUST_BE_SAFE_OR_REVIEWER");
      if (view === "reviewer" && !boolFlag(flags, "authorized-reviewer"))
        throw new Error("REVIEWER_EXPORT_REQUIRES_--authorized-reviewer");
      const report = buildCoverageReport(store, {
        workspaceId,
        auditRunId: stringFlag(flags, "run"),
        config: jsonFile(stringFlag(flags, "config")),
        at: clock(flags),
        view,
      });
      const out = resolve(stringFlag(flags, "out"));
      writePrivateArtifact(
        out,
        sub === "json"
          ? `${JSON.stringify(report, null, 2)}\n`
          : reportToCsv(report),
        { overwrite: boolFlag(flags, "overwrite") },
      );
      appendOperationAudit(store, workspaceId, {
        eventType: "report.exported",
        actorId: stringFlag(flags, "actor", false) || "actor_operator",
        occurredAt: clock(flags),
        subjectType: "audit_run",
        subjectId: stringFlag(flags, "run"),
        payload: {
          format: sub,
          view,
          outputPathDigest: workspaceScopedId(workspaceId, "path", out),
        },
      });
      emit(out, flags);
    } else if (command === "inspect") {
      if (sub === "audit") {
        const events = store.listAuditEvents(workspaceId);
        emit(
          boolFlag(flags, "json")
            ? { valid: verifyAuditChain(events), events }
            : JSON.stringify(
                { valid: verifyAuditChain(events), events },
                null,
                2,
              ),
          flags,
        );
      } else if (sub === "consent")
        emit(
          boolFlag(flags, "json")
            ? store.list(workspaceId, "consent").map((x) => x.value)
            : JSON.stringify(
                store.list(workspaceId, "consent").map((x) => x.value),
                null,
                2,
              ),
          flags,
        );
      else if (sub === "suppressions")
        emit(
          boolFlag(flags, "json")
            ? store.list(workspaceId, "suppression_rule").map((x) => x.value)
            : JSON.stringify(
                store.list(workspaceId, "suppression_rule").map((x) => x.value),
                null,
                2,
              ),
          flags,
        );
      else if (sub === "receipts")
        emit(
          boolFlag(flags, "json")
            ? store.list(workspaceId, "deletion_receipt").map((x) => x.value)
            : JSON.stringify(
                store.list(workspaceId, "deletion_receipt").map((x) => x.value),
                null,
                2,
              ),
          flags,
        );
      else if (["findings", "blocked", "dependencies"].includes(sub ?? "")) {
        const report = buildCoverageReport(store, {
          workspaceId,
          auditRunId: stringFlag(flags, "run"),
          config: jsonFile(stringFlag(flags, "config")),
          at: clock(flags),
          view: boolFlag(flags, "authorized-reviewer") ? "reviewer" : "safe",
        });
        const value =
          sub === "blocked"
            ? { blocked: report.blocked, review_only: report.review_only }
            : sub === "dependencies"
              ? report.findings.map((x) => ({
                  result_id: x.result_id,
                  evidence: x.evidence,
                  dependencies: x.dependencies,
                }))
              : report;
        emit(
          boolFlag(flags, "json")
            ? value
            : sub === "findings"
              ? reportToTerminal(report)
              : JSON.stringify(value, null, 2),
          flags,
        );
      } else throw new Error("UNKNOWN_INSPECT_VIEW");
    } else throw new Error("UNKNOWN_COMMAND");
  } finally {
    store.close();
  }
  return 0;
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`warm-path-audit: ${message}\n`);
    process.exitCode = 1;
  }
