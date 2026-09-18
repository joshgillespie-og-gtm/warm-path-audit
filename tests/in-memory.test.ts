import { describe, expect, it } from "vitest";
import { InMemoryWorkspaceStore } from "../src/repositories/in-memory.js";
import { consent, contributor, person, workspace } from "./fixtures.js";
describe("in-memory repository isolation", () => {
  it("keeps identical local IDs isolated and denies cross-workspace writes", () => {
    const store = new InMemoryWorkspaceStore();
    store.createWorkspace(workspace("one"));
    store.createWorkspace(workspace("two"));
    store.put("one", { entityType: "person", value: person("one") });
    store.put("two", { entityType: "person", value: person("two") });
    expect(store.get("one", "person", "person_alex")).toMatchObject({
      value: { workspaceId: "one" },
    });
    expect(store.get("two", "person", "person_alex")).toMatchObject({
      value: { workspaceId: "two" },
    });
    expect(() =>
      store.put("one", { entityType: "person", value: person("two") }),
    ).toThrow(/Cross-workspace/);
  });
  it("filters relationship edges by current consent", () => {
    const store = new InMemoryWorkspaceStore();
    store.createWorkspace(workspace());
    store.put("workspace_one", {
      entityType: "contributor",
      value: contributor(),
    });
    store.put("workspace_one", { entityType: "person", value: person() });
    store.put("workspace_one", { entityType: "consent", value: consent() });
    store.put("workspace_one", {
      entityType: "relationship_edge",
      value: {
        workspaceId: "workspace_one",
        relationshipEdgeId: "edge_1",
        contributorId: "contributor_casey",
        destinationPersonId: "person_alex",
        consentRecordId: "consent_casey",
        sourceSnapshotId: "snapshot_1",
        assertionKind: "contributed_direct_connection",
        observedAt: "2026-09-18T00:00:00.000Z",
        confidence: 0.9,
        evidenceRefs: ["evidence_1"],
        eligible: true,
      },
    });
    expect(
      store.listEligibleEdges(
        "workspace_one",
        new Date("2026-10-01T00:00:00Z"),
      ),
    ).toHaveLength(1);
    expect(
      store.listEligibleEdges(
        "workspace_one",
        new Date("2028-01-01T00:00:00Z"),
      ),
    ).toHaveLength(0);
  });
});
