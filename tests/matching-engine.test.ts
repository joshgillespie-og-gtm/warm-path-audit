import { describe, expect, it } from "vitest";
import { InMemoryWorkspaceStore } from "../src/repositories/in-memory.js";
import { SqliteWorkspaceStore } from "../src/storage/sqlite/sqlite-store.js";
import {
  evaluateCoverage,
  visibleCoverageResults,
} from "../src/matching/engine.js";
import type { WorkspaceRepository } from "../src/repositories/contracts.js";
import { contributor, consent, workspace } from "./fixtures.js";
import { canonicalJson, sha256Hex } from "../src/security/deterministic.js";

const WS = "workspace_match";
const CLOCK = "2026-09-18T00:00:00.000Z";
const hash = (v: string) => sha256Hex(v);
const config = (overrides: Record<string, unknown> = {}) => ({
  workspaceId: WS,
  configId: "config_match",
  version: "1",
  directContributorIds: ["contributor_owner"],
  icpRuleSet: {
    ruleSetId: "rules_icp",
    version: "1",
    mode: "all",
    rules: [
      {
        ruleId: "rule_industry",
        field: "industry",
        operator: "in",
        value: ["software"],
        required: true,
        weight: 100,
      },
    ],
  },
  stakeholderPersonaRuleSet: {
    ruleSetId: "rules_persona",
    version: "1",
    mode: "all",
    rules: [
      {
        ruleId: "rule_function",
        field: "function",
        operator: "in",
        value: ["sales"],
        required: true,
        weight: 50,
      },
      {
        ruleId: "rule_seniority",
        field: "seniority",
        operator: "in",
        value: ["vp"],
        required: true,
        weight: 50,
      },
    ],
  },
  coachCandidateRuleSet: {
    ruleSetId: "rules_coach",
    version: "1",
    mode: "any",
    rules: [
      {
        ruleId: "rule_coach_function",
        field: "function",
        operator: "exists",
        value: true,
        required: true,
        weight: 100,
      },
    ],
  },
  targetAccounts: [
    {
      targetAccountId: "target_north",
      organizationId: "org_target",
      priority: 1,
      attributes: { industry: "software", domain: "north.example.com" },
    },
  ],
  accountProfiles: [
    {
      organizationId: "org_icp",
      attributes: { industry: "software", domain: "icp.example.com" },
    },
    {
      organizationId: "org_target",
      attributes: { industry: "software", domain: "north.example.com" },
    },
  ],
  approvedOrganizationAliases: [],
  scoring: {
    weights: {
      accountFit: 25,
      personaFit: 20,
      relationshipConfidence: 20,
      employmentConfidence: 15,
      pathConfidence: 10,
      freshness: 10,
    },
    personaMatchedThreshold: 100,
    uncertainLowerBound: 50,
  },
  freshness: {
    currentEmploymentMaxDays: 365,
    reviewEmploymentMaxDays: 730,
    relationshipMaxDays: 365,
  },
  suppressions: [],
  exclusions: [],
  reviewPolicy: {
    uncertainPersona: "review_only_candidate",
    staleEmployment: "review_only",
    unresolvedIdentity: "block",
    unresolvedOrganization: "block",
    bAndDRequireReview: true,
    reviewReasonCode: "HUMAN_REVIEW_REQUIRED",
  },
  ...overrides,
});
const policy = (allowedCategories = ["A", "B", "C", "D"]) => ({
  workspaceId: WS,
  policyId: "policy_match",
  version: "1",
  effectiveAt: CLOCK,
  purposeId: "purpose_audit",
  allowedCategories,
  directScope: "A_ICP_FIT_INCLUDING_TARGETS_B_TARGET_LIST_ONLY",
  brokerScope: "C_D_TARGET_LIST_ONLY",
  requireBrokerIndividualConsent: true,
  networkMode: "disabled",
  externalMutations: false,
});
function seed(store: WorkspaceRepository, opts: { nearMisses?: boolean } = {}) {
  store.createWorkspace(workspace(WS));
  for (const c of [
    { id: "contributor_owner", kind: "owner" },
    { id: "contributor_broker", kind: "advisor" },
  ] as const) {
    store.put(WS, {
      entityType: "contributor",
      value: { ...contributor(WS), contributorId: c.id, kind: c.kind },
    });
    store.put(WS, {
      entityType: "consent",
      value: {
        ...consent(WS),
        consentRecordId: `consent_${c.id}`,
        contributorId: c.id,
        sourceClasses: ["connections_csv"],
      },
    });
  }
  const rows = [
    [
      "person_a",
      "org_icp",
      "contributor_owner",
      "VP Sales",
      "Sales",
      "VP",
      CLOCK,
    ],
    [
      "person_b",
      "org_target",
      "contributor_owner",
      "Operations Manager",
      "Operations",
      "Manager",
      CLOCK,
    ],
    [
      "person_c",
      "org_target",
      "contributor_broker",
      "VP Sales",
      "Sales",
      "VP",
      CLOCK,
    ],
    [
      "person_d",
      "org_target",
      "contributor_broker",
      "Finance Director",
      "Finance",
      "Director",
      CLOCK,
    ],
    ...(opts.nearMisses
      ? [
          [
            "person_stale",
            "org_target",
            "contributor_broker",
            "VP Sales",
            "Sales",
            "VP",
            "2024-01-01T00:00:00.000Z",
          ],
          [
            "person_conflict",
            "org_target",
            "contributor_broker",
            "VP Sales",
            "Sales",
            "VP",
            CLOCK,
          ],
          [
            "person_withdrawn",
            "org_target",
            "contributor_withdrawn",
            "VP Sales",
            "Sales",
            "VP",
            CLOCK,
          ],
          [
            "person_suppressed",
            "org_target",
            "contributor_broker",
            "VP Sales",
            "Sales",
            "VP",
            CLOCK,
          ],
          [
            "person_expired",
            "org_target",
            "contributor_expired",
            "VP Sales",
            "Sales",
            "VP",
            CLOCK,
          ],
          [
            "person_alias",
            "org_alias_pending",
            "contributor_broker",
            "VP Sales",
            "Sales",
            "VP",
            CLOCK,
          ],
        ]
      : []),
  ] as string[][];
  if (opts.nearMisses) {
    store.put(WS, {
      entityType: "contributor",
      value: {
        ...contributor(WS),
        contributorId: "contributor_withdrawn",
        status: "withdrawn",
      },
    });
    store.put(WS, {
      entityType: "consent",
      value: {
        ...consent(WS),
        consentRecordId: "consent_contributor_withdrawn",
        contributorId: "contributor_withdrawn",
        sourceClasses: ["connections_csv"],
        status: "withdrawn",
        withdrawnAt: CLOCK,
      },
    });
    store.put(WS, {
      entityType: "contributor",
      value: { ...contributor(WS), contributorId: "contributor_expired" },
    });
    store.put(WS, {
      entityType: "consent",
      value: {
        ...consent(WS),
        consentRecordId: "consent_contributor_expired",
        contributorId: "contributor_expired",
        sourceClasses: ["connections_csv"],
        expiresAt: CLOCK,
      },
    });
  }
  for (const row of rows) {
    const [personId, orgId, contributorId, title, fn, seniority, observedAt] =
      row as [string, string, string, string, string, string, string];
    const consentId = `consent_${contributorId}`,
      snapshotId = `snapshot_${personId}`,
      evI = `evidence_${personId}_identity`,
      evO = `evidence_${personId}_organization`,
      evE = `evidence_${personId}_employment`,
      evR = `evidence_${personId}_relationship`;
    store.put(WS, {
      entityType: "source_snapshot",
      value: {
        workspaceId: WS,
        sourceSnapshotId: snapshotId,
        contributorId,
        consentRecordId: consentId,
        sourceKind: "connections_csv",
        rawSha256: hash(`raw:${personId}`),
        idempotencyKey: hash(`key:${personId}`),
        mappingId: "mapping_match",
        mappingVersion: "1",
        importedAt: CLOCK,
        sourceObservedAt: observedAt,
        byteCount: 10,
        recordCount: 1,
        rawRetained: false,
        networkAccessed: false,
        transformVersion: "test-v1",
      },
    });
    for (const [id, claimType] of [
      [evI, "identity"],
      [evO, "organization"],
      [evE, "employment"],
      [evR, "relationship"],
    ] as const)
      store.put(WS, {
        entityType: "evidence_ref",
        value: {
          workspaceId: WS,
          evidenceRefId: id,
          sourceSnapshotId: snapshotId,
          sourceRecordId: `record_${personId}`,
          claimType,
          rowDigestSha256: hash(`row:${personId}`),
          transformVersion: "test-v1",
        },
      });
    store.put(WS, {
      entityType: "person",
      value: {
        workspaceId: WS,
        personId,
        displayName: personId,
        createdAt: CLOCK,
      },
    });
    if (!store.get(WS, "organization", orgId))
      store.put(WS, {
        entityType: "organization",
        value: {
          workspaceId: WS,
          organizationId: orgId,
          canonicalName: orgId,
          createdAt: CLOCK,
        },
      });
    store.put(WS, {
      entityType: "identity_claim",
      value: {
        workspaceId: WS,
        identityClaimId: `identity_${personId}`,
        personId,
        kind: "provider_id",
        namespace: "synthetic",
        value: personId,
        evidenceRefs: [evI],
        confidence: 1,
        observedAt,
        reviewStatus:
          personId === "person_conflict" ? "conflicted" : "approved",
      },
    });
    store.put(WS, {
      entityType: "organization_claim",
      value: {
        workspaceId: WS,
        organizationClaimId: `orgclaim_${personId}`,
        organizationId: orgId,
        kind: "domain",
        namespace: "synthetic",
        value: orgId === "org_target" ? "north.example.com" : "icp.example.com",
        evidenceRefs: [evO],
        confidence: 1,
        observedAt,
        reviewStatus: "approved",
      },
    });
    store.put(WS, {
      entityType: "employment_claim",
      value: {
        workspaceId: WS,
        employmentClaimId: `employment_${personId}`,
        personId,
        organizationId: orgId,
        title,
        function: fn,
        seniority,
        state: "current",
        evidenceRefs: [evE],
        confidence: 1,
        observedAt,
        reviewStatus: "approved",
      },
    });
    if (personId === "person_alias")
      store.put(WS, {
        entityType: "organization_alias_candidate",
        value: {
          workspaceId: WS,
          organizationAliasCandidateId: "alias_candidate_pending",
          proposedOrganizationId: orgId,
          aliasKind: "domain",
          aliasValue: "alias-pending.example.com",
          evidenceRefs: [evO],
          conflictOrganizationIds: ["org_target"],
          consequences: ["account_matching_ineligible_until_review"],
          status: "pending",
        },
      });
    store.put(WS, {
      entityType: "relationship_edge",
      value: {
        workspaceId: WS,
        relationshipEdgeId: `edge_${personId}`,
        contributorId,
        destinationPersonId: personId,
        consentRecordId: consentId,
        sourceSnapshotId: snapshotId,
        assertionKind: "contributed_direct_connection",
        observedAt,
        confidence: 1,
        evidenceRefs: [evR],
        eligible: true,
      },
    });
  }
}

