import {
  auditRunSchema,
  coverageResultSchema,
  evaluateConsent,
  type ConsentRecord,
  type Contributor,
  type CoverageResult,
  type EmploymentClaim,
  type EvidenceRef,
  type IdentityClaim,
  type OrganizationAliasCandidate,
  type OrganizationClaim,
  type RelationshipEdge,
  type ReviewDecision,
  type SuppressionRule,
  type SourceSnapshotMetadata,
} from "../domain/models.js";
import type { WorkspaceRepository } from "../repositories/contracts.js";
import { createAuditEvent } from "../security/audit-chain.js";
import {
  canonicalJson,
  sha256Hex,
  workspaceScopedId,
} from "../security/deterministic.js";
import {
  engineConfigSchema,
  enginePolicySchema,
  type DeterministicRule,
  type EngineConfig,
} from "./config.js";

export const ENGINE_VERSION = "0.1.0-deterministic";
type Category = "A" | "B" | "C" | "D";
type PersonaOutcome = "matched" | "not_matched" | "uncertain";
export interface NonEligibleCandidate {
  candidateId: string;
  category: Category;
  destinationPersonId: string;
  reasonCodes: string[];
}
export interface EngineRunOutput {
  auditRun: ReturnType<typeof auditRunSchema.parse>;
  results: CoverageResult[];
  reviewOnly: NonEligibleCandidate[];
  blocked: NonEligibleCandidate[];
}
const values = <T>(
  store: WorkspaceRepository,
  ws: string,
  type: Parameters<WorkspaceRepository["list"]>[1],
): T[] => store.list(ws, type).map((x) => x.value as T);
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
const ageDays = (clock: Date, observedAt: string) =>
  Math.floor((clock.getTime() - Date.parse(observedAt)) / 86_400_000);
const score = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const claimValues = (
  claims: OrganizationClaim[],
  kind: OrganizationClaim["kind"],
) =>
  claims
    .filter((x) => x.kind === kind)
    .map((x) => x.value.toLocaleLowerCase("und"));
function ruleValue(
  rule: DeterministicRule,
  attributes: Record<string, unknown>,
): unknown {
  return attributes[rule.field];
}
function matchesRule(
  rule: DeterministicRule,
  attributes: Record<string, unknown>,
): boolean {
  const actual = ruleValue(rule, attributes);
  const norm = (x: unknown) =>
    typeof x === "string"
      ? x.normalize("NFKC").trim().toLocaleLowerCase("und")
      : x;
  const actuals = Array.isArray(actual) ? actual.map(norm) : [norm(actual)];
  const expected = Array.isArray(rule.value)
    ? rule.value.map(norm)
    : [norm(rule.value)];
  if (rule.operator === "exists")
    return actual !== undefined && actual !== null && actual !== "";
  if (rule.operator === "equals") return actuals.some((x) => x === expected[0]);
  if (rule.operator === "in") return actuals.some((x) => expected.includes(x));
  if (rule.operator === "not_in")
    return actuals.every((x) => !expected.includes(x));
  if (rule.operator === "contains_token")
    return actuals.some(
      (x) =>
        typeof x === "string" &&
        expected.some(
          (e) =>
            typeof e === "string" && x.split(/[^\p{L}\p{N}]+/u).includes(e),
        ),
    );
  if (
    typeof actuals[0] !== "number" ||
    !rule.value ||
    Array.isArray(rule.value) ||
    typeof rule.value !== "object"
  )
    return false;
  const range = rule.value as { min?: number; max?: number };
  return (
    (range.min === undefined || actuals[0] >= range.min) &&
    (range.max === undefined || actuals[0] <= range.max)
  );
}
function evaluateRuleSet(
  set: EngineConfig["icpRuleSet"],
  attrs: Record<string, unknown>,
) {
  const evaluations = set.rules.map((rule) => ({
    rule,
    matched: matchesRule(rule, attrs),
  }));
  const required = evaluations.filter((x) => x.rule.required);
  const matched =
    set.mode === "all"
      ? required.every((x) => x.matched)
      : required.some((x) => x.matched);
  const totalWeight = evaluations.reduce((n, x) => n + x.rule.weight, 0) || 1;
  return {
    matched,
    score: score(
      (evaluations
        .filter((x) => x.matched)
        .reduce((n, x) => n + x.rule.weight, 0) *
        100) /
        totalWeight,
    ),
    matchedRuleIds: evaluations
      .filter((x) => x.matched)
      .map((x) => x.rule.ruleId)
      .sort(),
    failedRuleIds: evaluations
      .filter((x) => !x.matched)
      .map((x) => x.rule.ruleId)
      .sort(),
  };
}
function activeSuppression(
  config: EngineConfig,
  persisted: SuppressionRule[],
  clock: Date,
  kind: string,
  candidates: string[],
): string[] {
  const normalized = candidates.map((x) => x.toLocaleLowerCase("und"));
  const rules: {
    kind: string;
    value: string;
    reasonCode: string;
    effectiveAt: string;
    expiresAt?: string;
  }[] = [
    ...config.suppressions,
    ...persisted.map((x) => ({
      kind: x.kind,
      value: x.value,
      reasonCode: x.reasonCode,
      effectiveAt: x.effectiveAt,
      ...(x.expiresAt ? { expiresAt: x.expiresAt } : {}),
    })),
    ...config.exclusions.map((x) => ({
      effectiveAt: new Date(0).toISOString(),
      ...x,
    })),
  ];
  return rules
    .filter(
      (x) =>
        x.kind === kind &&
        Date.parse(x.effectiveAt) <= clock.getTime() &&
        (!x.expiresAt || clock.getTime() < Date.parse(x.expiresAt)) &&
        normalized.includes(x.value.toLocaleLowerCase("und")),
    )
    .map((x) => x.reasonCode);
}

