import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const root = new URL("..", import.meta.url).pathname;
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules" || name === "dist" || name === ".git")
      return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
describe("package boundaries", () => {
  it("contains no network or process execution imports in source", () => {
    const source = walk(join(root, "src"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(
      /node:(?:http|https|net|tls|dns|child_process|cluster|dgram)/,
    );
    expect(source).not.toMatch(
      /\b(?:globalThis\.)?(?:fetch|XMLHttpRequest|WebSocket)\s*\(/,
    );
    expect(source).not.toMatch(
      /\b(?:execFile|execFileSync|spawn|spawnSync)\s*\(/,
    );
  });
  it("exposes only the optional read-only adapter boundary and no mutation module", () => {
    const files = walk(join(root, "src"));
    const adapterFiles = files
      .filter((file) => file.includes("/adapters/"))
      .map((file) => file.slice(file.lastIndexOf("/adapters/") + 10))
      .sort();
    expect(adapterFiles).toEqual([
      "contracts.ts",
      "fixture-adapter.ts",
      "ingest.ts",
    ]);
    expect(files.join("\n")).not.toMatch(/outreach|crm-write|send-email/i);
  });
  it("keeps package private and archives narrow", () => {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { private: boolean; files: string[] };
    expect(pkg.private).toBe(true);
    expect(pkg.files).toEqual([
      "dist",
      "schemas",
      "README.md",
      "docs",
      "examples",
      "LICENSE",
      "CHANGELOG.md",
      "RELEASE-NOTES.md",
      "SECURITY.md",
      "SUPPORT.md",
      "GOVERNANCE.md",
      "NAME-REVIEW.md",
      "NOTICE",
      "AUDIT.md",
      "RELEASE-CHECKLIST.md",
    ]);
  });
});
