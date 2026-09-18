import {
  AdapterBoundaryError,
  adapterPageSchema,
  adapterRecordSchema,
  type AdapterCapability,
  type AdapterField,
  type AdapterPage,
  type AdapterRecord,
  type ReadOnlyAdapter,
} from "./contracts.js";

export class LocalFixtureAdapter implements ReadOnlyAdapter {
  readonly declaration;
  readonly #records: readonly AdapterRecord[];
  readonly #scriptedError?: AdapterPage["error"];

  constructor(input: {
    adapterId: string;
    provider: string;
    capability: AdapterCapability;
    supportedFields: readonly AdapterField[];
    records: unknown[];
    scriptedError?: AdapterPage["error"];
  }) {
    this.declaration = Object.freeze({
      adapterId: input.adapterId,
      provider: input.provider,
      capability: input.capability,
      readOnly: true as const,
      supportedFields: Object.freeze([...input.supportedFields]),
      implementationStatus: "local_fixture_reference" as const,
      networkAccessed: false as const,
    });
    if (input.records.length > 10_000)
      throw new AdapterBoundaryError("FIXTURE_TOO_MANY_RECORDS");
    this.#records = Object.freeze(
      input.records.map((record) =>
        Object.freeze(adapterRecordSchema.parse(record)),
      ),
    );
    this.#scriptedError = input.scriptedError;
  }

  readPage(input: { cursor: string | null; limit: number }): AdapterPage {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 1_000
    )
      throw new AdapterBoundaryError("INVALID_PAGE_LIMIT");
    if (this.#scriptedError)
      return adapterPageSchema.parse({
        records: [],
        nextCursor: input.cursor,
        error: this.#scriptedError,
        networkAccessed: false,
      });
    const offset = input.cursor === null ? 0 : parseCursor(input.cursor);
    if (offset > this.#records.length)
      throw new AdapterBoundaryError("INVALID_CURSOR");
    const records = this.#records.slice(offset, offset + input.limit);
    const next = offset + records.length;
    return adapterPageSchema.parse({
      records,
      nextCursor: next < this.#records.length ? String(next) : null,
      networkAccessed: false,
    });
  }
}

function parseCursor(cursor: string): number {
  if (!/^(0|[1-9][0-9]{0,9})$/u.test(cursor))
    throw new AdapterBoundaryError("INVALID_CURSOR");
  return Number(cursor);
}
