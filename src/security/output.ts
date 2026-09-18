const leadingRisk =
  /^[\u0000-\u0020\u007f\u0080-\u009f\u00a0\u1680\u2000-\u200f\u2028\u202f\u205f\u2060\u2066-\u2069\u3000\ufeff]*/u;
const terminalControl =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/gu;

export function neutralizeFormulaCell(value: unknown): string {
  const original = String(value).replaceAll("\u0000", "");
  const prefix = leadingRisk.exec(original)?.[0] ?? "";
  const next = original.slice(prefix.length, prefix.length + 1);
  if (/^[=+\-@]$/u.test(next) || /^[\t\r\n]$/u.test(original.slice(0, 1)))
    return `'${original}`;
  return original;
}

export function escapeTerminalControls(value: unknown): string {
  return String(value)
    .replaceAll("\u001b", "\\u001b")
    .replace(
      terminalControl,
      (character) =>
        `\\u${character.codePointAt(0)?.toString(16).padStart(4, "0") ?? "fffd"}`,
    )
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
}
