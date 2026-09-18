import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InMemoryWorkspaceStore,
  LocalFixtureAdapter,
  SqliteWorkspaceStore,
  consentRecordSchema,
  ingestAdapter,
  type AdapterAuthorization,
  type ReadOnlyAdapter,
} from "../src/index.js";
import { importCsv } from "../src/import/import-service.js";
import { assertResetPath } from "../src/cli/path-safety.js";
import { writePrivateArtifact } from "../src/reporting/report.js";
import { consent, contributor, workspace } from "./fixtures.js";

const AT = "2026-09-18T00:00:00.000Z";
const mapping = {
  delimiter: "," as const,
  header: { mode: "first_record" as const, maxPreambleLines: 0 },
  columns: [
    { sourceHeader: "Name", targetField: "full_name" as const, required: true },
  ],
};
const setupImport = (store: InMemoryWorkspaceStore | SqliteWorkspaceStore) => {
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
};

describe("adversarial audit regressions", () => {
  it.each([new InMemoryWorkspaceStore(), new SqliteWorkspaceStore(":memory:")])(
    "prevents consent widening/reactivation and immutable source rebinding",
    (store) => {
      setupImport(store);
      const original = store.getConsent("workspace_one", "consent_casey");
      if (!original) throw new Error("fixture");
      expect(() =>
        store.put("workspace_one", {
          entityType: "consent",
          value: {
            ...original,
            sourceClasses: [...original.sourceClasses, "email_metadata"],
          },
        }),
      ).toThrow("Consent mutation or reactivation denied");
      store.put("workspace_one", {
        entityType: "consent",
        value: { ...original, status: "withdrawn", withdrawnAt: AT },
      });
      expect(() =>
        store.put("workspace_one", { entityType: "consent", value: original }),
      ).toThrow("Consent mutation or reactivation denied");
      store.close();
    },
  );

  it("rejects imports outside contributor, purpose, and source consent scope", () => {
    const store = new InMemoryWorkspaceStore();
    setupImport(store);
    const root = mkdtempSync(join(tmpdir(), "wpa-audit-import-"));
    const file = join(root, "input.csv");
    writeFileSync(file, "Name\nAlex Example\n");
    const request = {
      workspaceId: "workspace_one",
      contributorId: "contributor_casey",
      consentRecordId: "consent_casey",
      sourceKind: "email_metadata",
      mappingId: "mapping_one",
      mappingVersion: "1",
      file,
      importRoots: [root],
      importedAt: "2026-10-01T00:00:00.000Z",
      mapping,
    };
    expect(() => importCsv(request, store)).toThrow(
      "CONSENT_SOURCE_SCOPE_DENIED",
    );
    const c = store.get("workspace_one", "contributor", "contributor_casey");
    if (c?.entityType !== "contributor") throw new Error("fixture");
    store.put("workspace_one", {
      entityType: "contributor",
      value: { ...c.value, status: "disabled" },
    });
    expect(() =>
      importCsv({ ...request, sourceKind: "generic_contacts_csv" }, store),
    ).toThrow("CONTRIBUTOR_INACTIVE");
  });

  it("validates consent chronology and terminal status consistency", () => {
    expect(() =>
      consentRecordSchema.parse(
        consent("workspace_one", {
          grantedAt: "2027-01-01T00:00:00.000Z",
          expiresAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    ).toThrow();
    expect(() =>
      consentRecordSchema.parse(
        consent("workspace_one", { status: "withdrawn" }),
      ),
    ).toThrow();
  });

  it("rejects parent symlink escapes, hardlink overwrites, and hardlink reset", () => {
    const root = mkdtempSync(join(tmpdir(), "wpa-audit-path-"));
    const outside = mkdtempSync(join(tmpdir(), "wpa-audit-outside-"));
    symlinkSync(outside, join(root, "linked"));
    expect(() =>
      writePrivateArtifact(join(root, "linked", "report.json"), "secret", {
        allowedRoot: root,
      }),
    ).toThrow("OUTPUT_PARENT_SYMLINK_ESCAPE");
    const target = join(outside, "target");
    const hard = join(root, "hard.json");
    writeFileSync(target, "do-not-change");
    linkSync(target, hard);
    expect(() =>
      writePrivateArtifact(hard, "changed", { overwrite: true }),
    ).toThrow("OUTPUT_MUST_BE_SINGLE_LINK_REGULAR_FILE");
    expect(readFileSync(target, "utf8")).toBe("do-not-change");
    const db = join(root, "workspace.db");
    linkSync(target, db);
    expect(() => assertResetPath(db, root)).toThrow("RESET_HARDLINK_REJECTED");
  });

  it("rejects adapter page claims that violate runtime page boundaries", () => {
    const store = new InMemoryWorkspaceStore();
    const ws = "workspace_adapter_audit";
    store.createWorkspace(workspace(ws));
    store.put(ws, { entityType: "contributor", value: contributor(ws) });
    store.put(ws, {
      entityType: "consent",
      value: consent(ws, { sourceClasses: ["crm_metadata"] }),
    });
    const authorization: AdapterAuthorization = {
      workspaceId: ws,
      adapterAuthorizationId: "auth_fixture",
      adapterId: "fixture",
      provider: "fixture",
      providerTenantId: "tenant",
      authorizationBasis: "authorized_local_fixture",
      purposeId: "purpose_audit",
      capabilities: ["read_crm_metadata"],
      fieldAllowlist: ["person_name"],
      timeWindow: { from: AT, to: "2026-09-19T00:00:00.000Z" },
      retentionDays: 1,
      authorizedAt: AT,
      expiresAt: "2026-09-19T00:00:00.000Z",
      status: "active",
      credentialsEmbedded: false,
    };
    const base = new LocalFixtureAdapter({
      adapterId: "fixture",
      provider: "fixture",
      capability: "read_crm_metadata",
      supportedFields: ["person_name"],
      records: [],
    });
    const networkLie = {
      declaration: base.declaration,
      readPage: () => ({
        records: [],
        nextCursor: null,
        networkAccessed: true,
      }),
    } as unknown as ReadOnlyAdapter;
    expect(() =>
      ingestAdapter(
        {
          workspaceId: ws,
          contributorId: "contributor_casey",
          consentRecordId: "consent_casey",
          purposeId: "purpose_audit",
          authorization,
          adapter: networkLie,
          at: AT,
          actorId: "actor_owner",
        },
        store,
      ),
    ).toThrow();
  });

  it("keeps SQLite database permissions private", () => {
    const root = mkdtempSync(join(tmpdir(), "wpa-audit-mode-"));
    mkdirSync(join(root, "db"), { mode: 0o777 });
    const path = join(root, "db", "workspace.sqlite");
    const store = new SqliteWorkspaceStore(path);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    store.close();
  });
});
