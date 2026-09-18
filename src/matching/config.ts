import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const reasonCode = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const iso = z.iso.datetime({ offset: true });
const scalar = z.union([z.string().max(500), z.number(), z.boolean()]);
const field = z.enum([
  "canonical_name",
  "domain",
  "industry",
  "geography",
  "employee_count",
  "stage",
  "technology",
  "title",
  "function",
  "seniority",
  "crm_state",
]);
const uniqueBy = <T>(
  items: T[],
  key: (item: T) => string,
  ctx: z.RefinementCtx,
  label: string,
) => {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value))
      ctx.addIssue({ code: "custom", message: `Duplicate ${label}: ${value}` });
    seen.add(value);
  }
};
const suppressionKind = z.enum([
  "person",
  "organization",
  "domain",
  "source",
  "snapshot",
  "category",
  "crm_state",
]);
const operator = z.enum([
  "equals",
  "in",
  "not_in",
  "contains_token",
  "range",
  "exists",
]);
export const deterministicRuleSchema = z.strictObject({
  ruleId: id,
  field,
  operator,
  value: z
    .union([
      scalar,
      z.array(scalar).max(100),
      z.strictObject({
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    ])
    .optional(),
  required: z.boolean().default(true),
  weight: z.number().int().min(0).max(100).default(1),
});
export type DeterministicRule = z.infer<typeof deterministicRuleSchema>;
const ruleSet = z
  .strictObject({
    ruleSetId: id,
    version: z.string().min(1).max(64),
    mode: z.enum(["all", "any"]),
    rules: z.array(deterministicRuleSchema).min(1).max(100),
  })
  .superRefine((set, ctx) =>
    uniqueBy(set.rules, (x) => x.ruleId, ctx, "ruleId"),
  );
const accountAttributes = z
  .record(z.string().min(1).max(100), scalar.or(z.array(scalar)))
  .default({});
export const engineConfigSchema = z
  .strictObject({
    workspaceId: id,
    configId: id,
    version: z.string().min(1).max(64),
    directContributorIds: z.array(id).min(1),
    icpRuleSet: ruleSet,
    stakeholderPersonaRuleSet: ruleSet,
    coachCandidateRuleSet: ruleSet.optional(),
    targetAccounts: z.array(
      z.strictObject({
        targetAccountId: id,
        organizationId: id,
        priority: z.number().int().min(1).max(5),
        attributes: accountAttributes,
      }),
    ),
    accountProfiles: z.array(
      z.strictObject({ organizationId: id, attributes: accountAttributes }),
    ),
    approvedOrganizationAliases: z.array(
      z.strictObject({
        aliasId: id,
        organizationAliasCandidateId: id,
        organizationId: id,
        sourceOrganizationId: id,
        kind: z.enum(["name", "domain", "crm_id"]),
        value: z.string().min(1).max(500),
        approvedReviewDecisionId: id,
      }),
    ),
    scoring: z.strictObject({
      weights: z.strictObject({
        accountFit: z.number().int().min(0).max(100),
        personaFit: z.number().int().min(0).max(100),
        relationshipConfidence: z.number().int().min(0).max(100),
        employmentConfidence: z.number().int().min(0).max(100),
        pathConfidence: z.number().int().min(0).max(100),
        freshness: z.number().int().min(0).max(100),
      }),
      personaMatchedThreshold: z.number().int().min(1).max(100),
      uncertainLowerBound: z.number().int().min(0).max(99),
    }),
    freshness: z.strictObject({
      currentEmploymentMaxDays: z.literal(365),
      reviewEmploymentMaxDays: z.literal(730),
      relationshipMaxDays: z.number().int().min(1).max(730),
    }),
    suppressions: z.array(
      z.strictObject({
        suppressionId: id,
        kind: suppressionKind,
        value: z.string().min(1).max(500),
        reasonCode,
        effectiveAt: iso,
        expiresAt: iso.optional(),
      }),
    ),
    exclusions: z.array(
      z.strictObject({
        kind: suppressionKind,
        value: z.string().min(1),
        reasonCode,
      }),
    ),
    reviewPolicy: z.strictObject({
      uncertainPersona: z.literal("review_only_candidate"),
      staleEmployment: z.enum(["block", "review_only"]),
      unresolvedIdentity: z.literal("block"),
      unresolvedOrganization: z.literal("block"),
      bAndDRequireReview: z.literal(true),
      reviewReasonCode: reasonCode,
    }),
  })
  .superRefine((config, ctx) => {
    uniqueBy(
      config.directContributorIds,
      (x) => x,
      ctx,
      "direct contributor ID",
    );
    uniqueBy(
      config.targetAccounts,
      (x) => x.targetAccountId,
      ctx,
      "target account ID",
    );
    uniqueBy(
      config.targetAccounts,
      (x) => x.organizationId,
      ctx,
      "target organization profile",
    );
    uniqueBy(
      config.accountProfiles,
      (x) => x.organizationId,
      ctx,
      "account profile organization",
    );
    uniqueBy(
      config.approvedOrganizationAliases,
      (x) => x.aliasId,
      ctx,
      "alias ID",
    );
    uniqueBy(
      config.suppressions,
      (x) => x.suppressionId,
      ctx,
      "suppression ID",
    );
    const ruleSets = [
      config.icpRuleSet,
      config.stakeholderPersonaRuleSet,
      config.coachCandidateRuleSet,
    ].filter((x) => x !== undefined);
    uniqueBy(ruleSets, (x) => x.ruleSetId, ctx, "rule set ID");
    uniqueBy(
      ruleSets.flatMap((x) => x.rules),
      (x) => x.ruleId,
      ctx,
      "rule ID across configuration",
    );
    if (
      config.scoring.uncertainLowerBound >=
      config.scoring.personaMatchedThreshold
    )
      ctx.addIssue({
        code: "custom",
        message:
          "uncertainLowerBound must be less than personaMatchedThreshold",
      });
    if (Object.values(config.scoring.weights).reduce((a, b) => a + b, 0) === 0)
      ctx.addIssue({
        code: "custom",
        message: "Scoring weight total must be non-zero",
      });
    const aliasBindings = new Map<string, string>();
    for (const alias of config.approvedOrganizationAliases) {
      const key = `${alias.kind}:${alias.value
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase("und")}`;
      const prior = aliasBindings.get(key);
      if (prior && prior !== alias.organizationId)
        ctx.addIssue({
          code: "custom",
          message: `Contradictory target alias: ${key}`,
        });
      aliasBindings.set(key, alias.organizationId);
    }
  });
export type EngineConfig = z.infer<typeof engineConfigSchema>;

export const enginePolicySchema = z.strictObject({
  workspaceId: id,
  policyId: id,
  version: z.string().min(1).max(64),
  effectiveAt: iso,
  purposeId: id,
  allowedCategories: z.array(z.enum(["A", "B", "C", "D"])).min(1),
  directScope: z.literal("A_ICP_FIT_INCLUDING_TARGETS_B_TARGET_LIST_ONLY"),
  brokerScope: z.literal("C_D_TARGET_LIST_ONLY"),
  requireBrokerIndividualConsent: z.boolean(),
  networkMode: z.literal("disabled"),
  externalMutations: z.literal(false),
});
export type EnginePolicy = z.infer<typeof enginePolicySchema>;
