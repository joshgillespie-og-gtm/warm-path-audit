import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  AuditRun,
  CoverageResult,
  EvidenceRef,
  SourceSnapshotMetadata,
} from "../domain/models.js";
import type { WorkspaceRepository } from "../repositories/contracts.js";
import { canonicalJson } from "../security/deterministic.js";
import {
  escapeTerminalControls,
  neutralizeFormulaCell,
} from "../security/output.js";
import {
  visibleCoverageResults,
  type NonEligibleCandidate,
} from "../matching/engine.js";

export type ReportView = "safe" | "reviewer";
export const REPORT_CAVEAT =
  "Results are hypotheses for human review, not permission to contact.";
export const CATEGORY_DEFINITIONS = {
  A: "Direct deterministic ICP and stakeholder match",
  B: "Direct named-target review-pending coach/champion candidate, not proven influence or warmth",
  C: "Consented broker path to a deterministic named-target stakeholder",
  D: "Consented broker path to a named-target review-pending coach/champion candidate, not proven influence or warmth",
} as const;

export interface ReportOptions {
  workspaceId: string;
  auditRunId: string;
  config: unknown;
  at: string;
  view?: ReportView;
}

const entityValues = <T>(
  store: WorkspaceRepository,
  workspaceId: string,
  type: Parameters<WorkspaceRepository["list"]>[1],
): T[] => store.list(workspaceId, type).map((x) => x.value as T);
const displayName = (
  store: WorkspaceRepository,
  workspaceId: string,
  personId: string,
): string => {
  const found = store.get(workspaceId, "person", personId);
  return found?.entityType === "person" ? found.value.displayName : personId;
};
const accountName = (
  store: WorkspaceRepository,
  workspaceId: string,
  organizationId: string,
): string => {
  const found = store.get(workspaceId, "organization", organizationId);
  return found?.entityType === "organization"
    ? found.value.canonicalName
    : organizationId;
};
const evidenceSummary = (
  result: CoverageResult,
  evidence: Map<string, EvidenceRef>,
  snapshots: Map<string, SourceSnapshotMetadata>,
) => {
  const refs = result.evidenceRefs
    .map((id) => evidence.get(id))
    .filter((x): x is EvidenceRef => Boolean(x));
  return {
    evidence_count: refs.length,
    claim_types: [...new Set(refs.map((x) => x.claimType))].sort(),
    source_kinds: [
      ...new Set(
        refs
          .map((x) => snapshots.get(x.sourceSnapshotId)?.sourceKind)
          .filter((x): x is string => Boolean(x)),
      ),
    ].sort(),
    observed_at: [
      ...new Set(
        result.dependencies.sourceSnapshotIds
          .map(
            (id) =>
              snapshots.get(id)?.sourceObservedAt ??
              snapshots.get(id)?.importedAt,
          )
          .filter((x): x is string => Boolean(x)),
      ),
    ].sort(),
    provenance: "locally imported, user-provided source snapshots",
  };
};

