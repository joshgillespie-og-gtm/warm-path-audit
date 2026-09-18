import { chmodSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type {
  EmploymentClaim,
  IdentityClaim,
  OrganizationClaim,
} from "../domain/models.js";
import type {
  TransactionContext,
  WorkspaceRepository,
} from "../repositories/contracts.js";
import {
  canonicalJson,
  sha256Hex,
  workspaceScopedId,
} from "../security/deterministic.js";
import {
  emailRisk,
  normalizeDomain,
  normalizeEmail,
  normalizeProfileUrl,
  resolveOrganizationClaim,
  resolvePersonClaim,
} from "../resolution/resolution.js";
import {
  CsvImportError,
  parseCsvFile,
  validateCsvMapping,
  type CanonicalTargetField,
  type CsvMapping,
} from "./csv.js";

export interface ImportRequest {
  workspaceId: string;
  contributorId: string;
  consentRecordId: string;
  sourceKind: string;
  mappingId: string;
  mappingVersion: string;
  file: string;
  importRoots: string[];
  importedAt: string;
  mapping: CsvMapping;
  stagedRawOwnedByProject?: boolean;
}
export interface ImportResult {
  status: "committed" | "idempotent";
  sourceSnapshotId: string;
  rawSha256: string;
  recordCount: number;
}
type CanonicalRow = Partial<Record<CanonicalTargetField, string>>;
const failEvidence = (): never => {
  throw new CsvImportError("EVIDENCE_STAGING_FAILED");
};
const cleanText = (value: string): string => {
  const normalized = value.normalize("NFKC").trim();
  if (/\p{Cc}/u.test(normalized))
    throw new CsvImportError("CONTROL_CHARACTER_REJECTED");
  return normalized;
};
const parseObservedAt = (value: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp))
    throw new CsvImportError("INVALID_OBSERVED_AT");
  return new Date(timestamp).toISOString();
};
function canonicalizeRow(
  values: Record<string, string>,
  mapping: CsvMapping,
): CanonicalRow {
  const lookup = new Map(
    Object.entries(values).map(([key, value]) => [
      key.normalize("NFKC").trim().toLocaleLowerCase("und"),
      value,
    ]),
  );
  const result: CanonicalRow = {};
  for (const column of mapping.columns) {
    const raw =
      lookup.get(
        column.sourceHeader.normalize("NFKC").trim().toLocaleLowerCase("und"),
      ) ?? "";
    if (column.required && cleanText(raw) === "")
      throw new CsvImportError("REQUIRED_MAPPED_VALUE_MISSING");
    if (raw.trim() === "") continue;
    let value = cleanText(raw);
    switch (column.targetField) {
      case "email":
        value = normalizeEmail(value);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))
          throw new CsvImportError("INVALID_EMAIL");
        break;
      case "profile_url":
        value = normalizeProfileUrl(value);
        break;
      case "company_domain":
        value = normalizeDomain(value);
        break;
      case "connected_on":
      case "source_observed_at":
        value = parseObservedAt(value);
        break;
      default:
        break;
    }
    result[column.targetField] = value;
  }
  const fullName =
    result.full_name ??
    [result.first_name, result.last_name].filter(Boolean).join(" ");
  if (!fullName) throw new CsvImportError("PERSON_NAME_REQUIRED");
  result.full_name = cleanText(fullName);
  return result;
}
const claimEvidenceId = (
  workspaceId: string,
  sourceSnapshotId: string,
  sourceRecordId: string,
  claimType: string,
) =>
  workspaceScopedId(workspaceId, "evidence", {
    sourceSnapshotId,
    sourceRecordId,
    claimType,
  });
const stagedRows = (
  database: Database.Database,
): Iterable<{
  row_number: number;
  row_digest: string;
  canonical_json: string;
  group_digest: string;
}> =>
  database
    .prepare(
      "SELECT row_number,row_digest,canonical_json,group_digest FROM staged_rows ORDER BY row_number",
    )
    .iterate() as Iterable<{
    row_number: number;
    row_digest: string;
    canonical_json: string;
    group_digest: string;
  }>;

