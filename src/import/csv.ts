import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

export const DEFAULT_CSV_LIMITS = Object.freeze({
  maxFileBytes: 100 * 1024 * 1024,
  maxDataRows: 100_000,
  maxRowBytes: 1024 * 1024,
  maxFieldBytes: 256 * 1024,
  maxColumns: 256,
});
const limitsSchema = z.strictObject({
  maxFileBytes: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_CSV_LIMITS.maxFileBytes),
  maxDataRows: z.number().int().positive().max(DEFAULT_CSV_LIMITS.maxDataRows),
  maxRowBytes: z.number().int().positive().max(DEFAULT_CSV_LIMITS.maxRowBytes),
  maxFieldBytes: z
    .number()
    .int()
    .positive()
    .max(DEFAULT_CSV_LIMITS.maxFieldBytes),
  maxColumns: z.number().int().positive().max(DEFAULT_CSV_LIMITS.maxColumns),
});
export type CsvLimits = z.infer<typeof limitsSchema>;
export const canonicalTargetFieldSchema = z.enum([
  "first_name",
  "last_name",
  "full_name",
  "email",
  "profile_url",
  "company_name",
  "company_domain",
  "title",
  "connected_on",
  "source_observed_at",
  "provider_person_id",
  "provider_organization_id",
  "crm_contact_id",
  "crm_account_id",
]);
export type CanonicalTargetField = z.infer<typeof canonicalTargetFieldSchema>;
const transformSchema = z.enum([
  "trim",
  "unicode_nfkc",
  "casefold",
  "email_normalize",
  "url_syntax_validate",
  "domain_normalize",
  "iso_date_parse",
  "control_character_reject",
]);
const columnSchema = z.strictObject({
  sourceHeader: z.string().min(1).max(256),
  targetField: canonicalTargetFieldSchema,
  required: z.boolean(),
  transforms: z.array(transformSchema).max(8).optional(),
});
export const csvMappingSchema = z
  .strictObject({
    delimiter: z.enum([",", ";", "\t", "|"]),
    header: z.strictObject({
      mode: z.enum(["first_record", "detect_required_headers"]),
      requiredSourceHeaders: z
        .array(z.string().min(1).max(256))
        .max(256)
        .optional(),
      maxPreambleLines: z.number().int().min(0).max(100),
    }),
    columns: z.array(columnSchema).min(1).max(256),
    limits: limitsSchema.partial().optional(),
  })
  .superRefine((mapping, context) => {
    const sources = mapping.columns.map((column) =>
      headerKey(column.sourceHeader),
    );
    const targets = mapping.columns.map((column) => column.targetField);
    if (new Set(sources).size !== sources.length)
      context.addIssue({ code: "custom", message: "DUPLICATE_SOURCE_MAPPING" });
    if (new Set(targets).size !== targets.length)
      context.addIssue({ code: "custom", message: "DUPLICATE_TARGET_FIELD" });
    const targetSet = new Set(targets);
    if (
      !targetSet.has("full_name") &&
      !(targetSet.has("first_name") && targetSet.has("last_name"))
    )
      context.addIssue({
        code: "custom",
        message: "PERSON_NAME_MAPPING_REQUIRED",
      });
  });
