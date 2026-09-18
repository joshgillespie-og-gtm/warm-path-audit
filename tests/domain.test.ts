import { describe, expect, it } from "vitest";
import {
  consentRecordSchema,
  coverageResultSchema,
  evaluateConsent,
  workspaceSchema,
} from "../src/domain/models.js";
import { consent, workspace } from "./fixtures.js";
const common = {
  workspaceId: "workspace_one",
  auditRunId: "run_1",
  resultId: "result_1",
  destinationPersonId: "person_alex",
  canonicalAccountId: "account_northstar",
  dependencies: {
    contributorIds: ["contributor_casey"],
    consentRecordIds: ["consent_casey"],
    sourceSnapshotIds: ["snapshot_1"],
    evidenceRefIds: ["evidence_1"],
    relationshipEdgeIds: [],
    mixedSourceRule: "invalidate_entire_result" as const,
  },
  scores: {
    accountFit: 100,
    personaFit: 90,
    relationshipConfidence: 90,
    employmentConfidence: 90,
    pathConfidence: 90,
    freshness: 90,
    reviewPriority: 90,
  },
  reasonCodes: ["HUMAN_REVIEW_REQUIRED"],
  evidenceRefs: ["evidence_1"],
  consentDisposition: "active" as const,
  suppressionStatus: "clear" as const,
};
describe("runtime contracts", () => {
  it("rejects unknown fields and malformed timestamps", () => {
    expect(() =>
      workspaceSchema.parse({ ...workspace(), extra: true }),
    ).toThrow();
    expect(() =>
      consentRecordSchema.parse({ ...consent(), expiresAt: "tomorrow" }),
    ).toThrow();
  });
  it("enforces A-D category semantics", () => {
    expect(
      coverageResultSchema.parse({
        ...common,
        category: "A",
        personaOutcome: "matched",
        candidateLabel: "potential_direct_icp_lead",
      }).category,
    ).toBe("A");
    expect(() =>
      coverageResultSchema.parse({
        ...common,
        category: "C",
        personaOutcome: "matched",
        candidateLabel: "broker_path_to_target_stakeholder",
      }),
    ).toThrow();
    expect(() =>
      coverageResultSchema.parse({
        ...common,
        category: "D",
        personaOutcome: "matched",
        candidateLabel:
          "broker_path_to_target_account_coach_champion_candidate",
        brokerContributorId: "contributor_casey",
        relationshipEdgeId: "edge_1",
      }),
    ).toThrow();
  });
  it("evaluates expiry and withdrawal at use time", () => {
    expect(evaluateConsent(consent(), new Date("2026-10-01T00:00:00Z"))).toBe(
      "active",
    );
    expect(evaluateConsent(consent(), new Date("2027-09-18T00:00:00Z"))).toBe(
      "expired",
    );
    expect(
      evaluateConsent(
        consent("workspace_one", {
          withdrawnAt: "2026-10-01T00:00:00.000Z",
          status: "withdrawn",
        }),
        new Date("2026-09-20T00:00:00Z"),
      ),
    ).toBe("withdrawn");
  });
});
