# Contributing to Warm Path Audit

Warm Path Audit handles a sensitive problem domain. Contributions must preserve consent, provenance, workspace isolation, deterministic behavior, and safe disclosure.

## Before opening a change

- Search existing issues.
- Use synthetic people and reserved domains such as `example.com` only.
- For behavior changes, describe the threat model and backward-compatibility impact.
- Keep pull requests narrow and include tests.

Do **not** contribute real contacts, relationship edges, customer target lists, credentials, private exports, generated databases/reports, proprietary Consigliere data, scraping code, provider-private API code, autonomous outreach, or CRM mutation paths.

## Development

Requires Node.js 20+.

```sh
npm install
npm run check
npm run build
npm run demo
npm audit --audit-level=low
```

A behavior change should include positive and adversarial tests. Changes to schemas need matching synthetic examples and validation updates. CLI/output changes should preserve stable machine output or clearly document a versioned break.

## Design constraints

Changes must preserve:

- local-first and no-network defaults;
- workspace and provider-tenant isolation;
- explicit purpose and contributor consent;
- conservative identity and organization resolution;
- hard gates taking precedence over scores;
- B/D candidate-only language;
- broker redaction and disclosure permission;
- bilateral human opt-in outside the tool;
- no silent contact creation, outreach, or CRM writes;
- deterministic replay and append-only audit behavior.

Read [`SPEC.md`](SPEC.md), [`DECISIONS.md`](DECISIONS.md), and [`THREAT-MODEL.md`](THREAT-MODEL.md) before changing a boundary.

## Pull requests

Use the pull request template. State what is implemented versus illustrative. Include commands and exact results. Do not paste private data into tests, commits, screenshots, issues, CI logs, or review comments.

## Security reports

Do not open a public issue for a vulnerability. Follow [`SECURITY.md`](SECURITY.md). If no private reporting route is configured on the host yet, do not publish exploit or private-data details; wait for the maintainer to establish a secure route.

## Community

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). Governance is described in [`GOVERNANCE.md`](GOVERNANCE.md).
