import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withdrawContributorConsent } from "../src/consent/withdrawal.js";
import { importCsv } from "../src/import/import-service.js";
import { InMemoryWorkspaceStore } from "../src/repositories/in-memory.js";
import { SqliteWorkspaceStore } from "../src/storage/sqlite/sqlite-store.js";
import { consent, contributor, person, workspace } from "./fixtures.js";
const mapping = {
  delimiter: "," as const,
  header: { mode: "first_record" as const, maxPreambleLines: 0 },
  columns: [
    { sourceHeader: "Name", targetField: "full_name" as const, required: true },
  ],
};
const setup = <T extends InMemoryWorkspaceStore | SqliteWorkspaceStore>(
  store: T,
): T => {
  store.createWorkspace(workspace());
  store.put("workspace_one", {
    entityType: "contributor",
    value: contributor(),
  });
  store.put("workspace_one", {
    entityType: "consent",
    value: consent("workspace_one", {
      sourceClasses: ["generic_contacts_csv"],
    }),
  });
  return store;
};
const runImport = (store: InMemoryWorkspaceStore | SqliteWorkspaceStore) => {
  const root = mkdtempSync(join(tmpdir(), "wpa-consent-"));
  const file = join(root, "data.csv");
  writeFileSync(file, "Name\nAlex Example\n");
  return importCsv(
    {
      workspaceId: "workspace_one",
      contributorId: "contributor_casey",
      consentRecordId: "consent_casey",
      sourceKind: "generic_contacts_csv",
      mappingId: "map_1",
      mappingVersion: "1",
      file,
      importRoots: [root],
      importedAt: "2026-10-01T00:00:00.000Z",
      mapping,
    },
    store,
  );
};
describe("consent lifecycle and durable import entities", () => {
  it("blocks expired consent and transactionally rolls back failed writes", () => {
    const store = setup(new InMemoryWorkspaceStore());
    const root = mkdtempSync(join(tmpdir(), "wpa-expired-"));
    const file = join(root, "data.csv");
    writeFileSync(file, "Name\nAlex\n");
    store.put("workspace_one", {
      entityType: "consent",
      value: consent("workspace_one", {
        sourceClasses: ["generic_contacts_csv"],
        expiresAt: "2026-09-19T00:00:00.000Z",
      }),
    });
    expect(() =>
      importCsv(
        {
          workspaceId: "workspace_one",
          contributorId: "contributor_casey",
          consentRecordId: "consent_casey",
          sourceKind: "generic_contacts_csv",
          mappingId: "m",
          mappingVersion: "1",
          file,
          importRoots: [root],
          importedAt: "2026-10-01T00:00:00.000Z",
          mapping,
        },
        store,
      ),
    ).toThrow("CONSENT_EXPIRED");
    expect(store.list("workspace_one", "source_snapshot")).toHaveLength(0);
    expect(() =>
      store.transact("workspace_one", (tx) => {
        tx.put({ entityType: "person", value: person() });
        throw new Error("fatal");
      }),
    ).toThrow("fatal");
    expect(store.list("workspace_one", "person")).toHaveLength(0);
  });
  it("withdraws consent, removes dependent edges/snapshots/evidence, and emits minimal receipt", () => {
    const store = setup(new InMemoryWorkspaceStore());
    const imported = runImport(store);
    store.put("workspace_one", { entityType: "person", value: person() });
    const evidence = store.list("workspace_one", "evidence_ref")[0];
    if (evidence?.entityType !== "evidence_ref") throw new Error("fixture");
    store.put("workspace_one", {
      entityType: "relationship_edge",
      value: {
        workspaceId: "workspace_one",
        relationshipEdgeId: "edge_1",
        contributorId: "contributor_casey",
        destinationPersonId: "person_alex",
        consentRecordId: "consent_casey",
        sourceSnapshotId: imported.sourceSnapshotId,
        assertionKind: "contributed_direct_connection",
        observedAt: "2026-10-01T00:00:00.000Z",
        confidence: 1,
        evidenceRefs: [evidence.value.evidenceRefId],
        eligible: true,
      },
    });
    const receipt = withdrawContributorConsent(
      store,
      "workspace_one",
      "consent_casey",
      "actor_owner",
      "requested",
      "2026-10-02T00:00:00.000Z",
    );
    expect(receipt).toMatchObject({
      personalValuesIncluded: false,
      otherContributorIdsIncluded: false,
      counts: { edges: 2, snapshots: 1 },
    });
    expect(
      store.listEligibleEdges(
        "workspace_one",
        new Date("2026-10-02T00:00:00Z"),
      ),
    ).toHaveLength(0);
    expect(store.list("workspace_one", "source_snapshot")).toHaveLength(0);
    expect(() => runImport(store)).toThrow("CONSENT_WITHDRAWN");
  });
  it("persists and runtime-validates expanded entities across SQLite reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "wpa-sqlite-import-"));
    const path = join(directory, "db.sqlite");
    let store = setup(new SqliteWorkspaceStore(path));
    const imported = runImport(store);
    expect(store.list("workspace_one", "source_snapshot")).toHaveLength(1);
    expect(store.list("workspace_one", "evidence_ref")).toHaveLength(4);
    expect(store.list("workspace_one", "import_transaction")).toHaveLength(1);
    store.close();
    store = new SqliteWorkspaceStore(path);
    expect(
      store.get("workspace_one", "source_snapshot", imported.sourceSnapshotId),
    ).toBeDefined();
    expect(() =>
      store.put("workspace_one", {
        entityType: "source_snapshot",
        value: { bad: true },
      } as never),
    ).toThrow();
    store.close();
  });
});