export function importCsv(
  request: ImportRequest,
  store: WorkspaceRepository,
): ImportResult {
  const workspace = store.getWorkspace(request.workspaceId);
  const consent = store.getConsent(
    request.workspaceId,
    request.consentRecordId,
  );
  if (
    consent?.contributorId !== request.contributorId ||
    consent.purposeId !== workspace?.purposeId
  )
    throw new CsvImportError("CONSENT_BINDING_INVALID");
  const now = new Date(request.importedAt);
  if (consent.status === "withdrawn" || consent.withdrawnAt)
    throw new CsvImportError("CONSENT_WITHDRAWN");
  if (consent.status !== "active") throw new CsvImportError("CONSENT_INACTIVE");
  if (now < new Date(consent.grantedAt))
    throw new CsvImportError("CONSENT_NOT_YET_ACTIVE");
  if (now >= new Date(consent.expiresAt))
    throw new CsvImportError("CONSENT_EXPIRED");
  const contributor = store.get(
    request.workspaceId,
    "contributor",
    request.contributorId,
  );
  if (
    contributor?.entityType !== "contributor" ||
    contributor.value.status !== "active"
  )
    throw new CsvImportError("CONTRIBUTOR_INACTIVE");
  const normalizedSourceKind = request.sourceKind
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("und");
  const sourceCovered = consent.sourceClasses.some((sourceClass) => {
    const normalized = sourceClass
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("und");
    return (
      normalized === normalizedSourceKind ||
      (normalized === "connections_csv" &&
        normalizedSourceKind.endsWith("connections_export")) ||
      (normalized === "connections_csv" &&
        normalizedSourceKind === "generic_contacts_csv")
    );
  });
  if (!sourceCovered) throw new CsvImportError("CONSENT_SOURCE_SCOPE_DENIED");
  const mapping = validateCsvMapping(request.mapping);
  const stageDirectory = mkdtempSync(join(tmpdir(), "warm-path-stage-"));
  chmodSync(stageDirectory, 0o700);
  const stagePath = join(stageDirectory, "rows.sqlite");
  const stage = new Database(stagePath);
  chmodSync(stagePath, 0o600);
  stage.pragma("journal_mode = DELETE");
  stage.exec(
    "CREATE TABLE staged_rows(row_number INTEGER PRIMARY KEY,row_digest TEXT NOT NULL,group_digest TEXT NOT NULL,canonical_json TEXT NOT NULL) STRICT; CREATE INDEX staged_group ON staged_rows(group_digest)",
  );
  const insert = stage.prepare("INSERT INTO staged_rows VALUES(?,?,?,?)");
  const failureMetadata = {
    workspaceId: request.workspaceId,
    contributorId: request.contributorId,
    consentRecordId: request.consentRecordId,
    sourceKind: request.sourceKind,
    mappingId: request.mappingId,
    mappingVersion: request.mappingVersion,
    startedAt: request.importedAt,
  };
  try {
    const parsed = parseCsvFile(
      request.file,
      request.importRoots,
      mapping,
      (row) => {
        const canonical = canonicalizeRow(row.values, mapping);
        const rowDigest = sha256Hex(canonicalJson(row.values));
        const groupDigest = sha256Hex(canonicalJson(canonical));
        insert.run(
          row.rowNumber,
          rowDigest,
          groupDigest,
          canonicalJson(canonical),
        );
      },
    );
    const binding = {
      ...failureMetadata,
      startedAt: undefined,
      rawSha256: parsed.rawSha256,
    };
    const idempotencyKey = sha256Hex(canonicalJson(binding));
    const existing = store
      .list(request.workspaceId, "source_snapshot")
      .find(
        (item) =>
          item.entityType === "source_snapshot" &&
          item.value.idempotencyKey === idempotencyKey,
      );
    if (existing?.entityType === "source_snapshot")
      return {
        status: "idempotent",
        sourceSnapshotId: existing.value.sourceSnapshotId,
        rawSha256: parsed.rawSha256,
        recordCount: existing.value.recordCount,
      };
    const rebinding = store
      .list(request.workspaceId, "source_snapshot")
      .find(
        (item) =>
          item.entityType === "source_snapshot" &&
          item.value.rawSha256 === parsed.rawSha256 &&
          item.value.idempotencyKey !== idempotencyKey,
      );
    if (rebinding) throw new CsvImportError("SNAPSHOT_REBINDING_REJECTED");
    const sourceSnapshotId = workspaceScopedId(
      request.workspaceId,
      "snapshot",
      binding,
    );
    store.transact(request.workspaceId, (tx) =>
      materialize(
        tx,
        store,
        request,
        stage,
        parsed,
        sourceSnapshotId,
        idempotencyKey,
      ),
    );
    return {
      status: "committed",
      sourceSnapshotId,
      rawSha256: parsed.rawSha256,
      recordCount: parsed.recordCount,
    };
  } catch (error) {
    const code =
      error instanceof CsvImportError ? error.code : "NORMALIZATION_FAILED";
    const failureKey = sha256Hex(canonicalJson({ ...failureMetadata, code }));
    try {
      store.put(request.workspaceId, {
        entityType: "import_transaction",
        value: {
          ...failureMetadata,
          importTransactionId: workspaceScopedId(
            request.workspaceId,
            "failed_import",
            failureKey,
          ),
          idempotencyKey: failureKey,
          status: "failed",
          completedAt: request.importedAt,
          failureCodes: [code],
        },
      });
    } catch {
      /* invalid request metadata is intentionally not persisted */
    }
    throw error instanceof CsvImportError ? error : new CsvImportError(code);
  } finally {
    stage.close();
    rmSync(stageDirectory, { recursive: true, force: true });
    if (request.stagedRawOwnedByProject)
      try {
        unlinkSync(request.file);
      } catch {
        /* best effort controlled staging cleanup */
      }
  }
}

