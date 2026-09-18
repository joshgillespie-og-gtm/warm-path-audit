# Production deployment boundaries

Warm Path Audit is a tested local reference implementation, not a hosted enterprise service. A production deployment requires controls beyond this repository.

## Suitable current uses

- Credential-free synthetic demonstration
- Local evaluation with authorized, minimized CSVs
- Architecture and policy review
- A bounded pilot on a managed encrypted workstation
- Development of a separately reviewed read-only adapter

## Not included

- Hosted UI, API, tenancy service, or identity provider
- Role-based access control or strong reviewer authentication
- Key management or database encryption at rest
- Central backup, retention, legal hold, or data-subject workflow
- High availability, job scheduler, queue, or concurrency coordinator
- Production provider OAuth, SDK, connector, or webhook
- SIEM integration, metrics pipeline, or support SLA
- CRM writes, outreach, or introduction workflow

## Before a real pilot

Use the [enterprise pilot checklist](ENTERPRISE-PILOT.md). At minimum:

1. Assign data owner, security reviewer, operator, and deletion owner.
2. Approve a narrow purpose and source list.
3. Use a managed encrypted endpoint and private directory.
4. Restrict OS users and report recipients.
5. Set backup and withdrawal reconciliation procedures.
6. Validate configurations and mappings on synthetic data.
7. Define bilateral intro consent outside the tool.
8. Review applicable provider terms, privacy obligations, contracts, and employment policy.

## Wrapping the CLI

If you place a service around the CLI or library, you become responsible for authentication, authorization, CSRF/SSRF protection, rate limiting, tenant isolation, secret handling, logging minimization, sandboxing, patching, and safe subprocess behavior. Do not expose the CLI directly to untrusted web requests.

## Building a provider adapter

The contracts model only read-only minimized metadata. A production connector must separately implement and test:

- provider-specific OAuth and least-privilege scopes;
- tenant binding and revocation;
- pagination, backoff, checkpoint durability, and rate limits;
- provider schema customization;
- response size and field allowlists;
- deletion and source refresh;
- credential storage and rotation;
- provider terms and security review.

Never add write capability to an audit authorization. Keep provider collection separate from evaluation and route records through the existing snapshot/evidence/claim boundaries.

## Publication versus deployment

A public package or GitHub repository does not make the software production-ready. Consult [`SECURITY.md`](../SECURITY.md) for the support posture and [`ROADMAP.md`](ROADMAP.md) for possible hardening milestones.
