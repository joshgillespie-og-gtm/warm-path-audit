# Development and testing

Requires Node.js 20+.

## Setup

```sh
npm install
npm run check
npm run build
npm run demo
```

The package remains private during local development. Do not publish from a feature branch or change `private` without a release decision.

## Source layout

```text
src/adapters/       Read-only contracts, local fixture, and ingestion boundary
src/cli/            CLI and guarded path handling
src/consent/        Consent withdrawal and dependency cleanup
src/demo/           Fixed-clock synthetic A-D scenario
src/domain/         Runtime-validated domain models
src/import/         Bounded CSV parser and materialization
src/matching/       Config validation and deterministic evaluator
src/reporting/      Safe terminal, JSON, and CSV views
src/repositories/   Store contracts and in-memory implementation
src/resolution/     Conservative person and organization review
src/security/       Determinism, audit chain, sanitization, and operation audit
src/storage/        SQLite reference store
schemas/            Draft 2020-12 machine-readable contracts
examples/           Synthetic fixtures using reserved domains
```

## Checks

`npm run check` runs:

1. Prettier check
2. ESLint
3. strict TypeScript typecheck
4. Vitest
5. JSON Schema/example validation
6. security and package-boundary self-test
7. documentation local-link, fence, and Mermaid-header validation

Run a clean emitted build separately with `npm run build`. Inspect package contents with:

```sh
npm pack --dry-run --json
npm audit --audit-level=low
```

## Test expectations

Add positive, negative, persistence, determinism, and cross-workspace coverage where applicable. Security-sensitive changes should test forged/mismatched records, stale and revoked authorization, malformed/oversized inputs, replay/idempotency, output disclosure, and cleanup.

Use fixed clocks. Do not depend on live providers, external networks, private environment variables, or nondeterministic ordering.

## Fixtures

All fixtures must be fictional and use reserved domains such as `example.com`. Never copy a real export and rename a few fields. Do not include realistic credentials or token-shaped strings.

## Documentation

Update README and operator docs when behavior changes. Keep implemented, illustrative, and proposed features distinct. Mermaid diagrams must render using GitHub-supported syntax. Local links and balanced code fences are checked by `npm run docs:check`.

## Boundary changes

A change involving collection, identity, consent, disclosure, network access, provider credentials, or mutation requires a new or amended entry in `DECISIONS.md`, threat-model review, and adversarial tests before merge.
