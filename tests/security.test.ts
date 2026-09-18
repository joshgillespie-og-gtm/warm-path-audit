import { describe, expect, it } from "vitest";
import {
  createAuditEvent,
  verifyAuditChain,
} from "../src/security/audit-chain.js";
import {
  canonicalJson,
  workspaceScopedId,
} from "../src/security/deterministic.js";
import {
  escapeTerminalControls,
  neutralizeFormulaCell,
} from "../src/security/output.js";
import { InMemoryWorkspaceStore } from "../src/repositories/in-memory.js";
import { SqliteWorkspaceStore } from "../src/storage/sqlite/sqlite-store.js";
import { workspace } from "./fixtures.js";
describe("deterministic and safe primitives", () => {
  it("canonicalizes object key ordering and scopes IDs", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(
      workspaceScopedId("one", "person", { email: "alex@example.com" }),
    ).toBe(workspaceScopedId("one", "person", { email: "alex@example.com" }));
    expect(
      workspaceScopedId("one", "person", { email: "alex@example.com" }),
    ).not.toBe(
      workspaceScopedId("two", "person", { email: "alex@example.com" }),
    );
  });
  it.each([
    "=1+1",
    "+cmd",
    "-2",
    "@SUM(A1:A2)",
    " =1",
    "\t=1",
    "\r@x",
    "\n+x",
    "\ufeff=1",
    "\u200b=1",
    "\u2060@x",
    "\u00a0-1",
    "\u0001+x",
  ])("neutralizes formula variant %j", (value) =>
    expect(neutralizeFormulaCell(value).startsWith("'")).toBe(true),
  );
  it("removes NUL and escapes terminal controls", () => {
    expect(neutralizeFormulaCell("\u0000=1")).toBe("'=1");
    expect(escapeTerminalControls("ok\u001b[31m\n")).toBe("ok\\u001b[31m\\n");
  });
  it.each([
    ["memory", () => new InMemoryWorkspaceStore()],
    ["sqlite", () => new SqliteWorkspaceStore(":memory:")],
  ])(
    "enforces append-only audit sequence under stale concurrent appends in %s",
    (_name, makeStore) => {
      const store = makeStore();
      store.createWorkspace(workspace());
      const first = createAuditEvent({
        workspaceId: "workspace_one",
        sequence: 1,
        eventType: "first",
        actorId: "actor_owner",
        occurredAt: "2026-09-18T00:00:00.000Z",
        subjectType: "workspace",
        subjectId: "workspace_one",
        previousHash: null,
        payload: {},
      });
      const stale = createAuditEvent({
        workspaceId: "workspace_one",
        sequence: 1,
        eventType: "stale",
        actorId: "actor_owner",
        occurredAt: "2026-09-18T00:00:00.000Z",
        subjectType: "workspace",
        subjectId: "workspace_one",
        previousHash: null,
        payload: {},
      });
      store.appendAuditEvent("workspace_one", first);
      expect(() => store.appendAuditEvent("workspace_one", stale)).toThrow(
        "Invalid audit chain append",
      );
      expect(store.listAuditEvents("workspace_one")).toHaveLength(1);
      store.close();
    },
  );
  it("detects audit-chain tampering", () => {
    const first = createAuditEvent({
      workspaceId: "workspace_one",
      sequence: 1,
      eventType: "created",
      actorId: "actor_owner",
      occurredAt: "2026-09-18T00:00:00.000Z",
      subjectType: "workspace",
      subjectId: "workspace_one",
      previousHash: null,
      payload: { count: 1 },
    });
    const second = createAuditEvent({
      workspaceId: "workspace_one",
      sequence: 2,
      eventType: "reviewed",
      actorId: "actor_owner",
      occurredAt: "2026-09-18T00:01:00.000Z",
      subjectType: "result",
      subjectId: "result_1",
      previousHash: first.hash,
      payload: { decision: "approve" },
    });
    expect(verifyAuditChain([first, second])).toEqual({ valid: true });
    expect(
      verifyAuditChain([first, { ...second, subjectId: "result_tampered" }]),
    ).toMatchObject({ valid: false, index: 1 });
  });
});
