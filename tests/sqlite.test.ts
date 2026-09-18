import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteWorkspaceStore } from "../src/storage/sqlite/sqlite-store.js";
import { consent, contributor, person, workspace } from "./fixtures.js";
describe("SQLite reference store", () => {
  it("persists data, scopes composite keys, and uses restrictive permissions", () => {
    const directory = mkdtempSync(join(tmpdir(), "warm-path-test-"));
    const path = join(directory, "test.sqlite");
    let store = new SqliteWorkspaceStore(path);
    store.createWorkspace(workspace("one"));
    store.createWorkspace(workspace("two"));
    store.put("one", { entityType: "person", value: person("one") });
    store.put("two", { entityType: "person", value: person("two") });
    store.close();
    expect(statSync(path).mode & 0o777).toBe(0o600);
    store = new SqliteWorkspaceStore(path);
    expect(store.get("one", "person", "person_alex")).toMatchObject({
      value: { workspaceId: "one" },
    });
    expect(store.get("two", "person", "person_alex")).toMatchObject({
      value: { workspaceId: "two" },
    });
    store.close();
  });
  it("enforces workspace-scoped references and transaction rollback", () => {
    const store = new SqliteWorkspaceStore(":memory:");
    store.createWorkspace(workspace());
    store.put("workspace_one", {
      entityType: "contributor",
      value: contributor(),
    });
    expect(() =>
      store.put("workspace_one", {
        entityType: "consent",
        value: consent("workspace_one", { contributorId: "missing" }),
      }),
    ).toThrow(/Missing workspace-scoped contributor/);
    expect(() =>
      store.transact("workspace_one", (tx) => {
        tx.put({ entityType: "person", value: person() });
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(store.get("workspace_one", "person", "person_alex")).toBeUndefined();
    store.close();
  });
  it("has inspectable migrations matching the compiled migration set", () => {
    expect(
      readFileSync(
        new URL(
          "../src/storage/sqlite/migrations/001_initial.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ).toContain("FOREIGN KEY (workspace_id)");
    expect(
      readFileSync(
        new URL(
          "../src/storage/sqlite/migrations/002_import_resolution_entities.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ).toContain("organization_alias_candidate");
  });
});