function validateRuntimeConfiguration(
  store: WorkspaceRepository,
  workspaceId: string,
  config: EngineConfig,
  policy: ReturnType<typeof enginePolicySchema.parse>,
  clock: Date,
): void {
  const workspace = store.getWorkspace(workspaceId);
  if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
  if (workspace.purposeId !== policy.purposeId)
    throw new Error("POLICY_WORKSPACE_PURPOSE_MISMATCH");
  if (Date.parse(policy.effectiveAt) > clock.getTime())
    throw new Error("POLICY_NOT_YET_EFFECTIVE");
  for (const contributorId of config.directContributorIds) {
    const found = store.get(workspaceId, "contributor", contributorId);
    if (found?.entityType !== "contributor")
      throw new Error(`DIRECT_CONTRIBUTOR_NOT_FOUND:${contributorId}`);
    if (found.value.status !== "active")
      throw new Error(`DIRECT_CONTRIBUTOR_INACTIVE:${contributorId}`);
  }
  for (const alias of config.approvedOrganizationAliases)
    if (!authorizedAlias(store, workspaceId, alias, clock))
      throw new Error(`ORGANIZATION_ALIAS_APPROVAL_INVALID:${alias.aliasId}`);
}

function authorizedAlias(
  store: WorkspaceRepository,
  workspaceId: string,
  alias: EngineConfig["approvedOrganizationAliases"][number],
  at: Date,
): boolean {
  const candidateEntity = store.get(
    workspaceId,
    "organization_alias_candidate",
    alias.organizationAliasCandidateId,
  );
  const decisionEntity = store.get(
    workspaceId,
    "review_decision",
    alias.approvedReviewDecisionId,
  );
  if (
    candidateEntity?.entityType !== "organization_alias_candidate" ||
    decisionEntity?.entityType !== "review_decision"
  )
    return false;
  const candidate: OrganizationAliasCandidate = candidateEntity.value;
  const decision: ReviewDecision = decisionEntity.value;
  const authorization = decision.organizationAliasAuthorization;
  if (
    candidate.status !== "approved" ||
    candidate.approvedCanonicalOrganizationId !== alias.organizationId ||
    decision.subjectType !== "organization_alias" ||
    decision.subjectId !== candidate.organizationAliasCandidateId ||
    decision.decision !== "approve" ||
    decision.priorState !== "pending" ||
    !decision.actorId ||
    !decision.reason.trim() ||
    Date.parse(decision.decidedAt) > at.getTime() ||
    !authorization ||
    candidate.proposedOrganizationId !== alias.sourceOrganizationId ||
    candidate.aliasKind !== alias.kind ||
    normalizeAlias(candidate.aliasValue) !== normalizeAlias(alias.value) ||
    authorization.sourceOrganizationId !== alias.sourceOrganizationId ||
    authorization.canonicalOrganizationId !== alias.organizationId ||
    (alias.organizationId !== candidate.proposedOrganizationId &&
      !candidate.conflictOrganizationIds.includes(alias.organizationId)) ||
    authorization.aliasKind !== alias.kind ||
    normalizeAlias(authorization.aliasValue) !== normalizeAlias(alias.value)
  )
    return false;
  const later = values<ReviewDecision>(
    store,
    workspaceId,
    "review_decision",
  ).some(
    (x) =>
      x.subjectType === "organization_alias" &&
      x.subjectId === candidate.organizationAliasCandidateId &&
      Date.parse(x.decidedAt) > Date.parse(decision.decidedAt) &&
      Date.parse(x.decidedAt) <= at.getTime() &&
      x.decision !== "approve",
  );
  return !later;
}
const normalizeAlias = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("und");

