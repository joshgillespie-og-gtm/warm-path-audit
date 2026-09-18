# Roadmap

This is a direction, not a commitment. Safety boundaries take precedence over feature volume.

## Current local reference

- Bounded CSV import
- Conservative resolution and review
- Deterministic A-D engine
- Consent, suppression, withdrawal, and audit controls
- CLI, synthetic demo, safe JSON/CSV reports
- Vendor-neutral read-only adapter contracts
- Network-free local fixture adapter

## Near-term adoption work

1. Improve install ergonomics and publish reproducible release artifacts after explicit approval.
2. Add visual, synthetic product walkthroughs and report examples.
3. Gather operator feedback on CSV mapping and reason-code clarity.
4. Add more synthetic fixtures for common CRM/account models.
5. Strengthen documentation and issue triage from real pilot questions without accepting private data.

## Candidate technical milestones

- A locally served, read-only UI with no telemetry and the same safe-view boundary
- Encrypted-at-rest deployment guidance or a pluggable encrypted store
- One production-quality **read-only** CRM adapter after provider-specific security review
- Better config authoring and validation UX
- Formal versioning for CLI JSON and reason codes
- Observability hooks that emit no contact or edge data
- Reproducible builds, signing, and software bill of materials

## Explicit non-goals

- LinkedIn scraping or browser automation
- Private API use or guessed profile URLs
- Shared/global contact or relationship database
- Autonomous outreach, intros, or CRM writes
- Selling access to contributors' networks
- Inferring warmth, influence, or willingness from interaction metadata
- Publishing Consigliere's proprietary graph, client data, outcome history, or managed brokering process

Attio, HubSpot, Salesforce, LinkedIn, and other names identify third-party products only. Provider support is not implied until an implementation is tested and documented as such.
