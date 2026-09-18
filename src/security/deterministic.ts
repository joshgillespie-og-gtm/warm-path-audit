import { createHmac, createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON rejects non-finite numbers");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, "en"));
    return Object.fromEntries(
      entries.map(([key, item]) => [key, normalize(item)]),
    );
  }
  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function workspaceScopedId(
  workspaceId: string,
  kind: string,
  input: unknown,
): string {
  if (!workspaceId || !kind)
    throw new TypeError("workspaceId and kind are required");
  const digest = createHmac("sha256", workspaceId)
    .update(`${kind}\n${canonicalJson(input)}`)
    .digest("hex")
    .slice(0, 32);
  return `${kind}_${digest}`;
}
