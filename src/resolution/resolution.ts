import type {
  EmploymentClaim,
  IdentityClaim,
  OrganizationClaim,
} from "../domain/models.js";

const SHARED_LOCAL_PARTS = new Set([
  "admin",
  "contact",
  "hello",
  "info",
  "office",
  "sales",
  "support",
  "team",
]);
const FREE_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
]);
export const normalizeEmail = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("und");
export const normalizeProfileUrl = (value: string): string => {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("PROFILE_URL_NOT_HTTPS");
  parsed.hash = "";
  parsed.search = "";
  return `${parsed.origin.toLocaleLowerCase("und")}${parsed.pathname.replace(/\/+$/u, "")}`;
};
export const normalizeDomain = (value: string): string => {
  const raw =
    value
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("und")
      .replace(/^https?:\/\//u, "")
      .split("/")[0] ?? "";
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(raw))
    throw new Error("INVALID_DOMAIN");
  return raw;
};
export function emailRisk(
  value: string,
): "unique_candidate" | "shared_or_role" {
  const email = normalizeEmail(value);
  const [local, domain] = email.split("@");
  if (
    !local ||
    !domain ||
    SHARED_LOCAL_PARTS.has(local) ||
    FREE_DOMAINS.has(domain) ||
    /^(?:family|household|the[a-z]+s)$/u.test(local)
  )
    return "shared_or_role";
  return "unique_candidate";
}
export interface PersonResolution {
  outcome: "exact" | "review" | "new";
  personIds: string[];
  signals: string[];
}
export function resolvePersonClaim(
  incoming: IdentityClaim,
  existing: IdentityClaim[],
): PersonResolution {
  const sameNamespace = existing.filter(
    (claim) =>
      claim.workspaceId === incoming.workspaceId &&
      claim.namespace === incoming.namespace &&
      claim.kind === incoming.kind,
  );
  const normalize =
    incoming.kind === "email"
      ? normalizeEmail
      : incoming.kind === "profile_url"
        ? normalizeProfileUrl
        : (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase("und");
  const exact = [
    ...new Set(
      sameNamespace
        .filter((claim) => normalize(claim.value) === normalize(incoming.value))
        .map((claim) => claim.personId),
    ),
  ];
  const safe =
    incoming.kind === "provider_id" ||
    incoming.kind === "profile_url" ||
    (incoming.kind === "email" &&
      emailRisk(incoming.value) === "unique_candidate");
  if (exact.length === 1 && safe)
    return {
      outcome: "exact",
      personIds: exact,
      signals: [`exact_${incoming.kind}`],
    };
  if (exact.length > 0 || incoming.kind === "name" || !safe)
    return {
      outcome: "review",
      personIds: exact,
      signals:
        exact.length > 1
          ? ["identifier_collision"]
          : [`ambiguous_${incoming.kind}`],
    };
  return { outcome: "new", personIds: [], signals: [] };
}
export interface OrganizationResolution {
  outcome: "exact" | "review" | "new";
  organizationIds: string[];
  signals: string[];
}
export function resolveOrganizationClaim(
  incoming: OrganizationClaim,
  existing: OrganizationClaim[],
): OrganizationResolution {
  const normalize =
    incoming.kind === "domain"
      ? normalizeDomain
      : (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase("und");
  const exact = [
    ...new Set(
      existing
        .filter(
          (claim) =>
            claim.workspaceId === incoming.workspaceId &&
            claim.kind === incoming.kind &&
            claim.namespace === incoming.namespace &&
            normalize(claim.value) === normalize(incoming.value),
        )
        .map((claim) => claim.organizationId),
    ),
  ];
  const safe =
    incoming.kind === "crm_id" ||
    (incoming.kind === "domain" &&
      !FREE_DOMAINS.has(normalize(incoming.value)));
  if (exact.length === 1 && safe)
    return {
      outcome: "exact",
      organizationIds: exact,
      signals: [`exact_${incoming.kind}`],
    };
  if (
    exact.length ||
    incoming.kind === "name" ||
    incoming.kind === "alias" ||
    !safe
  )
    return {
      outcome: "review",
      organizationIds: exact,
      signals:
        exact.length > 1
          ? ["organization_collision"]
          : ["organization_alias_review"],
    };
  return { outcome: "new", organizationIds: [], signals: [] };
}
export type EmploymentDisposition =
  | "potentially_current"
  | "review_only"
  | "stale"
  | "blocked_ended"
  | "blocked_conflict";
export function evaluateEmployment(
  claim: EmploymentClaim,
  all: EmploymentClaim[],
  at: Date,
): EmploymentDisposition {
  const relevant = all.filter(
    (item) =>
      item.workspaceId === claim.workspaceId &&
      item.personId === claim.personId,
  );
  const laterEnded = relevant.some(
    (item) =>
      item.state === "ended" &&
      Date.parse(item.observedAt) >= Date.parse(claim.observedAt),
  );
  if (claim.state === "ended" || laterEnded) return "blocked_ended";
  const conflicting = relevant.some(
    (item) =>
      item.state === "current" &&
      item.organizationId !== claim.organizationId &&
      Math.abs(Date.parse(item.observedAt) - Date.parse(claim.observedAt)) <=
        365 * 86_400_000,
  );
  if (conflicting) return "blocked_conflict";
  const age = Math.floor(
    (at.getTime() - Date.parse(claim.observedAt)) / 86_400_000,
  );
  if (!Number.isFinite(age) || age < 0 || claim.state === "unknown")
    return "stale";
  if (age <= 365) return "potentially_current";
  if (age <= 730) return "review_only";
  return "stale";
}
