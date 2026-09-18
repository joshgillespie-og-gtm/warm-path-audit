import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CoverageResult } from "../src/domain/models.js";
import { withdrawContributorConsent } from "../src/consent/withdrawal.js";
import { parseCsvFile, type CsvMapping } from "../src/import/csv.js";
import { importCsv } from "../src/import/import-service.js";
import { InMemoryWorkspaceStore } from "../src/repositories/in-memory.js";
import { SqliteWorkspaceStore } from "../src/storage/sqlite/sqlite-store.js";
import { consent, contributor, workspace } from "./fixtures.js";

const mapping: CsvMapping = {
  delimiter: ",",
  header: {
    mode: "detect_required_headers",
    requiredSourceHeaders: ["First Name", "Last Name"],
    maxPreambleLines: 100,
  },
  columns: [
    { sourceHeader: "First Name", targetField: "first_name", required: true },
    { sourceHeader: "Last Name", targetField: "last_name", required: true },
    { sourceHeader: "Email", targetField: "email", required: false },
    { sourceHeader: "URL", targetField: "profile_url", required: false },
    { sourceHeader: "Company", targetField: "company_name", required: false },
    { sourceHeader: "Domain", targetField: "company_domain", required: false },
    { sourceHeader: "Title", targetField: "title", required: false },
    {
      sourceHeader: "Connected On",
      targetField: "connected_on",
      required: false,
    },
  ],
};
function fixture(body: string) {
  const root = mkdtempSync(join(tmpdir(), "wpa-materialize-"));
  const file = join(root, "contacts.csv");
  writeFileSync(file, body);
  return { root, file };
}
function setup(
  store: InMemoryWorkspaceStore | SqliteWorkspaceStore,
  suffix = "one",
) {
  const workspaceId = `workspace_${suffix}`;
  store.createWorkspace(workspace(workspaceId));
  store.put(workspaceId, {
    entityType: "contributor",
    value: {
      ...contributor(workspaceId),
      contributorId: `contributor_${suffix}`,
    },
  });
  store.put(workspaceId, {
    entityType: "consent",
    value: {
      ...consent(workspaceId),
      consentRecordId: `consent_${suffix}`,
      contributorId: `contributor_${suffix}`,
    },
  });
  return workspaceId;
}
function request(workspaceId: string, root: string, file: string) {
  const suffix = workspaceId.replace("workspace_", "");
  return {
    workspaceId,
    contributorId: `contributor_${suffix}`,
    consentRecordId: `consent_${suffix}`,
    sourceKind: "generic_contacts_csv",
    mappingId: "map_contacts",
    mappingVersion: "2",
    file,
    importRoots: [root],
    importedAt: "2026-10-01T00:00:00.000Z",
    mapping,
  };
}