export function buildCoverageReport(
  store: WorkspaceRepository,
  options: ReportOptions,
) {
  const view = options.view ?? "safe";
  const runEntity = store.get(
    options.workspaceId,
    "audit_run",
    options.auditRunId,
  );
  if (runEntity?.entityType !== "audit_run")
    throw new Error("AUDIT_RUN_NOT_FOUND");
  const run: AuditRun = runEntity.value;
  const consentById = new Map(
    store
      .list(options.workspaceId, "consent")
      .flatMap((x) =>
        x.entityType === "consent"
          ? [[x.value.consentRecordId, x.value] as const]
          : [],
      ),
  );
  const visible = visibleCoverageResults(
    store,
    options.workspaceId,
    options.auditRunId,
    options.config,
    options.at,
  ).filter((result) =>
    result.dependencies.consentRecordIds.every(
      (id) => consentById.get(id)?.sanitizedExportAllowed === true,
    ),
  );
  const visibleIds = new Set(visible.map((x) => x.resultId));
  const allRun = store
    .listCoverageResults(options.workspaceId)
    .filter((x) => x.auditRunId === options.auditRunId);
  const evidence = new Map(
    entityValues<EvidenceRef>(store, options.workspaceId, "evidence_ref").map(
      (x) => [x.evidenceRefId, x],
    ),
  );
  const snapshots = new Map(
    entityValues<SourceSnapshotMetadata>(
      store,
      options.workspaceId,
      "source_snapshot",
    ).map((x) => [x.sourceSnapshotId, x]),
  );
  const results = visible.map((result) => ({
    result_id: result.resultId,
    category: result.category,
    category_definition: CATEGORY_DEFINITIONS[result.category],
    candidate_label:
      result.category === "B" || result.category === "D"
        ? "review-pending coach/champion candidate"
        : result.candidateLabel.replaceAll("_", " "),
    destination: {
      person_id: result.destinationPersonId,
      display_name: displayName(
        store,
        options.workspaceId,
        result.destinationPersonId,
      ),
    },
    account: {
      organization_id: result.canonicalAccountId,
      canonical_name: accountName(
        store,
        options.workspaceId,
        result.canonicalAccountId,
      ),
    },
    persona_outcome: result.personaOutcome,
    review_status:
      result.category === "B" || result.category === "D"
        ? "pending"
        : "not_required",
    review_priority: result.scores.reviewPriority,
    score_interpretation:
      "Review ordering only; not relationship strength, influence, or permission to contact",
    component_scores: result.scores,
    reason_codes: [...result.reasonCodes].sort(),
    consent_status: result.consentDisposition,
    suppression_status: result.suppressionStatus,
    evidence: evidenceSummary(result, evidence, snapshots),
    dependencies:
      view === "reviewer"
        ? {
            consent_record_ids: result.dependencies.consentRecordIds,
            source_snapshot_ids: result.dependencies.sourceSnapshotIds,
            evidence_ref_ids: result.dependencies.evidenceRefIds,
            contributor_ids: result.dependencies.contributorIds,
            relationship_edge_ids: result.dependencies.relationshipEdgeIds,
          }
        : {
            consent_dependency_count:
              result.dependencies.consentRecordIds.length,
            source_snapshot_dependency_count:
              result.dependencies.sourceSnapshotIds.length,
            evidence_dependency_count:
              result.dependencies.evidenceRefIds.length,
            relationship_dependency_present:
              result.dependencies.relationshipEdgeIds.length > 0,
            identifiers_redacted: true,
          },
    ...(result.category === "C" || result.category === "D"
      ? view === "reviewer" &&
        result.dependencies.consentRecordIds.every(
          (id) =>
            consentById.get(id)?.brokerDisclosure === "authorized_reviewers",
        )
        ? {
            broker: {
              contributor_id: result.brokerContributorId,
              relationship_edge_id: result.relationshipEdgeId,
              disclosure: "authorized_reviewer_only",
            },
          }
        : {
            broker: {
              redacted: true,
              disclosure: "broker identity and exact edge withheld",
            },
          }
      : {}),
  }));
  const accountCoverage = [
    ...new Set(results.map((x) => x.account.organization_id)),
  ]
    .sort()
    .map((id) => ({
      organization_id: id,
      canonical_name: accountName(store, options.workspaceId, id),
      categories: [
        ...new Set(
          results
            .filter((x) => x.account.organization_id === id)
            .map((x) => x.category),
        ),
      ].sort(),
      finding_count: results.filter((x) => x.account.organization_id === id)
        .length,
    }));
  const summarizeCandidates = (
    items: NonEligibleCandidate[],
    disposition: string,
  ) =>
    items.map((x) => ({
      candidate_id: x.candidateId,
      category: x.category,
      destination_person_id: x.destinationPersonId,
      reason_codes: [...x.reasonCodes].sort(),
      disposition,
    }));
  return {
    schema_version: "0.2.0",
    generated_at: options.at,
    workspace_id: options.workspaceId,
    audit_run_id: options.auditRunId,
    engine_version: run.engineVersion,
    hashes: {
      input_set_sha256: run.inputSetSha256,
      config_sha256: run.configSha256,
      policy_sha256: run.policySha256,
    },
    view,
    caveat: REPORT_CAVEAT,
    category_definitions: CATEGORY_DEFINITIONS,
    summary: {
      eligible_total: results.length,
      categories: Object.fromEntries(
        (["A", "B", "C", "D"] as const).map((category) => [
          category,
          results.filter((x) => x.category === category).length,
        ]),
      ),
      blocked_total: run.blockedCount ?? 0,
      review_only_total: run.reviewOnlyCount ?? 0,
      display_invalidated_total: allRun.length - visibleIds.size,
    },
    account_coverage: accountCoverage,
    findings: results,
    blocked: summarizeCandidates(run.blockedCandidates ?? [], "blocked"),
    review_only: summarizeCandidates(
      run.reviewOnlyCandidates ?? [],
      "review_only",
    ),
    sanitization: {
      profile:
        view === "reviewer" ? "authorized-reviewer-v1" : "safe-export-v1",
      broker_identities_redacted: view === "safe",
      exact_relationship_edges_redacted: view === "safe",
      contributor_emails_included: false,
      raw_rows_included: false,
      private_source_metadata_included: false,
      credentials_included: false,
      portable_edge_list_included: false,
      guessed_relationship_strength_included: false,
      current_display_policy_revalidated: true,
    },
  };
}

