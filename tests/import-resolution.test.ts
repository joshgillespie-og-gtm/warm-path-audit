import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseCsvFile, type CsvMapping } from "../src/import/csv.js";
import { importCsv } from "../src/import/import-service.js";
import { InMemoryWorkspaceStore } from "../src/repositories/in-memory.js";
import {
  evaluateEmployment,
  resolveOrganizationClaim,
  resolvePersonClaim,
} from "../src/resolution/resolution.js";
import { consent, contributor, workspace } from "./fixtures.js";
const mapping: CsvMapping = {
  delimiter: ",",
  header: {
    mode: "detect_required_headers",
    requiredSourceHeaders: ["First Name", "Last Name", "URL"],
    maxPreambleLines: 100,
  },
  columns: [
    { sourceHeader: "First Name", targetField: "first_name", required: true },
    { sourceHeader: "Last Name", targetField: "last_name", required: true },
    { sourceHeader: "URL", targetField: "profile_url", required: false },
  ],
};
const fixture = (body: string): { root: string; file: string } => {
  const root = mkdtempSync(join(tmpdir(), "wpa-import-"));
  const file = join(root, "input.csv");
  writeFileSync(file, body);
  return { root, file };
};
describe("bounded hostile CSV import", () => {
  it("detects a LinkedIn-style header after preamble and preserves duplicates", () => {
    const { root, file } = fixture(
      "Notes:\nGenerated export\nFirst Name,Last Name,URL\nAlex,Example,https://profiles.example.com/a\nAlex,Example,https://profiles.example.com/a\n",
    );
    const rows: unknown[] = [];
    const result = parseCsvFile(file, [root], mapping, (row) => rows.push(row));
    expect(result).toMatchObject({ preambleLines: 2, recordCount: 2 });
    expect(rows).toHaveLength(2);
    expect(result.rawSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    [
      "bad quoting",
      'First Name,Last Name,URL\n"Alex"x,Example,x\n',
      "MALFORMED_QUOTING",
    ],
    ["NUL", "First Name,Last Name,URL\nA\0,B,x\n", "NUL_BYTE_REJECTED"],
    [
      "colliding header",
      "First Name, first name ,URL\nA,B,x\n",
      "HEADER_COLLISION",
    ],
    [
      "too many rows",
      "First Name,Last Name,URL\nA,B,x\nC,D,y\n",
      "TOO_MANY_ROWS",
    ],
  ])("rejects %s", (_name, body, code) => {
    const { root, file } = fixture(body);
    const caseMapping: CsvMapping =
      code === "TOO_MANY_ROWS"
        ? { ...mapping, limits: { maxDataRows: 1 } }
        : mapping;
    expect(() => parseCsvFile(file, [root], caseMapping, () => {})).toThrow(
      code,
    );
  });
  it("rejects invalid UTF-8, UTF-16 BOM, URLs, paths outside roots, and symlinks", () => {
    const { root, file } = fixture("x");
    writeFileSync(file, Buffer.from([0xff]));
    expect(() => parseCsvFile(file, [root], mapping, () => {})).toThrow(
      "INVALID_UTF8",
    );
    writeFileSync(file, Buffer.from([0xff, 0xfe, 0x41, 0]));
    expect(() => parseCsvFile(file, [root], mapping, () => {})).toThrow(
      "UNSUPPORTED_BOM",
    );
    expect(() =>
      parseCsvFile("https://example.com/a.csv", [root], mapping, () => {}),
    ).toThrow("URL_INPUT_REJECTED");
    const outside = fixture("First Name,Last Name,URL\nA,B,x\n");
    expect(() => parseCsvFile(outside.file, [root], mapping, () => {})).toThrow(
      "OUTSIDE_IMPORT_ROOT",
    );
    const link = join(root, "link.csv");
    symlinkSync(outside.file, link);
    expect(() => parseCsvFile(link, [root], mapping, () => {})).toThrow(
      "FILE_OPEN_REJECTED",
    );
  });
  it("enforces row, field, column and file ceilings", () => {
    const cases: [
      string,
      Partial<NonNullable<CsvMapping["limits"]>>,
      string,
    ][] = [
      [
        "First Name,Last Name,URL\nAAAA,B,x\n",
        { maxFieldBytes: 3 },
        "FIELD_TOO_LARGE",
      ],
      [
        "First Name,Last Name,URL\nAAAA,B,x\n",
        { maxRowBytes: 5 },
        "ROW_TOO_LARGE",
      ],
      [
        "First Name,Last Name,URL\nA,B,x\n",
        { maxColumns: 2 },
        "TOO_MANY_COLUMNS",
      ],
      [
        "First Name,Last Name,URL\nA,B,x\n",
        { maxFileBytes: 10 },
        "FILE_TOO_LARGE",
      ],
    ];
    for (const [body, limits, code] of cases) {
      const { root, file } = fixture(body);
      expect(() =>
        parseCsvFile(file, [root], { ...mapping, limits }, () => {}),
      ).toThrow(code);
    }
  });
  it("is idempotent, rejects rebinding and makes no network call", () => {
    const { root, file } = fixture(
      "First Name,Last Name,URL\nA,B,https://example.com/path\n",
    );
    const store = new InMemoryWorkspaceStore();
    store.createWorkspace(workspace());
    store.put("workspace_one", {
      entityType: "contributor",
      value: contributor(),
    });
    store.put("workspace_one", { entityType: "consent", value: consent() });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = {
      workspaceId: "workspace_one",
      contributorId: "contributor_casey",
      consentRecordId: "consent_casey",
      sourceKind: "linkedin_connections_export",
      mappingId: "map_1",
      mappingVersion: "1",
      file,
      importRoots: [root],
      importedAt: "2026-10-01T00:00:00.000Z",
      mapping,
    };
    expect(importCsv(request, store).status).toBe("committed");
    expect(importCsv(request, store).status).toBe("idempotent");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(() => importCsv({ ...request, mappingId: "map_2" }, store)).toThrow(
      "SNAPSHOT_REBINDING_REJECTED",
    );
    fetchSpy.mockRestore();
  });
});
describe("conservative resolution", () => {
  const base = {
    workspaceId: "one",
    evidenceRefs: ["ev_1"],
    confidence: 0.9,
    observedAt: "2026-09-18T00:00:00.000Z",
    reviewStatus: "unreviewed" as const,
  };
  it("auto-resolves only safe exact identity and isolates workspaces", () => {
    const email = {
      ...base,
      identityClaimId: "ic_1",
      personId: "p_new",
      kind: "email" as const,
      namespace: "csv",
      value: "alex@corp.example.com",
    };
    const existing = [
      {
        ...email,
        identityClaimId: "ic_2",
        personId: "p_1",
        value: "ALEX@corp.example.com",
      },
    ];
    const existingClaim = existing[0];
    if (!existingClaim) throw new Error("fixture");
    expect(resolvePersonClaim(email, existing).outcome).toBe("exact");
    expect(
      resolvePersonClaim({ ...email, value: "team@corp.example.com" }, [
        { ...existingClaim, value: "team@corp.example.com" },
      ]).outcome,
    ).toBe("review");
    expect(
      resolvePersonClaim({ ...email, kind: "name", value: "Аlex Example" }, []),
    ).toMatchObject({ outcome: "review" });
    expect(
      resolvePersonClaim(email, [{ ...existingClaim, workspaceId: "two" }])
        .outcome,
    ).toBe("new");
  });
  it("separates exact organization resolution from alias review", () => {
    const domain = {
      ...base,
      organizationClaimId: "oc_1",
      organizationId: "o_new",
      kind: "domain" as const,
      namespace: "web",
      value: "corp.example.com",
    };
    expect(
      resolveOrganizationClaim(domain, [
        { ...domain, organizationClaimId: "oc_2", organizationId: "o_1" },
      ]).outcome,
    ).toBe("exact");
    expect(
      resolveOrganizationClaim(
        { ...domain, kind: "name", value: "Corp Example" },
        [],
      ).outcome,
    ).toBe("review");
  });
  it("evaluates employment freshness, ended claims and conflicts", () => {
    const claim = {
      ...base,
      employmentClaimId: "ec_1",
      personId: "p_1",
      organizationId: "o_1",
      state: "current" as const,
    };
    expect(
      evaluateEmployment(claim, [claim], new Date("2027-09-18T00:00:00Z")),
    ).toBe("potentially_current");
    expect(
      evaluateEmployment(claim, [claim], new Date("2028-03-01T00:00:00Z")),
    ).toBe("review_only");
    expect(
      evaluateEmployment(claim, [claim], new Date("2029-01-01T00:00:00Z")),
    ).toBe("stale");
    expect(
      evaluateEmployment(
        claim,
        [
          claim,
          {
            ...claim,
            employmentClaimId: "ec_2",
            state: "ended",
            observedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
        new Date("2026-10-01T00:00:00Z"),
      ),
    ).toBe("blocked_ended");
    expect(
      evaluateEmployment(
        claim,
        [claim, { ...claim, employmentClaimId: "ec_3", organizationId: "o_2" }],
        new Date("2026-10-01T00:00:00Z"),
      ),
    ).toBe("blocked_conflict");
  });
});