function canonicalInputs(store: WorkspaceRepository, ws: string) {
  const types = [
    "contributor",
    "consent",
    "person",
    "identity_claim",
    "organization",
    "organization_claim",
    "employment_claim",
    "relationship_edge",
    "evidence_ref",
    "source_snapshot",
    "person_resolution_candidate",
    "organization_alias_candidate",
    "review_decision",
    "suppression_rule",
  ] as const;
  return types
    .flatMap((type) => store.list(ws, type))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}
export function evaluateCoverage(
  request: {
    workspaceId: string;
    config: unknown;
    policy: unknown;
    runClock: string;
    actorId?: string;
  },
  store: WorkspaceRepository,
): EngineRunOutput {
  const config = engineConfigSchema.parse(request.config);
  const policy = enginePolicySchema.parse(request.policy);
  if (
    request.workspaceId !== config.workspaceId ||
    request.workspaceId !== policy.workspaceId
  )
    throw new Error("Cross-workspace engine configuration denied");
  const clock = new Date(request.runClock);
  if (!Number.isFinite(clock.getTime())) throw new Error("Invalid run clock");
  const ws = request.workspaceId;
  validateRuntimeConfiguration(store, ws, config, policy, clock);
  const inputSetSha256 = sha256Hex(canonicalJson(canonicalInputs(store, ws)));
  const configSha256 = sha256Hex(canonicalJson(config));
  const policySha256 = sha256Hex(canonicalJson(policy));
  const auditRunId = workspaceScopedId(ws, "audit_run", {
    engineVersion: ENGINE_VERSION,
    inputSetSha256,
    configSha256,
    policySha256,
    runClock: clock.toISOString(),
  });
  const existing = store.get(ws, "audit_run", auditRunId);
  if (
    existing?.entityType === "audit_run" &&
    existing.value.status === "completed"
  )
    return outputForRun(store, existing.value);

  const contributors = new Map(
    values<Contributor>(store, ws, "contributor").map((x) => [
      x.contributorId,
      x,
    ]),
  );
  const consents = new Map(
    values<ConsentRecord>(store, ws, "consent").map((x) => [
      x.consentRecordId,
      x,
    ]),
  );
  const snapshots = new Map(
    values<SourceSnapshotMetadata>(store, ws, "source_snapshot").map((x) => [
      x.sourceSnapshotId,
      x,
    ]),
  );
  const evidence = new Map(
    values<EvidenceRef>(store, ws, "evidence_ref").map((x) => [
      x.evidenceRefId,
      x,
    ]),
  );
  const identities = values<IdentityClaim>(store, ws, "identity_claim");
  const orgClaims = values<OrganizationClaim>(store, ws, "organization_claim");
  const employments = values<EmploymentClaim>(store, ws, "employment_claim");
  const edges = values<RelationshipEdge>(store, ws, "relationship_edge");
  const persistedSuppressions = values<SuppressionRule>(
    store,
    ws,
    "suppression_rule",
  );
  const unresolvedPeople = new Set(
    values<{ subjectPersonId: string; status: string }>(
      store,
      ws,
      "person_resolution_candidate",
    )
      .filter((x) => x.status === "pending")
      .map((x) => x.subjectPersonId),
  );
  const unresolvedOrganizations = new Set(
    values<{ proposedOrganizationId: string; status: string }>(
      store,
      ws,
      "organization_alias_candidate",
    )
      .filter((x) => x.status === "pending")
      .map((x) => x.proposedOrganizationId),
  );
  const results: CoverageResult[] = [],
    reviewOnly: NonEligibleCandidate[] = [],
    blocked: NonEligibleCandidate[] = [];

  for (const edge of edges.sort((a, b) =>
    a.relationshipEdgeId.localeCompare(b.relationshipEdgeId),
  )) {
    const employmentCandidates = employments
      .filter((x) => x.personId === edge.destinationPersonId)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const latest = employmentCandidates[0];
    if (!latest) continue;
    const configuredAlias = config.approvedOrganizationAliases.find(
      (x) => x.sourceOrganizationId === latest.organizationId,
    );
    const approvedAlias =
      configuredAlias && authorizedAlias(store, ws, configuredAlias, clock)
        ? configuredAlias
        : undefined;
    const mappedOrganizationId =
      approvedAlias?.organizationId ?? latest.organizationId;
    const direct = config.directContributorIds.includes(edge.contributorId);
    const target = config.targetAccounts.find(
      (x) => x.organizationId === mappedOrganizationId,
    );
    const profile = config.accountProfiles.find(
      (x) => x.organizationId === mappedOrganizationId,
    );
    const latestEvidenceSnapshotIds = new Set(
      latest.evidenceRefs
        .map((id) => evidence.get(id)?.sourceSnapshotId)
        .filter((id): id is string => !!id)
        .concat(edge.sourceSnapshotId),
    );
    const orgEvidenceClaims = orgClaims.filter(
      (x) =>
        x.organizationId === latest.organizationId &&
        x.evidenceRefs.some((id) => {
          const ref = evidence.get(id);
          return !!ref && latestEvidenceSnapshotIds.has(ref.sourceSnapshotId);
        }),
    );
    const attrs: Record<string, unknown> = {
      ...(profile?.attributes ?? target?.attributes ?? {}),
      title: latest.title,
      function: latest.function,
      seniority: latest.seniority,
    };
    const icp = evaluateRuleSet(config.icpRuleSet, attrs);
    const persona = evaluateRuleSet(config.stakeholderPersonaRuleSet, attrs);
    const coachCandidate = config.coachCandidateRuleSet
      ? evaluateRuleSet(config.coachCandidateRuleSet, attrs)
      : undefined;
    const personaOutcome: PersonaOutcome =
      persona.matched && persona.score >= config.scoring.personaMatchedThreshold
        ? "matched"
        : persona.score >= config.scoring.uncertainLowerBound
          ? "uncertain"
          : "not_matched";
    const categories: Category[] = direct
      ? personaOutcome === "matched" && icp.matched
        ? ["A"]
        : target
          ? ["B"]
          : []
      : target
        ? [personaOutcome === "matched" ? "C" : "D"]
        : [];
    for (const category of categories) {
      const reasons: string[] = [];
      const consent = consents.get(edge.consentRecordId);
      const contributor = contributors.get(edge.contributorId);
      const snapshot = snapshots.get(edge.sourceSnapshotId);
      const identityClaims = identities.filter(
        (x) => x.personId === edge.destinationPersonId,
      );
      const allEvidenceIds = sorted([
        ...edge.evidenceRefs,
        ...latest.evidenceRefs,
        ...identityClaims.flatMap((x) => x.evidenceRefs),
        ...orgEvidenceClaims.flatMap((x) => x.evidenceRefs),
      ]);
      const allEvidence = allEvidenceIds
        .map((x) => evidence.get(x))
        .filter((x): x is EvidenceRef => !!x);
      const snapshotIds = sorted(
        allEvidence
          .map((x) => x.sourceSnapshotId)
          .concat(edge.sourceSnapshotId),
      );
      const dependencySnapshots = snapshotIds
        .map((x) => snapshots.get(x))
        .filter((x): x is SourceSnapshotMetadata => !!x);
      const consentIds = sorted(
        dependencySnapshots
          .map((x) => x.consentRecordId)
          .concat(edge.consentRecordId),
      );
      const contributorIds = sorted(
        dependencySnapshots
          .map((x) => x.contributorId)
          .concat(edge.contributorId),
      );
      const employmentAge = ageDays(clock, latest.observedAt),
        relationshipAge = ageDays(clock, edge.observedAt);
      if (!edge.eligible) reasons.push("RELATIONSHIP_EDGE_INELIGIBLE");
      if (contributor?.status !== "active")
        reasons.push("CONTRIBUTOR_INACTIVE");
      if (!consent || evaluateConsent(consent, clock) !== "active")
        reasons.push(
          `CONSENT_${(consent ? evaluateConsent(consent, clock) : "inactive").toUpperCase()}`,
        );
      if (consent?.purposeId !== policy.purposeId)
        reasons.push("CONSENT_PURPOSE_MISMATCH");
      if (
        consent &&
        (!consent.allowedCategories.includes(category) ||
          !consent.sourceClasses.includes(snapshot?.sourceKind ?? ""))
      )
        reasons.push("CONSENT_SCOPE_DISALLOWS_CATEGORY_OR_SOURCE");
      for (const dependencySnapshot of dependencySnapshots) {
        const dependencyConsent = consents.get(
          dependencySnapshot.consentRecordId,
        );
        const dependencyContributor = contributors.get(
          dependencySnapshot.contributorId,
        );
        if (!dependencyConsent) reasons.push("DEPENDENCY_CONSENT_MISSING");
        else {
          const disposition = evaluateConsent(dependencyConsent, clock);
          if (disposition !== "active")
            reasons.push(`DEPENDENCY_CONSENT_${disposition.toUpperCase()}`);
          if (dependencyConsent.purposeId !== policy.purposeId)
            reasons.push("DEPENDENCY_CONSENT_PURPOSE_MISMATCH");
          if (
            dependencyConsent.contributorId !== dependencySnapshot.contributorId
          )
            reasons.push("DEPENDENCY_CONSENT_CONTRIBUTOR_MISMATCH");
          if (!dependencyConsent.allowedCategories.includes(category))
            reasons.push("DEPENDENCY_CONSENT_CATEGORY_DISALLOWED");
          if (
            !dependencyConsent.sourceClasses.includes(
              dependencySnapshot.sourceKind,
            )
          )
            reasons.push("DEPENDENCY_CONSENT_SOURCE_DISALLOWED");
        }
        if (dependencyContributor?.status !== "active")
          reasons.push("DEPENDENCY_CONTRIBUTOR_INACTIVE");
      }
      for (const evidenceRef of allEvidence)
        if (!snapshots.has(evidenceRef.sourceSnapshotId))
          reasons.push("DEPENDENCY_SNAPSHOT_MISSING");
      if (
        (category === "C" || category === "D") &&
        policy.requireBrokerIndividualConsent &&
        consent?.authorizationBasis !== "individual_consent"
      )
        reasons.push("BROKER_INDIVIDUAL_CONSENT_REQUIRED");
      if (
        unresolvedPeople.has(edge.destinationPersonId) ||
        identityClaims.some((x) => x.reviewStatus === "conflicted")
      )
        reasons.push("IDENTITY_UNRESOLVED_OR_CONFLICTED");
      if (
        unresolvedOrganizations.has(latest.organizationId) ||
        orgEvidenceClaims.some((x) => x.reviewStatus === "conflicted")
      )
        reasons.push("ORGANIZATION_UNRESOLVED_OR_CONFLICTED");
      const currentClaims = employmentCandidates.filter(
        (x) =>
          x.state === "current" &&
          ageDays(clock, x.observedAt) <=
            config.freshness.currentEmploymentMaxDays,
      );
      if (latest.state === "ended" || latest.endedAt)
        reasons.push("EMPLOYMENT_ENDED");
      if (
        latest.reviewStatus === "conflicted" ||
        new Set(currentClaims.map((x) => x.organizationId)).size > 1
      )
        reasons.push("EMPLOYMENT_CONFLICTED");
      if (
        employmentAge > config.freshness.reviewEmploymentMaxDays ||
        employmentAge < 0
      )
        reasons.push("EMPLOYMENT_STALE");
      else if (employmentAge > config.freshness.currentEmploymentMaxDays)
        reasons.push("EMPLOYMENT_REVIEW_REQUIRED");
      if (
        relationshipAge > config.freshness.relationshipMaxDays ||
        relationshipAge < 0
      )
        reasons.push("RELATIONSHIP_STALE");
      if (
        !allEvidenceIds.length ||
        allEvidence.length !== allEvidenceIds.length ||
        !snapshot
      )
        reasons.push("DEPENDENCY_EVIDENCE_INCOMPLETE");
      const domains = claimValues(orgEvidenceClaims, "domain");
      reasons.push(
        ...activeSuppression(config, persistedSuppressions, clock, "person", [
          edge.destinationPersonId,
        ]),
        ...activeSuppression(
          config,
          persistedSuppressions,
          clock,
          "organization",
          [latest.organizationId, mappedOrganizationId],
        ),
        ...activeSuppression(
          config,
          persistedSuppressions,
          clock,
          "domain",
          domains,
        ),
        ...activeSuppression(
          config,
          persistedSuppressions,
          clock,
          "source",
          dependencySnapshots.map((x) => x.sourceKind),
        ),
        ...activeSuppression(
          config,
          persistedSuppressions,
          clock,
          "snapshot",
          snapshotIds,
        ),
        ...activeSuppression(config, persistedSuppressions, clock, "category", [
          category,
        ]),
        ...activeSuppression(
          config,
          persistedSuppressions,
          clock,
          "crm_state",
          typeof attrs["crm_state"] === "string" ? [attrs["crm_state"]] : [],
        ),
      );
      if (!policy.allowedCategories.includes(category))
        reasons.push("POLICY_CATEGORY_DISALLOWED");
      if (category === "A" && (!icp.matched || personaOutcome !== "matched"))
        reasons.push("CATEGORY_A_FIT_GATE_FAILED");
      if ((category === "B" || category === "C" || category === "D") && !target)
        reasons.push("TARGET_ACCOUNT_REQUIRED");
      if (category === "C" && personaOutcome !== "matched")
        reasons.push("CATEGORY_C_PERSONA_GATE_FAILED");
      const hard = reasons.filter(
        (x) =>
          x !== "EMPLOYMENT_REVIEW_REQUIRED" ||
          config.reviewPolicy.staleEmployment === "block",
      );
      const candidateId = workspaceScopedId(ws, "candidate", {
        auditRunId,
        category,
        edge: edge.relationshipEdgeId,
        employment: latest.employmentClaimId,
      });
      if (hard.length) {
        blocked.push({
          candidateId,
          category,
          destinationPersonId: edge.destinationPersonId,
          reasonCodes: sorted(hard),
        });
        continue;
      }
      if (reasons.includes("EMPLOYMENT_REVIEW_REQUIRED")) {
        reviewOnly.push({
          candidateId,
          category,
          destinationPersonId: edge.destinationPersonId,
          reasonCodes: sorted(reasons),
        });
        continue;
      }
      const accountFit = target ? 100 : icp.score;
      const freshness = score(
        100 -
          (Math.max(employmentAge, relationshipAge) * 100) /
            Math.max(
              config.freshness.currentEmploymentMaxDays,
              config.freshness.relationshipMaxDays,
            ),
      );
      const relationshipConfidence = score(edge.confidence * 100),
        employmentConfidence = score(latest.confidence * 100);
      const pathConfidence = score(
        Math.min(
          edge.confidence,
          latest.confidence,
          ...identityClaims.map((x) => x.confidence),
        ) * 100,
      );
      const components = {
        accountFit,
        personaFit: persona.score,
        relationshipConfidence,
        employmentConfidence,
        pathConfidence,
        freshness,
      };
      const weightTotal =
        Object.values(config.scoring.weights).reduce((a, b) => a + b, 0) || 1;
      const reviewPriority = score(
        (
          Object.entries(config.scoring.weights) as [
            keyof typeof components,
            number,
          ][]
        ).reduce((n, [k, w]) => n + components[k] * w, 0) / weightTotal,
      );
      const resultId = workspaceScopedId(ws, "coverage_result", {
        auditRunId,
        category,
        destinationPersonId: edge.destinationPersonId,
        canonicalAccountId: mappedOrganizationId,
        relationshipEdgeId:
          category === "C" || category === "D" ? edge.relationshipEdgeId : null,
      });
      const base = {
        workspaceId: ws,
        auditRunId,
        resultId,
        destinationPersonId: edge.destinationPersonId,
        canonicalAccountId: mappedOrganizationId,
        dependencies: {
          contributorIds,
          consentRecordIds: consentIds,
          sourceSnapshotIds: snapshotIds,
          evidenceRefIds: allEvidenceIds,
          relationshipEdgeIds:
            category === "C" || category === "D"
              ? [edge.relationshipEdgeId]
              : [],
          mixedSourceRule: "invalidate_entire_result" as const,
        },
        scores: { ...components, reviewPriority },
        reasonCodes: sorted([
          `CATEGORY_${category}_ELIGIBLE`,
          target
            ? approvedAlias
              ? "TARGET_ACCOUNT_APPROVED_ALIAS"
              : "TARGET_ACCOUNT_EXACT"
            : "ICP_RULES_MATCHED",
          personaOutcome === "matched"
            ? "STAKEHOLDER_PERSONA_MATCHED"
            : "COACH_CHAMPION_CANDIDATE_ONLY",
          ...(personaOutcome !== "matched" && coachCandidate?.matched
            ? ["COACH_CANDIDATE_RULES_MATCHED_NOT_PROVEN"]
            : []),
          ...(category === "B" || category === "D"
            ? [config.reviewPolicy.reviewReasonCode]
            : []),
        ]),
        evidenceRefs: allEvidenceIds,
        consentDisposition: "active" as const,
        suppressionStatus: "clear" as const,
      };
      const result =
        category === "A"
          ? {
              ...base,
              category,
              personaOutcome: "matched" as const,
              candidateLabel: "potential_direct_icp_lead" as const,
            }
          : category === "B"
            ? {
                ...base,
                category,
                personaOutcome: personaOutcome as "not_matched" | "uncertain",
                candidateLabel:
                  "target_account_coach_champion_candidate" as const,
              }
            : category === "C"
              ? {
                  ...base,
                  category,
                  personaOutcome: "matched" as const,
                  candidateLabel: "broker_path_to_target_stakeholder" as const,
                  brokerContributorId: edge.contributorId,
                  relationshipEdgeId: edge.relationshipEdgeId,
                }
              : {
                  ...base,
                  category,
                  personaOutcome: personaOutcome as "not_matched" | "uncertain",
                  candidateLabel:
                    "broker_path_to_target_account_coach_champion_candidate" as const,
                  brokerContributorId: edge.contributorId,
                  relationshipEdgeId: edge.relationshipEdgeId,
                };
      results.push(coverageResultSchema.parse(result));
    }
  }
  const ordered = orderResults(results);
  const completed = auditRunSchema.parse({
    workspaceId: ws,
    auditRunId,
    engineVersion: ENGINE_VERSION,
    inputSetSha256,
    configSha256,
    policySha256,
    runClock: clock.toISOString(),
    status: "completed",
    resultCount: ordered.length,
    blockedCount: blocked.length,
    reviewOnlyCount: reviewOnly.length,
    blockedCandidates: blocked.sort(nonEligibleOrder),
    reviewOnlyCandidates: reviewOnly.sort(nonEligibleOrder),
  });
  store.transact(ws, (tx) => {
    tx.put({ entityType: "audit_run", value: completed });
    for (const result of ordered)
      tx.put({ entityType: "coverage_result", value: result });
    for (const result of ordered.filter(
      (x) => x.category === "B" || x.category === "D",
    ))
      tx.put({
        entityType: "coverage_review_record",
        value: {
          workspaceId: ws,
          coverageReviewRecordId: workspaceScopedId(ws, "coverage_review", {
            auditRunId,
            resultId: result.resultId,
          }),
          auditRunId,
          resultId: result.resultId,
          category: result.category,
          status: "pending",
          reasonCodes: [config.reviewPolicy.reviewReasonCode],
          createdAt: clock.toISOString(),
          autoApproved: false,
        },
      });
    const prior = store.listAuditEvents(ws);
    const previousHash = prior.at(-1)?.hash ?? null;
    tx.appendAuditEvent(
      createAuditEvent({
        workspaceId: ws,
        sequence: prior.length + 1,
        eventType: "coverage.audit.completed",
        actorId: request.actorId ?? "actor_engine",
        occurredAt: clock.toISOString(),
        subjectType: "audit_run",
        subjectId: auditRunId,
        previousHash,
        payload: {
          inputSetSha256,
          configSha256,
          policySha256,
          resultIds: ordered.map((x) => x.resultId),
          blocked,
          reviewOnly,
        },
      }),
    );
  });
  return {
    auditRun: completed,
    results: ordered,
    reviewOnly: reviewOnly.sort(nonEligibleOrder),
    blocked: blocked.sort(nonEligibleOrder),
  };
}
function orderResults(results: CoverageResult[]): CoverageResult[] {
  return [...results].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      b.scores.reviewPriority - a.scores.reviewPriority ||
      a.canonicalAccountId.localeCompare(b.canonicalAccountId) ||
      a.destinationPersonId.localeCompare(b.destinationPersonId) ||
      ("brokerContributorId" in a ? a.brokerContributorId : "").localeCompare(
        "brokerContributorId" in b ? b.brokerContributorId : "",
      ) ||
      a.resultId.localeCompare(b.resultId),
  );
}
const nonEligibleOrder = (a: NonEligibleCandidate, b: NonEligibleCandidate) =>
  a.category.localeCompare(b.category) ||
  a.destinationPersonId.localeCompare(b.destinationPersonId) ||
  a.candidateId.localeCompare(b.candidateId);