const csvEscape = (value: unknown): string => {
  const safe = neutralizeFormulaCell(
    typeof value === "string" ? value : canonicalJson(value),
  );
  return `"${safe.replaceAll('"', '""')}"`;
};
export function reportToCsv(
  report: ReturnType<typeof buildCoverageReport>,
): string {
  const headers = [
    "result_id",
    "category",
    "category_definition",
    "candidate_label",
    "destination_person_id",
    "destination_name",
    "account_id",
    "account_name",
    "persona_outcome",
    "review_status",
    "review_priority",
    "reason_codes",
    "consent_status",
    "suppression_status",
    "evidence_count",
    "source_kinds",
    "broker_disclosure",
    "caveat",
  ];
  const rows = report.findings.map((finding) => {
    const broker = "broker" in finding ? finding.broker : undefined;
    return [
      finding.result_id,
      finding.category,
      finding.category_definition,
      finding.candidate_label,
      finding.destination.person_id,
      finding.destination.display_name,
      finding.account.organization_id,
      finding.account.canonical_name,
      finding.persona_outcome,
      finding.review_status,
      finding.review_priority,
      finding.reason_codes.join("|"),
      finding.consent_status,
      finding.suppression_status,
      finding.evidence.evidence_count,
      finding.evidence.source_kinds.join("|"),
      broker
        ? "redacted" in broker
          ? broker.disclosure
          : broker.disclosure
        : "not_applicable",
      report.caveat,
    ]
      .map(csvEscape)
      .join(",");
  });
  return `${headers.map(csvEscape).join(",")}\n${rows.join("\n")}\n`;
}
export function reportToTerminal(
  report: ReturnType<typeof buildCoverageReport>,
): string {
  const safe = escapeTerminalControls;
  const lines = [
    "WARM PATH AUDIT",
    `Run: ${safe(report.audit_run_id)}`,
    `Clock: ${safe(report.generated_at)}`,
    REPORT_CAVEAT,
    `Eligible: ${String(report.summary.eligible_total)}  A:${String(report.summary.categories["A"])} B:${String(report.summary.categories["B"])} C:${String(report.summary.categories["C"])} D:${String(report.summary.categories["D"])}`,
    `Blocked: ${String(report.summary.blocked_total)}  Review-only: ${String(report.summary.review_only_total)}  Display-invalidated: ${String(report.summary.display_invalidated_total)}`,
    "",
  ];
  for (const finding of report.findings)
    lines.push(
      `[${finding.category}] ${safe(finding.candidate_label)} | ${safe(finding.destination.display_name)} | ${safe(finding.account.canonical_name)} | review priority ${String(finding.review_priority)}`,
      `    reasons: ${finding.reason_codes.map(safe).join(", ")}`,
      `    provenance: ${finding.evidence.source_kinds.map(safe).join(", ")} (${String(finding.evidence.evidence_count)} evidence refs)`,
    );
  if (report.blocked.length)
    lines.push(
      "",
      "BLOCKED NEAR-MISSES",
      ...report.blocked.map(
        (x) =>
          `[${x.category}] ${safe(x.destination_person_id)}: ${x.reason_codes.map(safe).join(", ")}`,
      ),
    );
  if (report.review_only.length)
    lines.push(
      "",
      "REVIEW-ONLY NEAR-MISSES",
      ...report.review_only.map(
        (x) =>
          `[${x.category}] ${safe(x.destination_person_id)}: ${x.reason_codes.map(safe).join(", ")}`,
      ),
    );
  return lines.join("\n");
}

export function writePrivateArtifact(
  path: string,
  content: string,
  options: { overwrite?: boolean; allowedRoot?: string } = {},
): void {
  if (!isAbsolute(path)) throw new Error("ABSOLUTE_OUTPUT_PATH_REQUIRED");
  const parent = dirname(path);
  let canonicalRoot: string | undefined;
  if (options.allowedRoot) {
    mkdirSync(options.allowedRoot, { recursive: true, mode: 0o700 });
    canonicalRoot = realpathSync(options.allowedRoot);
    const rel = relative(canonicalRoot, resolve(path));
    if (rel.startsWith("..") || isAbsolute(rel))
      throw new Error("OUTPUT_OUTSIDE_ALLOWED_ROOT");
  }
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const canonicalParent = realpathSync(parent);
  if (canonicalRoot) {
    const parentRel = relative(canonicalRoot, canonicalParent);
    if (parentRel.startsWith("..") || isAbsolute(parentRel))
      throw new Error("OUTPUT_PARENT_SYMLINK_ESCAPE");
  }
  chmodSync(canonicalParent, 0o700);
  if (existsSync(path)) {
    const existing = lstatSync(path);
    if (existing.isSymbolicLink()) throw new Error("SYMLINK_OUTPUT_REJECTED");
    if (!existing.isFile() || existing.nlink !== 1)
      throw new Error("OUTPUT_MUST_BE_SINGLE_LINK_REGULAR_FILE");
    if (!options.overwrite) throw new Error("OUTPUT_EXISTS_USE_OVERWRITE");
  }
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    (options.overwrite ? constants.O_TRUNC : constants.O_EXCL) |
    ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0);
  const fd = openSync(path, flags, 0o600);
  try {
    const opened = lstatSync(path);
    if (!opened.isFile() || opened.nlink !== 1)
      throw new Error("OUTPUT_MUST_BE_SINGLE_LINK_REGULAR_FILE");
    writeFileSync(fd, content, { encoding: "utf8" });
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600);
}