export type CsvMapping = z.infer<typeof csvMappingSchema>;
export interface ParsedCsvRow {
  rowNumber: number;
  values: Record<string, string>;
}
export interface CsvParseResult {
  byteCount: number;
  recordCount: number;
  headers: string[];
  preambleLines: number;
  rawSha256: string;
}
export class CsvImportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CsvImportError";
  }
}
const headerKey = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("und");
export function validateCsvMapping(input: unknown): CsvMapping {
  const parsed = csvMappingSchema.safeParse(input);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((issue) => issue.code === "custom");
    throw new CsvImportError(custom?.message ?? "INVALID_MAPPING");
  }
  return parsed.data;
}
export function assertSafeImportFile(
  file: string,
  roots: string[],
): { fd: number; size: number } {
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(file))
    throw new CsvImportError("URL_INPUT_REJECTED");
  if (!isAbsolute(file)) throw new CsvImportError("ABSOLUTE_PATH_REQUIRED");
  const approved = roots.some((root) => {
    const rel = relative(realpathSync(root), resolve(file));
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  });
  if (!approved) throw new CsvImportError("OUTSIDE_IMPORT_ROOT");
  const before = statSync(file, { throwIfNoEntry: true });
  if (!before.isFile()) throw new CsvImportError("REGULAR_FILE_REQUIRED");
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  let fd: number;
  try {
    fd = openSync(file, constants.O_RDONLY | noFollow);
  } catch {
    throw new CsvImportError("FILE_OPEN_REJECTED");
  }
  const after = fstatSync(fd);
  if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) {
    closeSync(fd);
    throw new CsvImportError("FILE_IDENTITY_CHANGED");
  }
  return { fd, size: after.size };
}
export function parseCsvFile(
  file: string,
  roots: string[],
  mappingInput: CsvMapping,
  onRow: (row: ParsedCsvRow) => void,
): CsvParseResult {
  const mapping = validateCsvMapping(mappingInput);
  const limits = limitsSchema.parse({
    ...DEFAULT_CSV_LIMITS,
    ...mapping.limits,
  });
  const opened = assertSafeImportFile(file, roots);
  if (opened.size > limits.maxFileBytes) {
    closeSync(opened.fd);
    throw new CsvImportError("FILE_TOO_LARGE");
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytes = 0,
    fieldBytes = 0,
    rowBytes = 0,
    dataRows = 0,
    preamble = 0;
  let field = "",
    row: string[] = [],
    quoted = false,
    quoteClosed = false;
  let headers: string[] | undefined;
  const required = (
    mapping.header.requiredSourceHeaders ??
    mapping.columns.map((c) => c.sourceHeader)
  ).map(headerKey);
  const finishField = (): void => {
    if (row.length >= limits.maxColumns)
      throw new CsvImportError("TOO_MANY_COLUMNS");
    row.push(field);
    field = "";
    fieldBytes = 0;
    quoteClosed = false;
  };
  const finishRecord = (): void => {
    finishField();
    if (!headers) {
      const keys = row.map(headerKey);
      const hasCollision = new Set(keys).size !== keys.length;
      const isHeader =
        mapping.header.mode === "first_record" ||
        required.every((h) => keys.includes(h));
      if (
        hasCollision &&
        (isHeader || keys.some((key) => required.includes(key)))
      )
        throw new CsvImportError("HEADER_COLLISION");
      if (!isHeader) {
        preamble++;
        if (preamble > mapping.header.maxPreambleLines)
          throw new CsvImportError("HEADER_NOT_FOUND");
      } else {
        if (keys.some((h) => !h)) throw new CsvImportError("HEADER_COLLISION");
        const unique = new Set(keys);
        for (const wanted of required)
          if (!unique.has(wanted))
            throw new CsvImportError("REQUIRED_HEADER_MISSING");
        headers = [...row];
      }
    } else {
      if (row.length !== headers.length)
        throw new CsvImportError("COLUMN_COUNT_MISMATCH");
      dataRows++;
      if (dataRows > limits.maxDataRows)
        throw new CsvImportError("TOO_MANY_ROWS");
      onRow({
        rowNumber: dataRows,
        values: Object.fromEntries(
          headers.map((h, index) => [h, row[index] ?? ""]),
        ),
      });
    }
    row = [];
    rowBytes = 0;
  };
  const consume = (text: string): void => {
    for (const char of text) {
      const width = Buffer.byteLength(char);
      rowBytes += width;
      if (rowBytes > limits.maxRowBytes)
        throw new CsvImportError("ROW_TOO_LARGE");
      if (quoted) {
        if (char === '"') {
          quoted = false;
          quoteClosed = true;
        } else {
          field += char;
          fieldBytes += width;
        }
      } else if (quoteClosed && char === '"') {
        quoted = true;
        quoteClosed = false;
        field += '"';
        fieldBytes++;
      } else if (
        quoteClosed &&
        char !== mapping.delimiter &&
        char !== "\r" &&
        char !== "\n"
      )
        throw new CsvImportError("MALFORMED_QUOTING");
      else if (char === '"') {
        if (field.length !== 0) throw new CsvImportError("MALFORMED_QUOTING");
        quoted = true;
      } else if (char === mapping.delimiter) finishField();
      else if (char === "\n") finishRecord();
      else if (char !== "\r") {
        field += char;
        fieldBytes += width;
      }
      if (fieldBytes > limits.maxFieldBytes)
        throw new CsvImportError("FIELD_TOO_LARGE");
    }
  };
  try {
    let first = true;
    for (;;) {
      const count = readSync(opened.fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      bytes += count;
      if (bytes > limits.maxFileBytes)
        throw new CsvImportError("FILE_TOO_LARGE");
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      if (first) {
        first = false;
        const hex = chunk.subarray(0, 4).toString("hex");
        if (
          hex.startsWith("fffe") ||
          hex.startsWith("feff") ||
          hex.startsWith("0000feff") ||
          hex.startsWith("fffe0000")
        )
          throw new CsvImportError("UNSUPPORTED_BOM");
        if (chunk.includes(0)) throw new CsvImportError("NUL_BYTE_REJECTED");
        consume(
          decoder.decode(chunk.subarray(hex.startsWith("efbbbf") ? 3 : 0), {
            stream: true,
          }),
        );
      } else {
        if (chunk.includes(0)) throw new CsvImportError("NUL_BYTE_REJECTED");
        consume(decoder.decode(chunk, { stream: true }));
      }
    }
    consume(decoder.decode());
    // Mutated by consume(); TypeScript closure analysis cannot observe that state.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (quoted) throw new CsvImportError("MALFORMED_QUOTING");
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (row.length > 0 || field.length > 0 || quoteClosed) finishRecord();
    if (!headers) throw new CsvImportError("HEADER_NOT_FOUND");
    return {
      byteCount: bytes,
      recordCount: dataRows,
      headers,
      preambleLines: preamble,
      rawSha256: hash.digest("hex"),
    };
  } catch (error) {
    if (error instanceof CsvImportError || error instanceof z.ZodError)
      throw error;
    throw new CsvImportError("INVALID_UTF8");
  } finally {
    closeSync(opened.fd);
  }
}
