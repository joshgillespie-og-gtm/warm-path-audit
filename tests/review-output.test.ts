import { describe, expect, it } from "vitest";
import { decideOrganizationAlias } from "../src/resolution/review.js";
import { InMemoryWorkspaceStore } from "../src/repositories/in-memory.js";
import { escapeTerminalControls } from "../src/security/output.js";
import { workspace } from "./fixtures.js";
describe("review decisions and safe output", () => {
  it("records an explicit workspace-scoped alias approval and its consequence", () => {
    const store = new InMemoryWorkspaceStore();
    store.createWorkspace(workspace());
    store.put("workspace_one", {
      entityType: "organization",
      value: {
        workspaceId: "workspace_one",
        organizationId: "org_1",
        canonicalName: "Example Corp",
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    });
    store.put("workspace_one", {
      entityType: "organization_alias_candidate",
      value: {
        workspaceId: "workspace_one",
        organizationAliasCandidateId: "alias_1",
        proposedOrganizationId: "org_1",
        aliasKind: "name",
        aliasValue: "ExampleCo",
        evidenceRefs: ["evidence_1"],
        conflictOrganizationIds: [],
        consequences: ["future exact alias claims may resolve to org_1"],
        status: "pending",
      },
    });
    const result = decideOrganizationAlias(
      store,
      "workspace_one",
      "alias_1",
      "approve",
      "actor_owner",
      "Verified by workspace owner",
      "2026-09-18T01:00:00.000Z",
    );
    expect(result).toMatchObject({
      candidate: { status: "approved" },
      decision: {
        actorId: "actor_owner",
        reason: "Verified by workspace owner",
      },
    });
    expect(store.list("workspace_one", "organization_claim")).toHaveLength(1);
    expect(() =>
      decideOrganizationAlias(
        store,
        "workspace_one",
        "alias_1",
        "reject",
        "actor_owner",
        "changed",
        "2026-09-18T02:00:00.000Z",
      ),
    ).toThrow("ALIAS_DECISION_ALREADY_RECORDED");
  });
  it("escapes hostile terminal details without echoing controls", () => {
    expect(escapeTerminalControls("bad\u001b[2J\npath\tvalue")).toBe(
      "bad\\u001b[2J\\npath\\tvalue",
    );
  });
});
