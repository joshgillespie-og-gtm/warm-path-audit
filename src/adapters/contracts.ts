import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const iso = z.iso.datetime({ offset: true });

export const adapterCapabilitySchema = z.enum([
  "read_crm_metadata",
  "read_email_metadata",
  "read_calendar_metadata",
]);
export type AdapterCapability = z.infer<typeof adapterCapabilitySchema>;

export const adapterFieldSchema = z.enum([
  "person_name",
  "person_email",
  "person_provider_id",
  "organization_name",
  "organization_domain",
  "crm_account_id",
  "crm_contact_id",
  "crm_owner_id",
  "crm_opportunity_stage",
  "crm_suppression_state",
  "participant_addresses",
  "event_timestamp",
  "thread_id",
  "direction",
  "interaction_count",
  "organizer_address",
  "start_at",
  "end_at",
  "rsvp",
  "attendance",
]);
export type AdapterField = z.infer<typeof adapterFieldSchema>;

export const adapterAuthorizationSchema = z
  .strictObject({
    workspaceId: id,
    adapterAuthorizationId: id,
    adapterId: id,
    provider: z.string().min(1).max(100),
    providerTenantId: z.string().min(1).max(200),
    authorizationBasis: z.enum([
      "oauth_read_only",
      "api_key_read_only",
      "authorized_local_fixture",
    ]),
    purposeId: id,
    capabilities: z.array(adapterCapabilitySchema).min(1),
    fieldAllowlist: z.array(adapterFieldSchema).min(1),
    timeWindow: z.strictObject({ from: iso, to: iso }),
    retentionDays: z.number().int().min(1).max(365),
    authorizedAt: iso,
    expiresAt: iso,
    status: z.enum(["active", "expired", "revoked"]),
    revokedAt: iso.optional(),
    credentialsEmbedded: z.literal(false),
  })
  .superRefine((value, ctx) => {
    if (value.status === "revoked" && !value.revokedAt)
      ctx.addIssue({ code: "custom", message: "REVOKED_AT_REQUIRED" });
    if (Date.parse(value.timeWindow.from) > Date.parse(value.timeWindow.to))
      ctx.addIssue({ code: "custom", message: "INVALID_TIME_WINDOW" });
    if (new Set(value.capabilities).size !== value.capabilities.length)
      ctx.addIssue({ code: "custom", message: "DUPLICATE_CAPABILITY" });
    if (new Set(value.fieldAllowlist).size !== value.fieldAllowlist.length)
      ctx.addIssue({ code: "custom", message: "DUPLICATE_FIELD" });
  });
export type AdapterAuthorization = z.infer<typeof adapterAuthorizationSchema>;

const commonRecord = {
  workspaceId: id,
  adapterAuthorizationId: id,
  providerTenantId: z.string().min(1).max(200),
  providerRecordId: z.string().min(1).max(500),
  observedAt: iso,
  personName: z.string().min(1).max(200),
  personEmail: z.email().max(320).optional(),
  personProviderId: z.string().min(1).max(500).optional(),
  organizationName: z.string().min(1).max(300).optional(),
  organizationDomain: z.string().min(1).max(253).optional(),
};
export const crmAdapterRecordSchema = z.strictObject({
  ...commonRecord,
  kind: z.literal("crm"),
  crmAccountId: z.string().min(1).max(500).optional(),
  crmContactId: z.string().min(1).max(500).optional(),
  crmOwnerId: z.string().min(1).max(500).optional(),
  opportunityStage: z.string().min(1).max(200).optional(),
  suppressionState: z.string().min(1).max(200).optional(),
});
export const emailAdapterRecordSchema = z.strictObject({
  ...commonRecord,
  kind: z.literal("email"),
  participantAddresses: z.array(z.email().max(320)).min(1).max(100),
  eventTimestamp: iso,
  threadId: z.string().min(1).max(500).optional(),
  direction: z.enum(["inbound", "outbound", "mixed", "unknown"]).optional(),
  interactionCount: z.number().int().min(1).max(1_000_000).optional(),
});
export const calendarAdapterRecordSchema = z.strictObject({
  ...commonRecord,
  kind: z.literal("calendar"),
  participantAddresses: z.array(z.email().max(320)).min(1).max(100),
  organizerAddress: z.email().max(320).optional(),
  startAt: iso,
  endAt: iso,
  rsvp: z.enum(["accepted", "declined", "tentative", "unknown"]).optional(),
  attendance: z.enum(["attended", "absent", "unknown"]).optional(),
});
export const adapterRecordSchema = z.discriminatedUnion("kind", [
  crmAdapterRecordSchema,
  emailAdapterRecordSchema,
  calendarAdapterRecordSchema,
]);
export type AdapterRecord = z.infer<typeof adapterRecordSchema>;

export const adapterErrorSchema = z.strictObject({
  code: z.enum([
    "RATE_LIMITED",
    "TEMPORARY",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "INVALID_RESPONSE",
  ]),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().min(0).max(86_400).optional(),
  providerStatus: z.number().int().min(100).max(599).optional(),
});
export type AdapterError = z.infer<typeof adapterErrorSchema>;

export const adapterPageSchema = z.strictObject({
  records: z.array(adapterRecordSchema).max(1_000),
  nextCursor: z.string().min(1).max(2_000).nullable(),
  error: adapterErrorSchema.optional(),
  networkAccessed: z.literal(false),
});
export type AdapterPage = z.infer<typeof adapterPageSchema>;

export interface ReadOnlyAdapter {
  readonly declaration: {
    adapterId: string;
    provider: string;
    capability: AdapterCapability;
    readOnly: boolean;
    supportedFields: readonly AdapterField[];
    implementationStatus: "local_fixture_reference";
    networkAccessed: boolean;
  };
  readPage(input: { cursor: string | null; limit: number }): AdapterPage;
}

export class AdapterBoundaryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AdapterBoundaryError";
  }
}