function outputForRun(
  store: WorkspaceRepository,
  run: ReturnType<typeof auditRunSchema.parse>,
): EngineRunOutput {
  return {
    auditRun: run,
    results: orderResults(
      store
        .listCoverageResults(run.workspaceId)
        .filter((x) => x.auditRunId === run.auditRunId),
    ),
    reviewOnly: run.reviewOnlyCandidates ?? [],
    blocked: run.blockedCandidates ?? [],
  };
}
export function visibleCoverageResults(
  store: WorkspaceRepository,
  workspaceId: string,
  auditRunId: string,
  configInput: unknown,
  at: string,
): CoverageResult[] {
  const config = engineConfigSchema.parse(configInput);
  if (config.workspaceId !== workspaceId)
    throw new Error("Cross-workspace display configuration denied");
  const clock = new Date(at);
  if (!Number.isFinite(clock.getTime()))
    throw new Error("Invalid display clock");
  const persistedSuppressions = values<SuppressionRule>(
    store,
    workspaceId,
    "suppression_rule",
  );
  const snapshots = new Map(
    values<SourceSnapshotMetadata>(store, workspaceId, "source_snapshot").map(
      (x) => [x.sourceSnapshotId, x],
    ),
  );
  const consents = new Map(
    values<ConsentRecord>(store, workspaceId, "consent").map((x) => [
      x.consentRecordId,
      x,
    ]),
  );
  return orderResults(
    store
      .listCoverageResults(workspaceId)
      .filter((r) => r.auditRunId === auditRunId)
      .filter(
        (r) =>
          activeSuppression(config, persistedSuppressions, clock, "person", [
            r.destinationPersonId,
          ]).length === 0 &&
          activeSuppression(
            config,
            persistedSuppressions,
            clock,
            "organization",
            [r.canonicalAccountId],
          ).length === 0 &&
          activeSuppression(config, persistedSuppressions, clock, "category", [
            r.category,
          ]).length === 0 &&
          r.dependencies.sourceSnapshotIds.every((snapshotId) => {
            const snapshot = snapshots.get(snapshotId);
            if (!snapshot) return false;
            const consent = consents.get(snapshot.consentRecordId);
            const contributorEntity = store.get(
              workspaceId,
              "contributor",
              snapshot.contributorId,
            );
            const workspace = store.getWorkspace(workspaceId);
            return (
              !!consent &&
              evaluateConsent(consent, clock) === "active" &&
              consent.purposeId === workspace?.purposeId &&
              consent.contributorId === snapshot.contributorId &&
              consent.allowedCategories.includes(r.category) &&
              consent.sourceClasses.includes(snapshot.sourceKind) &&
              contributorEntity?.entityType === "contributor" &&
              contributorEntity.value.status === "active" &&
              activeSuppression(
                config,
                persistedSuppressions,
                clock,
                "source",
                [snapshot.sourceKind],
              ).length === 0 &&
              activeSuppression(
                config,
                persistedSuppressions,
                clock,
                "snapshot",
                [snapshotId],
              ).length === 0
            );
          }),
      ),
  );
}
