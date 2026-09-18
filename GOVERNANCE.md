# Governance

Warm Path Audit uses a maintainer-led governance model.

## Roles

- **Maintainers** merge changes, cut releases, manage disclosures, and enforce project boundaries.
- **Contributors** propose code, tests, documentation, and design feedback under the contribution rules.
- **Reviewers** may be delegated authority over specific technical areas without becoming maintainers.

The initial project direction was set by Josh Gillespie. The public repository is maintained under `joshgillespie-og-gtm`.

## Decision process

Routine changes use pull requests and maintainer review. Changes affecting consent, disclosure, identity resolution, external connectivity, mutations, licensing, or project governance require:

1. a written decision or amendment in `DECISIONS.md`;
2. threat-model analysis;
3. adversarial tests;
4. explicit maintainer approval.

Safety and privacy boundaries are not decided by simple feature popularity. Maintainers may reject technically valid contributions that expand collection, disclosure, or side effects beyond project purpose.

## Releases

A maintainer verifies tests, schemas, documentation, dependency audit, package contents, secret/private-data scans, checksums, and release notes before publication. The initial `v0.1.0` commit and tag are intentionally unsigned; future release commits and tags are expected to be cryptographically signed. npm publication, if ever enabled, is a separate decision from GitHub release publication.

## Conduct and conflicts

The [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) applies. Maintainers should disclose material conflicts relevant to provider integrations or data use. Enforcement decisions should protect reporters and avoid publishing personal data.

## Evolution

If contributor activity warrants it, governance may add multiple maintainers, documented voting for non-safety matters, succession rules, and a steering group. Changes to this file require a public pull request and maintainer approval.