describe("complete transactional materialization", () => {
  it("maps LinkedIn preamble rows, groups duplicates, and persists every entity class", () => {
    const { root, file } = fixture(
      "Notes:\nGenerated export\nFirst Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nAlex,Example,alex@corp.example,https://example.com/in/alex,Example Corp,example.com,VP Sales,2026-09-01\nAlex,Example,alex@corp.example,https://example.com/in/alex,Example Corp,example.com,VP Sales,2026-09-01\n",
    );
    const directory = mkdtempSync(join(tmpdir(), "wpa-reopen-"));
    const path = join(directory, "db.sqlite");
    let store = new SqliteWorkspaceStore(path);
    const workspaceId = setup(store);
    importCsv(request(workspaceId, root, file), store);
    expect(store.list(workspaceId, "person")).toHaveLength(1);
    expect(store.list(workspaceId, "organization")).toHaveLength(1);
    expect(store.list(workspaceId, "employment_claim")).toHaveLength(1);
    expect(store.list(workspaceId, "relationship_edge")).toHaveLength(1);
    expect(store.list(workspaceId, "evidence_ref")).toHaveLength(8);
    const edge = store.list(workspaceId, "relationship_edge")[0];
    expect(
      edge?.entityType === "relationship_edge" && edge.value.evidenceRefs,
    ).toHaveLength(2);
    store.close();
    store = new SqliteWorkspaceStore(path);
    for (const type of [
      "person",
      "identity_claim",
      "organization",
      "organization_claim",
      "employment_claim",
      "relationship_edge",
    ] as const)
      expect(store.list(workspaceId, type).length).toBeGreaterThan(0);
    store.close();
  });
  it("rolls back all normalized state on a late parse failure and sanitizes failure", () => {
    const { root, file } = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nAlex,Example,alex@corp.example,,,,\nBroken,row\n",
    );
    const store = new InMemoryWorkspaceStore();
    const workspaceId = setup(store);
    expect(() => importCsv(request(workspaceId, root, file), store)).toThrow(
      "COLUMN_COUNT_MISMATCH",
    );
    for (const type of [
      "source_snapshot",
      "person",
      "identity_claim",
      "organization",
      "employment_claim",
      "relationship_edge",
      "evidence_ref",
    ] as const)
      expect(store.list(workspaceId, type)).toHaveLength(0);
    const failed = store.list(workspaceId, "import_transaction")[0];
    expect(
      failed?.entityType === "import_transaction" && failed.value,
    ).toMatchObject({
      status: "failed",
      failureCodes: ["COLUMN_COUNT_MISMATCH"],
    });
    expect(JSON.stringify(failed)).not.toContain(file);
    expect(JSON.stringify(failed)).not.toContain("alex@");
  });
  it("queues ambiguous shared identity and name-only organization and isolates workspaces", () => {
    const { root, file } = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nAlex,Example,team@corp.example,,Acme,,Sales,2024-01-01\n",
    );
    const store = new InMemoryWorkspaceStore();
    const one = setup(store, "one");
    const two = setup(store, "two");
    importCsv(request(one, root, file), store);
    importCsv(request(two, root, file), store);
    expect(store.list(one, "person_resolution_candidate")).toHaveLength(1);
    expect(store.list(one, "organization_alias_candidate")).toHaveLength(1);
    const ambiguousEdge = store.list(one, "relationship_edge")[0];
    expect(
      ambiguousEdge?.entityType === "relationship_edge" &&
        ambiguousEdge.value.eligible,
    ).toBe(false);
    expect(store.list(two, "person")).toHaveLength(1);
    expect(store.list(one, "person")[0]?.value.workspaceId).toBe(one);
  });
  it("links one exact safe identifier but queues collisions without merging", () => {
    const first = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nAlex,One,alex@safe.example,,,,,\n",
    );
    const second = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nAlex,Updated,alex@safe.example,,,,,\n",
    );
    const store = new InMemoryWorkspaceStore();
    const workspaceId = setup(store);
    importCsv(request(workspaceId, first.root, first.file), store);
    importCsv(
      {
        ...request(workspaceId, second.root, second.file),
        mappingId: "map_second",
      },
      store,
    );
    expect(store.list(workspaceId, "person")).toHaveLength(1);
    const emailClaims = store
      .list(workspaceId, "identity_claim")
      .filter(
        (x) => x.entityType === "identity_claim" && x.value.kind === "email",
      );
    const original = emailClaims[0];
    if (original?.entityType !== "identity_claim") throw new Error("fixture");
    store.put(workspaceId, {
      entityType: "person",
      value: {
        workspaceId,
        personId: "collision_person",
        displayName: "Collision",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    });
    store.put(workspaceId, {
      entityType: "identity_claim",
      value: {
        ...original.value,
        identityClaimId: "collision_claim",
        personId: "collision_person",
      },
    });
    const third = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nAlex,Third,alex@safe.example,,,,,\n",
    );
    importCsv(
      {
        ...request(workspaceId, third.root, third.file),
        mappingId: "map_third",
      },
      store,
    );
    expect(store.list(workspaceId, "person_resolution_candidate")).toHaveLength(
      1,
    );
    expect(store.list(workspaceId, "person").length).toBe(3);
  });
  it("rejects unknown/duplicate targets, missing mapped values, and Unix FIFOs", () => {
    const { root, file } = fixture("Name\nAlex\n");
    expect(() =>
      parseCsvFile(
        file,
        [root],
        {
          delimiter: ",",
          header: { mode: "first_record", maxPreambleLines: 0 },
          columns: [
            {
              sourceHeader: "Name",
              targetField: "unknown" as never,
              required: true,
            },
          ],
        },
        () => {},
      ),
    ).toThrow("INVALID_MAPPING");
    expect(() =>
      parseCsvFile(
        file,
        [root],
        {
          delimiter: ",",
          header: { mode: "first_record", maxPreambleLines: 0 },
          columns: [
            { sourceHeader: "Name", targetField: "full_name", required: true },
            {
              sourceHeader: "Other",
              targetField: "full_name",
              required: false,
            },
          ],
        },
        () => {},
      ),
    ).toThrow("DUPLICATE_TARGET_FIELD");
    const missing = fixture("Name\n\n");
    const store = new InMemoryWorkspaceStore();
    const workspaceId = setup(store);
    expect(() =>
      importCsv(
        {
          ...request(workspaceId, missing.root, missing.file),
          mapping: {
            delimiter: ",",
            header: { mode: "first_record", maxPreambleLines: 0 },
            columns: [
              {
                sourceHeader: "Name",
                targetField: "full_name",
                required: true,
              },
            ],
          },
        },
        store,
      ),
    ).toThrow();
    if (process.platform !== "win32") {
      const fifo = join(root, "pipe");
      execFileSync("mkfifo", [fifo]);
      expect(() => parseCsvFile(fifo, [root], mapping, () => {})).toThrow(
        "REGULAR_FILE_REQUIRED",
      );
    }
  });
  it("streams 100k rows through disk staging without retaining raw CSV", () => {
    const { root, file } = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\n" +
        Array.from(
          { length: 100_000 },
          (_, i) => `A${String(i)},Example,,,,,,`,
        ).join("\n") +
        "\n",
    );
    let count = 0;
    const before = process.memoryUsage().heapUsed;
    const parsed = parseCsvFile(file, [root], mapping, () => {
      count++;
    });
    expect(parsed.recordCount).toBe(100_000);
    expect(count).toBe(100_000);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(
      96 * 1024 * 1024,
    );
    expect(readFileSync(file, "utf8").length).toBeGreaterThan(1_000_000);
  }, 20_000);
});

