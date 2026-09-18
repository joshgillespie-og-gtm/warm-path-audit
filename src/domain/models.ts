import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const iso = z.iso.datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const confidence = z.number().min(0).max(1);
const score = z.number().min(0).max(100);
const base = { workspaceId: id };
const evidencePointer = {
  evidenceRefs: z.array(id),
  confidence,
  observedAt: iso,
  reviewStatus: z.enum(["unreviewed", "approved", "rejected", "conflicted"]),
};

export const workspaceSchema = z.strictObject({
  ...base,
  workspaceId: id,
  name: z.string().min(1).max(200),
  ownerActorId: id,
  purposeId: id,
  policyVersion: z.string().min(1),
  createdAt: iso,
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const contributorSchema = z.strictObject({
  ...base,
  contributorId: id,
  displayName: z.string().min(1).max(200),
  kind: z.enum([
    "owner",
    "colleague",
    "advisor",
    "investor",
    "customer",
    "other",
  ]),
  status: z.enum(["active", "withdrawn", "disabled"]),
  createdAt: iso,
});
export type Contributor = z.infer<typeof contributorSchema>;

export const consentRecordSchema = z
  .strictObject({
    ...base,
    consentRecordId: id,
    contributorId: id,
    authorizationBasis: z.enum(["individual_consent", "organizational_policy"]),
    purposeId: id,
    noticeVersion: z.string().min(1),
    sourceClasses: z.array(z.string().min(1)).min(1),
    allowedCategories: z.array(z.enum(["A", "B", "C", "D"])).min(1),
    brokerDisclosure: z.enum([
      "authorized_reviewers",
      "redacted_in_exports",
      "not_disclosed",
    ]),
    sanitizedExportAllowed: z.boolean(),
    grantedAt: iso,
    expiresAt: iso,
    withdrawnAt: iso.optional(),
    withdrawalReason: z.string().max(500).optional(),
    status: z.enum(["active", "expired", "withdrawn", "revoked"]),
    retentionPolicyId: id,
    grantMethod: z.string().min(1).max(100),
    noticeState: z
      .enum(["provided", "acknowledged", "not_applicable"])
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (Date.parse(value.grantedAt) > Date.parse(value.expiresAt))
      ctx.addIssue({ code: "custom", message: "INVALID_CONSENT_WINDOW" });
    if (value.status === "active" && value.withdrawnAt)
      ctx.addIssue({
        code: "custom",
        message: "ACTIVE_CONSENT_HAS_WITHDRAWAL",
      });
    if (value.status === "withdrawn" && !value.withdrawnAt)
      ctx.addIssue({ code: "custom", message: "WITHDRAWN_AT_REQUIRED" });
    if (new Set(value.sourceClasses).size !== value.sourceClasses.length)
      ctx.addIssue({ code: "custom", message: "DUPLICATE_SOURCE_CLASS" });
    if (
      new Set(value.allowedCategories).size !== value.allowedCategories.length
    )
      ctx.addIssue({ code: "custom", message: "DUPLICATE_ALLOWED_CATEGORY" });
  });
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

export type ConsentDisposition =
  "active" | "not_yet_active" | "expired" | "withdrawn" | "inactive";
export function evaluateConsent(
  consent: ConsentRecord,
  at: Date,
): ConsentDisposition {
  if (consent.status === "withdrawn" || consent.withdrawnAt !== undefined)
    return "withdrawn";
  if (consent.status !== "active") return "inactive";
  const now = at.getTime();
  if (now < Date.parse(consent.grantedAt)) return "not_yet_active";
  if (now >= Date.parse(consent.expiresAt)) return "expired";
  return "active";
}

export const retentionPolicySchema = z.strictObject({
  ...base,
  retentionPolicyId: id,
  version: z.string().min(1),
  rawSourceDays: z.literal(0),
  normalizedClaimsDays: z.number().int().min(0).max(365),
  derivedResultsDays: z.number().int().min(0).max(365),
  sanitizedExportsDays: z.number().int().min(0).max(30),
  auditReceiptsDays: z.number().int().min(0).max(730),
  deletionBehavior: z.enum(["delete", "tombstone_minimal_receipt"]),
  exportRestrictions: z.array(z.string().min(1)),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

export const personSchema = z.strictObject({
  ...base,
  personId: id,
  displayName: z.string().min(1).max(200),
  createdAt: iso,
});
export type Person = z.infer<typeof personSchema>;

export const identityClaimSchema = z.strictObject({
  ...base,
  identityClaimId: id,
  personId: id,
  kind: z.enum(["name", "email", "profile_url", "provider_id"]),
  namespace: z.string().min(1).max(100),
  value: z.string().min(1).max(2048),
  ...evidencePointer,
});
export type IdentityClaim = z.infer<typeof identityClaimSchema>;

export const organizationSchema = z.strictObject({
  ...base,
  organizationId: id,
  canonicalName: z.string().min(1).max(300),
  createdAt: iso,
});
export type Organization = z.infer<typeof organizationSchema>;

export const organizationClaimSchema = z.strictObject({
  ...base,
  organizationClaimId: id,
  organizationId: id,
  kind: z.enum(["name", "domain", "crm_id", "alias"]),
  namespace: z.string().min(1).max(100),
  value: z.string().min(1).max(2048),
  ...evidencePointer,
});
export type OrganizationClaim = z.infer<typeof organizationClaimSchema>;

export const employmentClaimSchema = z.strictObject({
  ...base,
  employmentClaimId: id,
  personId: id,
  organizationId: id,
  title: z.string().max(300).optional(),
  function: z.string().max(100).optional(),
  seniority: z.string().max(100).optional(),
  state: z.enum(["current", "ended", "unknown"]),
  endedAt: iso.optional(),
  ...evidencePointer,
});
export type EmploymentClaim = z.infer<typeof employmentClaimSchema>;

export const relationshipEdgeSchema = z.strictObject({
  ...base,
  relationshipEdgeId: id,
  contributorId: id,
  destinationPersonId: id,
  consentRecordId: id,
  sourceSnapshotId: id,
  assertionKind: z.enum([
    "contributed_direct_connection",
    "scoped_human_attestation",
  ]),
  observedAt: iso,
  confidence,
  evidenceRefs: z.array(id).min(1),
  eligible: z.boolean(),
});
export type RelationshipEdge = z.infer<typeof relationshipEdgeSchema>;

export const evidenceRefSchema = z.strictObject({
  ...base,
  evidenceRefId: id,
  sourceSnapshotId: id,
  sourceRecordId: id,
  claimType: z.enum([
    "identity",
    "organization",
    "employment",
    "relationship",
    "review",
    "policy",
  ]),
  rowDigestSha256: sha256,
  transformVersion: z.string().min(1),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const sourceSnapshotMetadataSchema = z.strictObject({
  ...base,
  sourceSnapshotId: id,
  contributorId: id,
  consentRecordId: id,
  sourceKind: z.string().min(1),
  rawSha256: sha256,
  idempotencyKey: sha256,
  mappingId: id,
  mappingVersion: z.string().min(1),
  importedAt: iso,
  sourceObservedAt: iso.optional(),
  byteCount: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
  rawRetained: z.literal(false),
  networkAccessed: z.literal(false),
  transformVersion: z.string().min(1),
});
export type SourceSnapshotMetadata = z.infer<
  typeof sourceSnapshotMetadataSchema
>;

const rule = z.strictObject({
  ruleId: id,
  field: z.string().min(1),
  operator: z.enum(["equals", "in", "not_in", "range", "exists"]),
  value: z.unknown().optional(),
});
export const icpRuleSetSchema = z.strictObject({
  ...base,
  ruleSetId: id,
  version: z.string().min(1),
  rules: z.array(rule),
});
export type IcpRuleSet = z.infer<typeof icpRuleSetSchema>;
export const personaRuleSetSchema = z.strictObject({
  ...base,
  ruleSetId: id,
  version: z.string().min(1),
  rules: z.array(rule),
});
export type PersonaRuleSet = z.infer<typeof personaRuleSetSchema>;

export const targetAccountSchema = z.strictObject({
  ...base,
  targetAccountId: id,
  organizationId: id,
  priority: z.number().int().min(1),
  notes: z.string().max(1000).optional(),
});
export type TargetAccount = z.infer<typeof targetAccountSchema>;

export const suppressionRuleSchema = z.strictObject({
  ...base,
  suppressionRuleId: id,
  kind: z.enum([
    "person",
    "organization",
    "domain",
    "source",
    "snapshot",
    "category",
    "crm_state",
  ]),
  value: z.string().min(1),
  reasonCode: z.string().min(1),
  effectiveAt: iso,
  expiresAt: iso.optional(),
});
export type SuppressionRule = z.infer<typeof suppressionRuleSchema>;

const nonEligibleCoverageCandidateSchema = z.strictObject({
  candidateId: id,
  category: z.enum(["A", "B", "C", "D"]),
  destinationPersonId: id,
  reasonCodes: z.array(z.string().min(1)).min(1),
});

export const auditRunSchema = z.strictObject({
  ...base,
  auditRunId: id,
  engineVersion: z.string().min(1),
  inputSetSha256: sha256,
  configSha256: sha256,
  policySha256: sha256,
  runClock: iso,
  status: z.enum(["created", "completed", "failed"]),
  resultCount: z.number().int().nonnegative().optional(),
  blockedCount: z.number().int().nonnegative().optional(),
  reviewOnlyCount: z.number().int().nonnegative().optional(),
  blockedCandidates: z.array(nonEligibleCoverageCandidateSchema).optional(),
  reviewOnlyCandidates: z.array(nonEligibleCoverageCandidateSchema).optional(),
});
export type AuditRun = z.infer<typeof auditRunSchema>;

export const coverageReviewRecordSchema = z.strictObject({
  ...base,
  coverageReviewRecordId: id,
  auditRunId: id,
  resultId: id,
  category: z.enum(["B", "D"]),
  status: z.literal("pending"),
  reasonCodes: z.array(z.string().min(1)).min(1),
  createdAt: iso,
  autoApproved: z.literal(false),
});
export type CoverageReviewRecord = z.infer<typeof coverageReviewRecordSchema>;

export const coverageDependencySchema = z.strictObject({
  contributorIds: z.array(id).min(1),
  consentRecordIds: z.array(id).min(1),
  sourceSnapshotIds: z.array(id).min(1),
  evidenceRefIds: z.array(id).min(1),
  relationshipEdgeIds: z.array(id),
  mixedSourceRule: z.literal("invalidate_entire_result"),
});
export type CoverageDependency = z.infer<typeof coverageDependencySchema>;

const coverageBase = {
  ...base,
  auditRunId: id,
  resultId: id,
  destinationPersonId: id,
  canonicalAccountId: id,
  dependencies: coverageDependencySchema,
  scores: z.strictObject({
    accountFit: score,
    personaFit: score,
    relationshipConfidence: score,
    employmentConfidence: score,
    pathConfidence: score,
    freshness: score,
    reviewPriority: score,
  }),
  reasonCodes: z.array(z.string().min(1)).min(1),
  evidenceRefs: z.array(id).min(1),
  consentDisposition: z.enum([
    "active",
    "not_yet_active",
    "expired",
    "withdrawn",
    "inactive",
  ]),
  suppressionStatus: z.enum(["clear", "suppressed", "review_only"]),
};
export const coverageResultSchema = z.discriminatedUnion("category", [
  z.strictObject({
    ...coverageBase,
    category: z.literal("A"),
    personaOutcome: z.literal("matched"),
    candidateLabel: z.literal("potential_direct_icp_lead"),
  }),
  z.strictObject({
    ...coverageBase,
    category: z.literal("B"),
    personaOutcome: z.enum(["not_matched", "uncertain"]),
    candidateLabel: z.literal("target_account_coach_champion_candidate"),
  }),
  z.strictObject({
    ...coverageBase,
    category: z.literal("C"),
    personaOutcome: z.literal("matched"),
    candidateLabel: z.literal("broker_path_to_target_stakeholder"),
    brokerContributorId: id,
    relationshipEdgeId: id,
  }),
  z.strictObject({
    ...coverageBase,
    category: z.literal("D"),
    personaOutcome: z.enum(["not_matched", "uncertain"]),
    candidateLabel: z.literal(
      "broker_path_to_target_account_coach_champion_candidate",
    ),
    brokerContributorId: id,
    relationshipEdgeId: id,
  }),
]);
export type CoverageResult = z.infer<typeof coverageResultSchema>;

export const resolutionCandidateSchema = z.strictObject({
  ...base,
  resolutionCandidateId: id,
  subjectPersonId: id,
  candidatePersonIds: z.array(id).min(1),
  signals: z.array(z.string().min(1)),
  confidence: confidence,
  status: z.enum(["pending", "approved", "rejected"]),
  automaticMergeAllowed: z.literal(false),
});
export type ResolutionCandidate = z.infer<typeof resolutionCandidateSchema>;

export const organizationAliasCandidateSchema = z
  .strictObject({
    ...base,
    organizationAliasCandidateId: id,
    proposedOrganizationId: id,
    aliasKind: z.enum(["name", "domain", "crm_id"]),
    aliasValue: z.string().min(1),
    evidenceRefs: z.array(id).min(1),
    conflictOrganizationIds: z.array(id),
    consequences: z.array(z.string().min(1)),
    status: z.enum(["pending", "approved", "rejected"]),
    approvedCanonicalOrganizationId: id.optional(),
  })
  .superRefine((candidate, ctx) => {
    if (
      candidate.status === "approved" &&
      !candidate.approvedCanonicalOrganizationId
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Approved alias candidate requires canonical organization binding",
      });
  });
export type OrganizationAliasCandidate = z.infer<
  typeof organizationAliasCandidateSchema
>;

export const reviewDecisionSchema = z
  .strictObject({
    ...base,
    reviewDecisionId: id,
    subjectType: z.enum([
      "person_resolution",
      "organization_alias",
      "coverage_result",
      "intro_candidate",
    ]),
    subjectId: id,
    actorId: id,
    decision: z.enum(["approve", "reject", "defer", "revoke"]),
    reason: z.string().min(1).max(1000),
    decidedAt: iso,
    priorState: z.string().min(1),
    organizationAliasAuthorization: z
      .strictObject({
        sourceOrganizationId: id,
        canonicalOrganizationId: id,
        aliasKind: z.enum(["name", "domain", "crm_id"]),
        aliasValue: z.string().min(1).max(2048),
      })
      .optional(),
  })
  .superRefine((decision, ctx) => {
    if (
      decision.subjectType === "organization_alias" &&
      decision.decision === "approve" &&
      !decision.organizationAliasAuthorization
    )
      ctx.addIssue({
        code: "custom",
        message: "Organization alias approval requires a bound authorization",
      });
  });
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const introCandidateSchema = z.strictObject({
  ...base,
  introCandidateId: id,
  coverageResultId: id,
  brokerContributorId: id,
  destinationPersonId: id,
  purpose: z.string().min(1).max(1000),
  status: z.enum([
    "review_pending",
    "review_approved",
    "broker_opt_in_required",
    "broker_declined",
    "destination_response_required",
    "accepted",
    "declined",
  ]),
  outboundActionExecuted: z.literal(false),
  createdAt: iso,
});
export type IntroCandidate = z.infer<typeof introCandidateSchema>;

export const auditEventSchema = z.strictObject({
  ...base,
  auditEventId: id,
  sequence: z.number().int().positive(),
  eventType: z.string().min(1),
  actorId: id,
  occurredAt: iso,
  subjectType: z.string().min(1),
  subjectId: id,
  payloadSha256: sha256,
  previousHash: sha256.nullable(),
  hash: sha256,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const importTransactionSchema = z.strictObject({
  ...base,
  importTransactionId: id,
  contributorId: id,
  consentRecordId: id,
  sourceKind: z.string().min(1).max(100),
  mappingId: id,
  mappingVersion: z.string().min(1).max(64),
  rawSha256: sha256.optional(),
  idempotencyKey: sha256,
  status: z.enum(["committed", "failed"]),
  startedAt: iso,
  completedAt: iso,
  sourceSnapshotId: id.optional(),
  failureCodes: z.array(z.string().min(1).max(100)).max(1000),
});
export type ImportTransaction = z.infer<typeof importTransactionSchema>;

export const adapterMetadataRecordSchema = z.strictObject({
  ...base,
  adapterMetadataRecordId: id,
  adapterAuthorizationId: id,
  contributorId: id,
  consentRecordId: id,
  provider: z.string().min(1).max(100),
  providerTenantId: z.string().min(1).max(200),
  providerRecordId: z.string().min(1).max(500),
  sourceKind: z.enum(["crm_metadata", "email_metadata", "calendar_metadata"]),
  observedAt: iso,
  importedAt: iso,
  recordDigestSha256: sha256,
  fields: z.record(z.string(), z.unknown()),
  networkAccessed: z.literal(false),
  createsRelationshipEdge: z.literal(false),
});
export type AdapterMetadataRecord = z.infer<typeof adapterMetadataRecordSchema>;

export const deletionReceiptSchema = z.strictObject({
  ...base,
  receiptId: id,
  operation: z.enum([
    "contributor_withdrawal",
    "workspace_deletion",
    "retention_expiry",
  ]),
  subjectScopeDigest: sha256,
  requestedAt: iso,
  completedAt: iso.optional(),
  status: z.enum([
    "pending",
    "completed",
    "completed_with_external_actions_required",
    "failed",
  ]),
  policyId: id,
  policyVersion: z.string().min(1),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  externalActionsRequired: z.array(z.string().min(1)),
  personalValuesIncluded: z.literal(false),
  otherContributorIdsIncluded: z.literal(false),
  auditChainHash: sha256,
});
export type DeletionReceipt = z.infer<typeof deletionReceiptSchema>;

export const storableEntitySchema = z.discriminatedUnion("entityType", [
  z.strictObject({
    entityType: z.literal("contributor"),
    value: contributorSchema,
  }),
  z.strictObject({
    entityType: z.literal("consent"),
    value: consentRecordSchema,
  }),
  z.strictObject({
    entityType: z.literal("retention_policy"),
    value: retentionPolicySchema,
  }),
  z.strictObject({ entityType: z.literal("person"), value: personSchema }),
  z.strictObject({
    entityType: z.literal("identity_claim"),
    value: identityClaimSchema,
  }),
  z.strictObject({
    entityType: z.literal("organization"),
    value: organizationSchema,
  }),
  z.strictObject({
    entityType: z.literal("organization_claim"),
    value: organizationClaimSchema,
  }),
  z.strictObject({
    entityType: z.literal("employment_claim"),
    value: employmentClaimSchema,
  }),
  z.strictObject({
    entityType: z.literal("relationship_edge"),
    value: relationshipEdgeSchema,
  }),
  z.strictObject({
    entityType: z.literal("evidence_ref"),
    value: evidenceRefSchema,
  }),
  z.strictObject({
    entityType: z.literal("source_snapshot"),
    value: sourceSnapshotMetadataSchema,
  }),
  z.strictObject({
    entityType: z.literal("person_resolution_candidate"),
    value: resolutionCandidateSchema,
  }),
  z.strictObject({
    entityType: z.literal("organization_alias_candidate"),
    value: organizationAliasCandidateSchema,
  }),
  z.strictObject({
    entityType: z.literal("review_decision"),
    value: reviewDecisionSchema,
  }),
  z.strictObject({
    entityType: z.literal("suppression_rule"),
    value: suppressionRuleSchema,
  }),
  z.strictObject({
    entityType: z.literal("audit_run"),
    value: auditRunSchema,
  }),
  z.strictObject({
    entityType: z.literal("coverage_review_record"),
    value: coverageReviewRecordSchema,
  }),
  z.strictObject({
    entityType: z.literal("import_transaction"),
    value: importTransactionSchema,
  }),
  z.strictObject({
    entityType: z.literal("deletion_receipt"),
    value: deletionReceiptSchema,
  }),
  z.strictObject({
    entityType: z.literal("adapter_metadata_record"),
    value: adapterMetadataRecordSchema,
  }),
  z.strictObject({
    entityType: z.literal("coverage_result"),
    value: coverageResultSchema,
  }),
]);
export type StorableEntity = z.infer<typeof storableEntitySchema>;