function materialize(
  tx: TransactionContext,
  store: WorkspaceRepository,
  request: ImportRequest,
  stage: Database.Database,
  parsed: { rawSha256: string; byteCount: number; recordCount: number },
  sourceSnapshotId: string,
  idempotencyKey: string,
): void {
  tx.put({
    entityType: "source_snapshot",
    value: {
      workspaceId: request.workspaceId,
      sourceSnapshotId,
      contributorId: request.contributorId,
      consentRecordId: request.consentRecordId,
      sourceKind: request.sourceKind,
      rawSha256: parsed.rawSha256,
      idempotencyKey,
      mappingId: request.mappingId,
      mappingVersion: request.mappingVersion,
      importedAt: request.importedAt,
      byteCount: parsed.byteCount,
      recordCount: parsed.recordCount,
      rawRetained: false,
      networkAccessed: false,
      transformVersion: "csv-v2",
    },
  });
  const existingIdentities = store
    .list(request.workspaceId, "identity_claim")
    .flatMap((x) => (x.entityType === "identity_claim" ? [x.value] : []));
  const existingOrganizations = store
    .list(request.workspaceId, "organization_claim")
    .flatMap((x) => (x.entityType === "organization_claim" ? [x.value] : []));
  const existingEmployments = store
    .list(request.workspaceId, "employment_claim")
    .flatMap((x) => (x.entityType === "employment_claim" ? [x.value] : []));
  for (const staged of stagedRows(stage)) {
    const sourceRecordId = workspaceScopedId(request.workspaceId, "record", {
      sourceSnapshotId,
      rowNumber: staged.row_number,
      rowDigest: staged.row_digest,
    });
    for (const claimType of [
      "identity",
      "organization",
      "employment",
      "relationship",
    ] as const)
      tx.put({
        entityType: "evidence_ref",
        value: {
          workspaceId: request.workspaceId,
          evidenceRefId: claimEvidenceId(
            request.workspaceId,
            sourceSnapshotId,
            sourceRecordId,
            claimType,
          ),
          sourceSnapshotId,
          sourceRecordId,
          claimType,
          rowDigestSha256: staged.row_digest,
          transformVersion: "csv-v2",
        },
      });
  }
  for (const staged of stagedRows(stage)) {
    const first = stage
      .prepare(
        "SELECT MIN(row_number) AS row_number FROM staged_rows WHERE group_digest=?",
      )
      .get(staged.group_digest) as { row_number: number };
    if (staged.row_number !== first.row_number) continue;
    const row = JSON.parse(staged.canonical_json) as CanonicalRow;
    const sourceRecordId = workspaceScopedId(request.workspaceId, "record", {
      sourceSnapshotId,
      rowNumber: staged.row_number,
      rowDigest: staged.row_digest,
    });
    const evidenceByType = Object.fromEntries(
      ["identity", "organization", "employment", "relationship"].map(
        (claimType) => [
          claimType,
          claimEvidenceId(
            request.workspaceId,
            sourceSnapshotId,
            sourceRecordId,
            claimType,
          ),
        ],
      ),
    ) as Record<string, string>;
    const observedAt =
      row.source_observed_at ?? row.connected_on ?? request.importedAt;
    const namespace = request.sourceKind;
    const anchor = row.provider_person_id
      ? ["provider_id", row.provider_person_id]
      : row.crm_contact_id
        ? ["provider_id", row.crm_contact_id]
        : row.profile_url
          ? ["profile_url", row.profile_url]
          : row.email && emailRisk(row.email) === "unique_candidate"
            ? ["email", row.email]
            : ["row_group", staged.group_digest];
    const provisionalPersonId = workspaceScopedId(
      request.workspaceId,
      "person",
      { namespace, anchor },
    );
    const probeKind =
      anchor[0] === "row_group"
        ? "name"
        : (anchor[0] as "provider_id" | "profile_url" | "email");
    const fullName = row.full_name;
    if (!fullName) throw new CsvImportError("PERSON_NAME_REQUIRED");
    const probeValue =
      anchor[0] === "row_group" ? fullName : (anchor[1] ?? fullName);
    const probeQualifier = row.provider_person_id
      ? "provider_person"
      : row.crm_contact_id
        ? "crm_contact"
        : row.profile_url
          ? "profile"
          : row.email
            ? "email"
            : "name";
    const probe: IdentityClaim = {
      workspaceId: request.workspaceId,
      identityClaimId: "probe",
      personId: provisionalPersonId,
      kind: probeKind,
      namespace: `${namespace}:${probeQualifier}`,
      value: probeValue,
      evidenceRefs: [evidenceByType["identity"] ?? failEvidence()],
      confidence: 1,
      observedAt,
      reviewStatus: "unreviewed",
    };
    const resolution = resolvePersonClaim(probe, existingIdentities);
    const personId =
      resolution.outcome === "exact"
        ? (resolution.personIds[0] ?? provisionalPersonId)
        : resolution.personIds.length > 0
          ? workspaceScopedId(request.workspaceId, "unresolved_person", {
              sourceSnapshotId,
              group: staged.group_digest,
            })
          : provisionalPersonId;
    tx.put({
      entityType: "person",
      value: {
        workspaceId: request.workspaceId,
        personId,
        displayName: fullName,
        createdAt: request.importedAt,
      },
    });
    if (resolution.outcome === "review")
      tx.put({
        entityType: "person_resolution_candidate",
        value: {
          workspaceId: request.workspaceId,
          resolutionCandidateId: workspaceScopedId(
            request.workspaceId,
            "person_review",
            { sourceSnapshotId, group: staged.group_digest },
          ),
          subjectPersonId: personId,
          candidatePersonIds: resolution.personIds.length
            ? resolution.personIds
            : [personId],
          signals: resolution.signals.length
            ? resolution.signals
            : ["ambiguous_identity"],
          confidence: 0,
          status: "pending",
          automaticMergeAllowed: false,
        },
      });
    const identityValues: [
      "name" | "email" | "profile_url" | "provider_id",
      string,
      string,
    ][] = [["name", fullName, "name"]];
    if (row.email) identityValues.push(["email", row.email, "email"]);
    if (row.profile_url)
      identityValues.push(["profile_url", row.profile_url, "profile"]);
    if (row.provider_person_id)
      identityValues.push([
        "provider_id",
        row.provider_person_id,
        "provider_person",
      ]);
    if (row.crm_contact_id)
      identityValues.push(["provider_id", row.crm_contact_id, "crm_contact"]);
    for (const [kind, value, qualifier] of identityValues) {
      const claim = {
        workspaceId: request.workspaceId,
        identityClaimId: workspaceScopedId(
          request.workspaceId,
          "identity_claim",
          { personId, namespace, kind, value, sourceSnapshotId },
        ),
        personId,
        kind,
        namespace: `${namespace}:${qualifier}`,
        value,
        evidenceRefs: [evidenceByType["identity"] ?? failEvidence()],
        confidence: kind === "name" ? 0.6 : 1,
        observedAt,
        reviewStatus:
          resolution.outcome === "review"
            ? ("conflicted" as const)
            : ("unreviewed" as const),
      };
      tx.put({ entityType: "identity_claim", value: claim });
      existingIdentities.push(claim);
    }
    let organizationId: string | undefined;
    if (
      row.company_domain ||
      row.crm_account_id ||
      row.provider_organization_id ||
      row.company_name
    ) {
      const orgKind =
        row.crm_account_id || row.provider_organization_id
          ? "crm_id"
          : row.company_domain
            ? "domain"
            : "name";
      const orgValue =
        row.crm_account_id ??
        row.provider_organization_id ??
        row.company_domain ??
        row.company_name ??
        "Unreviewed organization";
      const provisionalOrganizationId = workspaceScopedId(
        request.workspaceId,
        "organization",
        { namespace, orgKind, orgValue },
      );
      const orgProbe: OrganizationClaim = {
        workspaceId: request.workspaceId,
        organizationClaimId: "probe",
        organizationId: provisionalOrganizationId,
        kind: orgKind,
        namespace,
        value: orgValue,
        evidenceRefs: [evidenceByType["organization"] ?? failEvidence()],
        confidence: 1,
        observedAt,
        reviewStatus: "unreviewed" as const,
      };
      const orgResolution = resolveOrganizationClaim(
        orgProbe,
        existingOrganizations,
      );
      organizationId =
        orgResolution.outcome === "exact"
          ? (orgResolution.organizationIds[0] ?? provisionalOrganizationId)
          : provisionalOrganizationId;
      tx.put({
        entityType: "organization",
        value: {
          workspaceId: request.workspaceId,
          organizationId,
          canonicalName:
            row.company_name ?? row.company_domain ?? "Unreviewed organization",
          createdAt: request.importedAt,
        },
      });
      const orgClaims: ["name" | "domain" | "crm_id", string][] = [];
      if (row.company_name) orgClaims.push(["name", row.company_name]);
      if (row.company_domain) orgClaims.push(["domain", row.company_domain]);
      if (row.crm_account_id) orgClaims.push(["crm_id", row.crm_account_id]);
      if (row.provider_organization_id)
        orgClaims.push(["crm_id", row.provider_organization_id]);
      for (const [kind, value] of orgClaims) {
        const claim = {
          workspaceId: request.workspaceId,
          organizationClaimId: workspaceScopedId(
            request.workspaceId,
            "organization_claim",
            { organizationId, namespace, kind, value, sourceSnapshotId },
          ),
          organizationId,
          kind,
          namespace,
          value,
          evidenceRefs: [evidenceByType["organization"] ?? failEvidence()],
          confidence: kind === "name" ? 0.5 : 1,
          observedAt,
          reviewStatus:
            orgResolution.outcome === "review"
              ? ("unreviewed" as const)
              : ("approved" as const),
        };
        tx.put({ entityType: "organization_claim", value: claim });
        existingOrganizations.push(claim);
      }
      if (orgResolution.outcome === "review")
        tx.put({
          entityType: "organization_alias_candidate",
          value: {
            workspaceId: request.workspaceId,
            organizationAliasCandidateId: workspaceScopedId(
              request.workspaceId,
              "organization_review",
              { sourceSnapshotId, group: staged.group_digest },
            ),
            proposedOrganizationId: organizationId,
            aliasKind: orgKind,
            aliasValue: orgValue,
            evidenceRefs: [evidenceByType["organization"] ?? failEvidence()],
            conflictOrganizationIds: orgResolution.organizationIds,
            consequences: [
              "employment_and_account_matching_ineligible_until_review",
            ],
            status: "pending",
          },
        });
      const employment: EmploymentClaim = {
        workspaceId: request.workspaceId,
        employmentClaimId: workspaceScopedId(
          request.workspaceId,
          "employment",
          {
            personId,
            organizationId,
            title: row.title ?? "",
            sourceSnapshotId,
          },
        ),
        personId,
        organizationId,
        title: row.title,
        state: "current" as const,
        evidenceRefs: [evidenceByType["employment"] ?? failEvidence()],
        confidence: 0.7,
        observedAt,
        reviewStatus: "unreviewed" as const,
      };
      const age =
        (Date.parse(request.importedAt) - Date.parse(observedAt)) / 86_400_000;
      const conflict = existingEmployments.some(
        (x) =>
          x.personId === personId &&
          x.organizationId !== organizationId &&
          x.state === "current" &&
          Math.abs(Date.parse(x.observedAt) - Date.parse(observedAt)) <=
            365 * 86_400_000,
      );
      employment.reviewStatus = conflict
        ? "conflicted"
        : !Number.isFinite(age) || age > 365
          ? "unreviewed"
          : "approved";
      tx.put({ entityType: "employment_claim", value: employment });
      existingEmployments.push(employment);
    }
    const duplicateEvidence = stage
      .prepare(
        "SELECT row_number,row_digest FROM staged_rows WHERE group_digest=? ORDER BY row_number",
      )
      .all(staged.group_digest) as { row_number: number; row_digest: string }[];
    const relationshipEvidence = duplicateEvidence.map((duplicate) =>
      claimEvidenceId(
        request.workspaceId,
        sourceSnapshotId,
        workspaceScopedId(request.workspaceId, "record", {
          sourceSnapshotId,
          rowNumber: duplicate.row_number,
          rowDigest: duplicate.row_digest,
        }),
        "relationship",
      ),
    );
    tx.put({
      entityType: "relationship_edge",
      value: {
        workspaceId: request.workspaceId,
        relationshipEdgeId: workspaceScopedId(request.workspaceId, "edge", {
          contributorId: request.contributorId,
          sourceSnapshotId,
          personId,
        }),
        contributorId: request.contributorId,
        destinationPersonId: personId,
        consentRecordId: request.consentRecordId,
        sourceSnapshotId,
        assertionKind: "contributed_direct_connection",
        observedAt,
        confidence: 1,
        evidenceRefs: relationshipEvidence,
        eligible: resolution.outcome !== "review",
      },
    });
  }
  tx.put({
    entityType: "import_transaction",
    value: {
      workspaceId: request.workspaceId,
      importTransactionId: workspaceScopedId(
        request.workspaceId,
        "import",
        idempotencyKey,
      ),
      contributorId: request.contributorId,
      consentRecordId: request.consentRecordId,
      sourceKind: request.sourceKind,
      mappingId: request.mappingId,
      mappingVersion: request.mappingVersion,
      rawSha256: parsed.rawSha256,
      idempotencyKey,
      status: "committed",
      startedAt: request.importedAt,
      completedAt: request.importedAt,
      sourceSnapshotId,
      failureCodes: [],
    },
  });
}