const result = (
  id: string,
  destinationPersonId: string,
  consentRecordIds: string[],
  contributorIds: string[],
  sourceSnapshotIds: string[],
  evidenceRefIds: string[],
  relationshipEdgeIds: string[],
): CoverageResult => ({
  workspaceId: "workspace_one",
  auditRunId: "run_1",
  resultId: id,
  destinationPersonId,
  canonicalAccountId: "org_1",
  category: "A",
  personaOutcome: "matched",
  candidateLabel: "potential_direct_icp_lead",
  scores: {
    accountFit: 1,
    personaFit: 1,
    relationshipConfidence: 1,
    employmentConfidence: 1,
    pathConfidence: 1,
    freshness: 1,
    reviewPriority: 1,
  },
  reasonCodes: ["TEST"],
  evidenceRefs: evidenceRefIds,
  consentDisposition: "active",
  suppressionStatus: "clear",
  dependencies: {
    contributorIds,
    consentRecordIds,
    sourceSnapshotIds,
    evidenceRefIds,
    relationshipEdgeIds,
    mixedSourceRule: "invalidate_entire_result",
  },
});

describe("selective coverage dependency withdrawal", () => {
  it("invalidates direct and broker dependencies but preserves an unrelated contributor result", () => {
    const a = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nAlex,A,alex@a.example,,,,,\n",
    );
    const b = fixture(
      "First Name,Last Name,Email,URL,Company,Domain,Title,Connected On\nBlair,B,blair@b.example,,,,,\n",
    );
    const store = new InMemoryWorkspaceStore();
    const workspaceId = setup(store, "one");
    store.put(workspaceId, {
      entityType: "contributor",
      value: {
        ...contributor(workspaceId),
        contributorId: "contributor_other",
      },
    });
    store.put(workspaceId, {
      entityType: "consent",
      value: {
        ...consent(workspaceId),
        consentRecordId: "consent_other",
        contributorId: "contributor_other",
      },
    });
    const ia = importCsv(request(workspaceId, a.root, a.file), store);
    const ib = importCsv(
      {
        ...request(workspaceId, b.root, b.file),
        contributorId: "contributor_other",
        consentRecordId: "consent_other",
        mappingId: "map_other",
      },
      store,
    );
    const people = store.list(workspaceId, "person");
    const pa = people.find(
      (x) => x.entityType === "person" && x.value.displayName === "Alex A",
    );
    const pb = people.find(
      (x) => x.entityType === "person" && x.value.displayName === "Blair B",
    );
    const ea = store
      .list(workspaceId, "evidence_ref")
      .find(
        (x) =>
          x.entityType === "evidence_ref" &&
          x.value.sourceSnapshotId === ia.sourceSnapshotId,
      );
    const eb = store
      .list(workspaceId, "evidence_ref")
      .find(
        (x) =>
          x.entityType === "evidence_ref" &&
          x.value.sourceSnapshotId === ib.sourceSnapshotId,
      );
    const edgeA = store
      .list(workspaceId, "relationship_edge")
      .find(
        (x) =>
          x.entityType === "relationship_edge" &&
          x.value.sourceSnapshotId === ia.sourceSnapshotId,
      );
    if (
      pa?.entityType !== "person" ||
      pb?.entityType !== "person" ||
      ea?.entityType !== "evidence_ref" ||
      eb?.entityType !== "evidence_ref" ||
      edgeA?.entityType !== "relationship_edge"
    )
      throw new Error("fixture");
    store.put(workspaceId, {
      entityType: "coverage_result",
      value: result(
        "direct_a",
        pa.value.personId,
        ["consent_one"],
        ["contributor_one"],
        [ia.sourceSnapshotId],
        [ea.value.evidenceRefId],
        [],
      ),
    });
    store.put(workspaceId, {
      entityType: "coverage_result",
      value: {
        ...result(
          "broker_mixed",
          pa.value.personId,
          ["consent_one", "consent_other"],
          ["contributor_one", "contributor_other"],
          [ia.sourceSnapshotId, ib.sourceSnapshotId],
          [ea.value.evidenceRefId, eb.value.evidenceRefId],
          [edgeA.value.relationshipEdgeId],
        ),
        category: "C",
        personaOutcome: "matched",
        candidateLabel: "broker_path_to_target_stakeholder",
        brokerContributorId: "contributor_one",
        relationshipEdgeId: edgeA.value.relationshipEdgeId,
      },
    });
    store.put(workspaceId, {
      entityType: "coverage_result",
      value: result(
        "unrelated_b",
        pb.value.personId,
        ["consent_other"],
        ["contributor_other"],
        [ib.sourceSnapshotId],
        [eb.value.evidenceRefId],
        [],
      ),
    });
    const receipt = withdrawContributorConsent(
      store,
      workspaceId,
      "consent_one",
      "actor",
      "request",
      "2026-10-02T00:00:00.000Z",
    );
    expect(receipt.counts["results"]).toBe(2);
    expect(
      store.listCoverageResults(workspaceId).map((x) => x.resultId),
    ).toEqual(["unrelated_b"]);
  });
});
