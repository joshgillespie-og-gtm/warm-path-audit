#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
const markdownFiles = [
  ...fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(root, entry.name)),
  ...walk(path.join(root, "docs")).filter((file) => file.endsWith(".md")),
];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
let localLinks = 0;
let mermaidBlocks = 0;
for (const file of markdownFiles) {
  const text = fs.readFileSync(file, "utf8");
  const fences = text.match(/^```/gm)?.length ?? 0;
  assert.equal(
    fences % 2,
    0,
    `unbalanced code fences: ${path.relative(root, file)}`,
  );
  for (const match of text.matchAll(linkPattern)) {
    const raw = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/i.test(raw)) continue;
    const withoutAnchor = decodeURIComponent(raw.split("#", 1)[0]);
    if (!withoutAnchor) continue;
    const target = path.resolve(path.dirname(file), withoutAnchor);
    assert.ok(
      fs.existsSync(target),
      `broken local link ${raw} in ${path.relative(root, file)}`,
    );
    localLinks += 1;
  }
  for (const match of text.matchAll(/```mermaid\s*\n([^\n]+)/g)) {
    assert.match(
      match[1].trim(),
      /^(?:flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram)\b/,
      `unsupported Mermaid header in ${path.relative(root, file)}`,
    );
    mermaidBlocks += 1;
  }
}
console.log(
  `Documentation check passed: ${markdownFiles.length} Markdown files; ${localLinks} local links; ${mermaidBlocks} Mermaid blocks.`,
);
