import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function assertSafeDatabasePath(path: string): void {
  if (!isAbsolute(path)) throw new Error("ABSOLUTE_DATABASE_PATH_REQUIRED");
  if (path === "/" || path === "/home" || path === "/home/app")
    throw new Error("UNSAFE_DATABASE_PATH");
  if (existsSync(path) && lstatSync(path).isSymbolicLink())
    throw new Error("SYMLINK_DATABASE_REJECTED");
  const parent = dirname(path);
  if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
    throw new Error("SYMLINK_PARENT_REJECTED");
}
export function assertResetPath(path: string, allowedRoot: string): void {
  assertSafeDatabasePath(path);
  if (!isAbsolute(allowedRoot)) throw new Error("ABSOLUTE_RESET_ROOT_REQUIRED");
  const root = realpathSync(allowedRoot);
  const target = resolve(path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("RESET_PATH_OUTSIDE_SCOPE");
  if (existsSync(target)) {
    const existing = lstatSync(target);
    if (!existing.isFile()) throw new Error("RESET_REGULAR_FILE_REQUIRED");
    if (existing.nlink !== 1) throw new Error("RESET_HARDLINK_REJECTED");
  }
  for (const sidecar of [`${target}-wal`, `${target}-shm`])
    if (existsSync(sidecar)) {
      const existing = lstatSync(sidecar);
      if (!existing.isFile() || existing.nlink !== 1)
        throw new Error("RESET_UNSAFE_SIDECAR_REJECTED");
    }
}
