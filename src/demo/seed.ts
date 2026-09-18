import type { WorkspaceRepository } from "../repositories/contracts.js";
import { sha256Hex } from "../security/deterministic.js";

export const DEMO_WORKSPACE = "workspace_demo";
export const DEMO_CLOCK = "2026-09-18T12:00:00.000Z";
const h = (value: string) => sha256Hex(value);
export const demoPolicy = {
  workspaceId: DEMO_WORKSPACE,
  policyId: "policy_demo",
  version: "1",
  effectiveAt: DEMO_CLOCK,
  purposeId: "purpose_network_coverage_audit",
  allowedCategories: ["A", "B", "C", "D"],
  directScope: "A_ICP_FIT_INCLUDING_TARGETS_B_TARGET_LIST_ONLY",
  brokerScope: "C_D_TARGET_LIST_ONLY",
  requireBrokerIndividualConsent: true,
  networkMode: "disabled",
  externalMutations: false,
};
export const demoConfig = {
  workspaceId: DEMO_WORKSPACE,
  configId: "config_demo",
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
        ruleId: "rule_function_exists",
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
      targetAccountId: "target_northstar",
      organizationId: "org_northstar",
      priority: 1,
      attributes: { industry: "software", domain: "northstar.example.com" },
    },
  ],
  accountProfiles: [
    {
      organizationId: "org_lantern",
      attributes: { industry: "software", domain: "lantern.example.com" },
    },
    {
      organizationId: "org_northstar",
      attributes: { industry: "software", domain: "northstar.example.com" },
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
};

export function seedSyntheticDemo(store: WorkspaceRepository): void {
  store.createWorkspace({
    workspaceId: DEMO_WORKSPACE,
    name: "Synthetic Warm Path Demo",
    ownerActorId: "actor_demo",
    purposeId: "purpose_network_coverage_audit",
    policyVersion: "1",
    createdAt: DEMO_CLOCK,
  });
  for (const item of [
    { id: "contributor_owner", name: "Demo Owner", kind: "owner" },
    { id: "contributor_broker", name: "Demo Advisor", kind: "advisor" },
  ] as const) {
    store.put(DEMO_WORKSPACE, {
      entityType: "contributor",
      value: {
        workspaceId: DEMO_WORKSPACE,
        contributorId: item.id,
        displayName: item.name,
        kind: item.kind,
        status: "active",
        createdAt: DEMO_CLOCK,
      },
    });
    store.put(DEMO_WORKSPACE, {
      entityType: "consent",
      value: {
        workspaceId: DEMO_WORKSPACE,
        consentRecordId: `consent_${item.id}`,
        contributorId: item.id,
        authorizationBasis: "individual_consent",
        purposeId: "purpose_network_coverage_audit",
        noticeVersion: "1",
        sourceClasses: ["synthetic_connections_csv"],
        allowedCategories: ["A", "B", "C", "D"],
        brokerDisclosure:
          item.id === "contributor_broker"
            ? "authorized_reviewers"
            : "redacted_in_exports",
        sanitizedExportAllowed: true,
        grantedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
        status: "active",
        retentionPolicyId: "retention_demo",
        grantMethod: "synthetic_demo",
        noticeState: "acknowledged",
      },
    });
  }
  const rows = [
    [
      "person_alex",
      "Alex Example",
      "org_lantern",
      "Lantern Labs",
      "contributor_owner",
      "VP Sales",
      "sales",
      "vp",
      DEMO_CLOCK,
    ],
    [
      "person_blair",
      "Blair Example",
      "org_northstar",
      "Northstar Systems",
      "contributor_owner",
      "Operations Manager",
      "operations",
      "manager",
      DEMO_CLOCK,
    ],
    [
      "person_casey",
      "Casey Example",
      "org_northstar",
      "Northstar Systems",
      "contributor_broker",
      "VP Sales",
      "sales",
      "vp",
      DEMO_CLOCK,
    ],
    [
      "person_devon",
      "Devon Example",
      "org_northstar",
      "Northstar Systems",
      "contributor_broker",
      "Finance Director",
      "finance",
      "director",
      DEMO_CLOCK,
    ],
    [
      "person_stale",
      "Stale Example",
      "org_northstar",
      "Northstar Systems",
      "contributor_broker",
      "VP Sales",
      "sales",
      "vp",
      "2024-01-01T00:00:00.000Z",
    ],
    [
      "person_conflicted",
      "Conflict Example",
      "org_northstar",
      "Northstar Systems",
      "contributor_broker",
      "VP Sales",
      "sales",
      "vp",
      DEMO_CLOCK,
    ],
  ] as const;
  for (const [
    personId,
    name,
    orgId,
    orgName,
    contributorId,
    title,
    fn,
    seniority,
    observedAt,
  ] of rows) {
    const consentRecordId = `consent_${contributorId}`,
      snapshotId = `snapshot_${personId}`;
    store.put(DEMO_WORKSPACE, {
      entityType: "source_snapshot",
      value: {
        workspaceId: DEMO_WORKSPACE,
        sourceSnapshotId: snapshotId,
        contributorId,
        consentRecordId,
        sourceKind: "synthetic_connections_csv",
        rawSha256: h(`raw:${personId}`),
        idempotencyKey: h(`key:${personId}`),
        mappingId: "mapping_demo",
        mappingVersion: "1",
        importedAt: DEMO_CLOCK,
        sourceObservedAt: observedAt,
        byteCount: 100,
        recordCount: 1,
        rawRetained: false,
        networkAccessed: false,
        transformVersion: "demo-v1",
      },
    });
    const refs = {
      identity: `evidence_${personId}_identity`,
      organization: `evidence_${personId}_organization`,
      employment: `evidence_${personId}_employment`,
      relationship: `evidence_${personId}_relationship`,
    };
    for (const [claimType, evidenceRefId] of Object.entries(refs) as [
      keyof typeof refs,
      string,
    ][])
      store.put(DEMO_WORKSPACE, {
        entityType: "evidence_ref",
        value: {
          workspaceId: DEMO_WORKSPACE,
          evidenceRefId,
          sourceSnapshotId: snapshotId,
          sourceRecordId: `record_${personId}`,
          claimType,
          rowDigestSha256: h(`row:${personId}`),
          transformVersion: "demo-v1",
        },
      });
    store.put(DEMO_WORKSPACE, {
      entityType: "person",
      value: {
        workspaceId: DEMO_WORKSPACE,
        personId,
        displayName: name,
        createdAt: DEMO_CLOCK,
      },
    });
    if (!store.get(DEMO_WORKSPACE, "organization", orgId))
      store.put(DEMO_WORKSPACE, {
        entityType: "organization",
        value: {
          workspaceId: DEMO_WORKSPACE,
          organizationId: orgId,
          canonicalName: orgName,
          createdAt: DEMO_CLOCK,
        },
      });
    store.put(DEMO_WORKSPACE, {
      entityType: "identity_claim",
      value: {
        workspaceId: DEMO_WORKSPACE,
        identityClaimId: `identity_${personId}`,
        personId,
        kind: "provider_id",
        namespace: "synthetic",
        value: personId,
        evidenceRefs: [refs.identity],
        confidence: 1,
        observedAt,
        reviewStatus:
          personId === "person_conflicted" ? "conflicted" : "approved",
      },
    });
    store.put(DEMO_WORKSPACE, {
      entityType: "organization_claim",
      value: {
        workspaceId: DEMO_WORKSPACE,
        organizationClaimId: `orgclaim_${personId}`,
        organizationId: orgId,
        kind: "domain",
        namespace: "synthetic",
        value:
          orgId === "org_lantern"
            ? "lantern.example.com"
            : "northstar.example.com",
        evidenceRefs: [refs.organization],
        confidence: 1,
        observedAt,
        reviewStatus: "approved",
      },
    });
    store.put(DEMO_WORKSPACE, {
      entityType: "employment_claim",
      value: {
        workspaceId: DEMO_WORKSPACE,
        employmentClaimId: `employment_${personId}`,
        personId,
        organizationId: orgId,
        title,
        function: fn,
        seniority,
        state: "current",
        evidenceRefs: [refs.employment],
        confidence: 1,
        observedAt,
        reviewStatus: "approved",
      },
    });
    store.put(DEMO_WORKSPACE, {
      entityType: "relationship_edge",
      value: {
        workspaceId: DEMO_WORKSPACE,
        relationshipEdgeId: `edge_${personId}`,
        contributorId,
        destinationPersonId: personId,
        consentRecordId,
        sourceSnapshotId: snapshotId,
        assertionKind: "contributed_direct_connection",
        observedAt,
        confidence: 1,
        evidenceRefs: [refs.relationship],
        eligible: true,
      },
    });
  }
}