describe("deterministic A-D matching engine", () => {
  it("produces exactly one exclusive A, B, C, and D with complete dependencies and pending B/D review", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    const out = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    expect(out.results.map((x) => x.category)).toEqual(["A", "B", "C", "D"]);
    expect(new Set(out.results.map((x) => x.destinationPersonId)).size).toBe(4);
    expect(out.results.find((x) => x.category === "C")?.personaOutcome).toBe(
      "matched",
    );
    expect(
      out.results.find((x) => x.category === "D")?.personaOutcome,
    ).not.toBe("matched");
    for (const r of out.results) {
      expect(r.dependencies.contributorIds.length).toBeGreaterThan(0);
      expect(r.dependencies.consentRecordIds.length).toBeGreaterThan(0);
      expect(r.dependencies.sourceSnapshotIds.length).toBeGreaterThan(0);
      expect(r.dependencies.evidenceRefIds.length).toBeGreaterThanOrEqual(4);
      expect(r.dependencies.mixedSourceRule).toBe("invalidate_entire_result");
    }
    expect(
      out.results
        .filter((x) => x.category === "A" || x.category === "B")
        .every(
          (x) =>
            !("brokerContributorId" in x) &&
            x.dependencies.relationshipEdgeIds.length === 0,
        ),
    ).toBe(true);
    expect(store.list(WS, "coverage_review_record")).toHaveLength(2);
    expect(
      store
        .list(WS, "coverage_review_record")
        .every(
          (x) =>
            x.entityType === "coverage_review_record" && !x.value.autoApproved,
        ),
    ).toBe(true);
  });
  it("is idempotent and byte-stable for identical inputs/config/clock, but policy changes create a distinct run", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    const first = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    const second = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    expect(canonicalJson(second)).toBe(canonicalJson(first));
    expect(store.list(WS, "audit_run")).toHaveLength(1);
    expect(store.listAuditEvents(WS)).toHaveLength(1);
    const changed = evaluateCoverage(
      {
        workspaceId: WS,
        config: config(),
        policy: policy(["A", "B", "C"]),
        runClock: CLOCK,
      },
      store,
    );
    expect(changed.auditRun.auditRunId).not.toBe(first.auditRun.auditRunId);
    expect(changed.auditRun.policySha256).not.toBe(first.auditRun.policySha256);
  });
  it("recomputes selectively after a suppression without deleting unrelated prior-run results", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    const first = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    const changedConfig = config({
      suppressions: [
        {
          suppressionId: "suppress_a",
          kind: "person",
          value: "person_a",
          reasonCode: "PERSON_SUPPRESSED",
          effectiveAt: CLOCK,
        },
      ],
    });
    const second = evaluateCoverage(
      {
        workspaceId: WS,
        config: changedConfig,
        policy: policy(),
        runClock: CLOCK,
      },
      store,
    );
    expect(second.auditRun.auditRunId).not.toBe(first.auditRun.auditRunId);
    expect(second.results.map((x) => x.category)).toEqual(["B", "C", "D"]);
    expect(
      store
        .listCoverageResults(WS)
        .filter((x) => x.auditRunId === first.auditRun.auditRunId),
    ).toHaveLength(4);
    expect(
      store
        .listCoverageResults(WS)
        .filter((x) => x.auditRunId === second.auditRun.auditRunId),
    ).toHaveLength(3);
  });
  it("blocks near misses regardless of high scores and suppression never leaks at display", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store, { nearMisses: true });
    const cfg = config({
      targetAccounts: [
        {
          targetAccountId: "target_north",
          organizationId: "org_target",
          priority: 1,
          attributes: { industry: "software", domain: "north.example.com" },
        },
        {
          targetAccountId: "target_alias_pending",
          organizationId: "org_alias_pending",
          priority: 2,
          attributes: {
            industry: "software",
            domain: "alias-pending.example.com",
          },
        },
      ],
      suppressions: [
        {
          suppressionId: "suppress_person",
          kind: "person",
          value: "person_suppressed",
          reasonCode: "PERSON_SUPPRESSED",
          effectiveAt: CLOCK,
        },
      ],
    });
    const out = evaluateCoverage(
      { workspaceId: WS, config: cfg, policy: policy(), runClock: CLOCK },
      store,
    );
    expect(out.results).toHaveLength(4);
    expect(out.blocked.flatMap((x) => x.reasonCodes)).toEqual(
      expect.arrayContaining([
        "EMPLOYMENT_STALE",
        "IDENTITY_UNRESOLVED_OR_CONFLICTED",
        "CONSENT_WITHDRAWN",
        "CONSENT_EXPIRED",
        "ORGANIZATION_UNRESOLVED_OR_CONFLICTED",
        "PERSON_SUPPRESSED",
      ]),
    );
    const displayCfg = config({
      suppressions: [
        {
          suppressionId: "suppress_after",
          kind: "person",
          value: "person_a",
          reasonCode: "PERSON_SUPPRESSED",
          effectiveAt: CLOCK,
        },
      ],
    });
    expect(
      visibleCoverageResults(
        store,
        WS,
        out.auditRun.auditRunId,
        displayCfg,
        CLOCK,
      ).some((x) => x.destinationPersonId === "person_a"),
    ).toBe(false);
  });
  it("does not infer a path without an explicit relationship edge", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    store.delete(WS, "relationship_edge", "edge_person_c");
    const out = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    expect(out.results.some((x) => x.category === "C")).toBe(false);
  });
  it("requires a persisted, immutable, fully bound alias approval", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store, { nearMisses: true });
    const alias = {
      aliasId: "alias_config",
      organizationAliasCandidateId: "alias_candidate_pending",
      organizationId: "org_target",
      sourceOrganizationId: "org_alias_pending",
      kind: "domain",
      value: "alias-pending.example.com",
      approvedReviewDecisionId: "review_alias",
    };
    expect(() =>
      evaluateCoverage(
        {
          workspaceId: WS,
          config: config({ approvedOrganizationAliases: [alias] }),
          policy: policy(),
          runClock: CLOCK,
        },
        store,
      ),
    ).toThrow("ORGANIZATION_ALIAS_APPROVAL_INVALID");
    const candidate = store.get(
      WS,
      "organization_alias_candidate",
      "alias_candidate_pending",
    );
    if (candidate?.entityType !== "organization_alias_candidate")
      throw new Error("fixture candidate missing");
    store.put(WS, {
      entityType: "organization_alias_candidate",
      value: {
        ...candidate.value,
        status: "approved",
        approvedCanonicalOrganizationId: "org_target",
      },
    });
    store.put(WS, {
      entityType: "review_decision",
      value: {
        workspaceId: WS,
        reviewDecisionId: "review_alias",
        subjectType: "organization_alias",
        subjectId: "alias_candidate_pending",
        actorId: "actor_owner",
        decision: "approve",
        reason: "Verified exact synthetic domain",
        decidedAt: CLOCK,
        priorState: "pending",
        organizationAliasAuthorization: {
          sourceOrganizationId: "org_alias_pending",
          canonicalOrganizationId: "org_target",
          aliasKind: "domain",
          aliasValue: "alias-pending.example.com",
        },
      },
    });
    const valid = evaluateCoverage(
      {
        workspaceId: WS,
        config: config({ approvedOrganizationAliases: [alias] }),
        policy: policy(),
        runClock: CLOCK,
      },
      store,
    );
    expect(
      valid.results.some((x) => x.destinationPersonId === "person_alias"),
    ).toBe(true);
    const storedDecision = store.get(WS, "review_decision", "review_alias");
    if (storedDecision?.entityType !== "review_decision") throw new Error();
    expect(() =>
      store.put(WS, {
        entityType: "review_decision",
        value: { ...storedDecision.value, decision: "reject" },
      }),
    ).toThrow("Immutable review_decision mutation denied");
    for (const decision of ["reject", "revoke"] as const) {
      const broken = new InMemoryWorkspaceStore();
      seed(broken, { nearMisses: true });
      const c = broken.get(
        WS,
        "organization_alias_candidate",
        "alias_candidate_pending",
      );
      if (c?.entityType !== "organization_alias_candidate") throw new Error();
      broken.put(WS, {
        entityType: "organization_alias_candidate",
        value: { ...c.value, status: "rejected" },
      });
      broken.put(WS, {
        entityType: "review_decision",
        value: {
          workspaceId: WS,
          reviewDecisionId: "review_alias",
          subjectType: "organization_alias",
          subjectId: "alias_candidate_pending",
          actorId: "actor_owner",
          decision,
          reason: "Not authorized",
          decidedAt: CLOCK,
          priorState: "pending",
        },
      });
      expect(() =>
        evaluateCoverage(
          {
            workspaceId: WS,
            config: config({ approvedOrganizationAliases: [alias] }),
            policy: policy(),
            runClock: CLOCK,
          },
          broken,
        ),
      ).toThrow("ORGANIZATION_ALIAS_APPROVAL_INVALID");
    }
  });
  it("binds workspace, policy, and every dependency consent to one purpose", () => {
    const mismatch = new InMemoryWorkspaceStore();
    seed(mismatch);
    expect(() =>
      evaluateCoverage(
        {
          workspaceId: WS,
          config: config(),
          policy: { ...policy(), purposeId: "purpose_other" },
          runClock: CLOCK,
        },
        mismatch,
      ),
    ).toThrow("POLICY_WORKSPACE_PURPOSE_MISMATCH");
    expect(() =>
      evaluateCoverage(
        {
          workspaceId: WS,
          config: config(),
          policy: { ...policy(), effectiveAt: "2026-09-19T00:00:00.000Z" },
          runClock: CLOCK,
        },
        mismatch,
      ),
    ).toThrow("POLICY_NOT_YET_EFFECTIVE");
    const consentEntity = mismatch.get(
      WS,
      "consent",
      "consent_contributor_broker",
    );
    if (consentEntity?.entityType !== "consent") throw new Error();
    expect(() =>
      mismatch.put(WS, {
        entityType: "consent",
        value: { ...consentEntity.value, purposeId: "purpose_other" },
      }),
    ).toThrow("Consent mutation or reactivation denied");
  });
  it("invalidates mixed-source results when a secondary dependency consent expires", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    store.put(WS, {
      entityType: "contributor",
      value: {
        ...contributor(WS),
        contributorId: "contributor_secondary",
        kind: "colleague",
      },
    });
    store.put(WS, {
      entityType: "consent",
      value: {
        ...consent(WS),
        consentRecordId: "consent_secondary",
        contributorId: "contributor_secondary",
        sourceClasses: ["crm_export"],
        expiresAt: CLOCK,
      },
    });
    const primarySnapshot = store.get(
      WS,
      "source_snapshot",
      "snapshot_person_c",
    );
    if (primarySnapshot?.entityType !== "source_snapshot") throw new Error();
    store.put(WS, {
      entityType: "source_snapshot",
      value: {
        ...primarySnapshot.value,
        sourceSnapshotId: "snapshot_secondary",
        contributorId: "contributor_secondary",
        consentRecordId: "consent_secondary",
        sourceKind: "crm_export",
        rawSha256: hash("secondary"),
        idempotencyKey: hash("secondary-key"),
      },
    });
    const primaryEvidence = store.get(
      WS,
      "evidence_ref",
      "evidence_person_c_employment",
    );
    if (primaryEvidence?.entityType !== "evidence_ref") throw new Error();
    store.put(WS, {
      entityType: "evidence_ref",
      value: {
        ...primaryEvidence.value,
        evidenceRefId: "evidence_secondary",
        sourceSnapshotId: "snapshot_secondary",
        rowDigestSha256: hash("secondary-row"),
      },
    });
    const employment = store.get(WS, "employment_claim", "employment_person_c");
    if (employment?.entityType !== "employment_claim") throw new Error();
    store.put(WS, {
      entityType: "employment_claim",
      value: { ...employment.value, evidenceRefs: ["evidence_secondary"] },
    });
    const out = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    expect(
      out.blocked.find((x) => x.destinationPersonId === "person_c")
        ?.reasonCodes,
    ).toContain("DEPENDENCY_CONSENT_EXPIRED");
  });
  it("unions persisted and config suppressions using source kinds at run and display", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    store.put(WS, {
      entityType: "suppression_rule",
      value: {
        workspaceId: WS,
        suppressionRuleId: "persist_source",
        kind: "source",
        value: "connections_csv",
        reasonCode: "SOURCE_KIND_SUPPRESSED",
        effectiveAt: CLOCK,
      },
    });
    const blocked = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    expect(blocked.results).toHaveLength(0);
    expect(blocked.blocked.flatMap((x) => x.reasonCodes)).toContain(
      "SOURCE_KIND_SUPPRESSED",
    );
    store.delete(WS, "suppression_rule", "persist_source");
    const emitted = evaluateCoverage(
      {
        workspaceId: WS,
        config: config(),
        policy: policy(),
        runClock: "2026-09-18T00:00:01.000Z",
      },
      store,
    );
    expect(emitted.results).toHaveLength(4);
    store.put(WS, {
      entityType: "suppression_rule",
      value: {
        workspaceId: WS,
        suppressionRuleId: "persist_source_after",
        kind: "source",
        value: "connections_csv",
        reasonCode: "SOURCE_KIND_SUPPRESSED",
        effectiveAt: CLOCK,
      },
    });
    expect(
      visibleCoverageResults(
        store,
        WS,
        emitted.auditRun.auditRunId,
        config(),
        "2026-09-18T00:00:02.000Z",
      ),
    ).toHaveLength(0);
  });
  it("hides emitted results after dependency consent withdrawal or expiry", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    const out = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    const owner = store.get(WS, "consent", "consent_contributor_owner");
    if (owner?.entityType !== "consent") throw new Error();
    store.put(WS, {
      entityType: "consent",
      value: {
        ...owner.value,
        status: "withdrawn",
        withdrawnAt: "2026-09-18T00:00:01.000Z",
      },
    });
    const visible = visibleCoverageResults(
      store,
      WS,
      out.auditRun.auditRunId,
      config(),
      "2026-09-18T00:00:02.000Z",
    );
    expect(visible.map((x) => x.category)).toEqual(["C", "D"]);
  });
  it("rejects duplicate IDs, contradictory aliases, invalid thresholds, zero weights, and inactive direct contributors", () => {
    const store = new InMemoryWorkspaceStore();
    seed(store);
    const baseline = config();
    const invalidConfigs = [
      config({
        directContributorIds: ["contributor_owner", "contributor_owner"],
      }),
      config({
        scoring: {
          ...baseline.scoring,
          uncertainLowerBound: 100,
        },
      }),
      config({
        scoring: {
          ...baseline.scoring,
          weights: {
            accountFit: 0,
            personaFit: 0,
            relationshipConfidence: 0,
            employmentConfidence: 0,
            pathConfidence: 0,
            freshness: 0,
          },
        },
      }),
      config({
        accountProfiles: [
          ...baseline.accountProfiles,
          baseline.accountProfiles[0],
        ],
      }),
    ];
    for (const cfg of invalidConfigs)
      expect(() =>
        evaluateCoverage(
          { workspaceId: WS, config: cfg, policy: policy(), runClock: CLOCK },
          store,
        ),
      ).toThrow();
    const owner = store.get(WS, "contributor", "contributor_owner");
    if (owner?.entityType !== "contributor") throw new Error();
    store.put(WS, {
      entityType: "contributor",
      value: { ...owner.value, status: "disabled" },
    });
    expect(() =>
      evaluateCoverage(
        {
          workspaceId: WS,
          config: config(),
          policy: policy(),
          runClock: CLOCK,
        },
        store,
      ),
    ).toThrow("DIRECT_CONTRIBUTOR_INACTIVE");
  });
  it("isolates workspaces and SQLite persists runs and deterministic ordering", () => {
    const store = new SqliteWorkspaceStore(":memory:");
    seed(store);
    store.createWorkspace(workspace("workspace_other"));
    expect(() =>
      evaluateCoverage(
        {
          workspaceId: "workspace_other",
          config: config(),
          policy: policy(),
          runClock: CLOCK,
        },
        store,
      ),
    ).toThrow("Cross-workspace");
    const out = evaluateCoverage(
      { workspaceId: WS, config: config(), policy: policy(), runClock: CLOCK },
      store,
    );
    expect(store.list(WS, "audit_run")).toHaveLength(1);
    expect(store.listCoverageResults(WS).map((x) => x.resultId)).toEqual(
      [...out.results]
        .sort((a, b) => a.resultId.localeCompare(b.resultId))
        .map((x) => x.resultId),
    );
    store.close();
  });
});
