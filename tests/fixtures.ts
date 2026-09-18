import type {
  ConsentRecord,
  Contributor,
  Person,
  Workspace,
} from "../src/domain/models.js";
export const now = "2026-09-18T00:00:00.000Z";
export const workspace = (workspaceId = "workspace_one"): Workspace => ({
  workspaceId,
  name: "Fictional Workspace",
  ownerActorId: "actor_owner",
  purposeId: "purpose_audit",
  policyVersion: "1",
  createdAt: now,
});
export const contributor = (workspaceId = "workspace_one"): Contributor => ({
  workspaceId,
  contributorId: "contributor_casey",
  displayName: "Casey Example",
  kind: "owner",
  status: "active",
  createdAt: now,
});
export const person = (workspaceId = "workspace_one"): Person => ({
  workspaceId,
  personId: "person_alex",
  displayName: "Alex Example",
  createdAt: now,
});
export const consent = (
  workspaceId = "workspace_one",
  overrides: Partial<ConsentRecord> = {},
): ConsentRecord => ({
  workspaceId,
  consentRecordId: "consent_casey",
  contributorId: "contributor_casey",
  authorizationBasis: "individual_consent",
  purposeId: "purpose_audit",
  noticeVersion: "1",
  sourceClasses: ["connections_csv"],
  allowedCategories: ["A", "B", "C", "D"],
  brokerDisclosure: "redacted_in_exports",
  sanitizedExportAllowed: true,
  grantedAt: now,
  expiresAt: "2027-09-18T00:00:00.000Z",
  status: "active",
  retentionPolicyId: "retention_safe",
  grantMethod: "local_cli_confirmation",
  ...overrides,
});
