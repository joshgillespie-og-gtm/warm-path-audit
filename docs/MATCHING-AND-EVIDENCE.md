# Matching, scoring, evidence, and reason codes

Warm Path Audit is a deterministic rules engine. It does not use an LLM classifier and does not infer social facts from weak overlap.

## A-D semantics

### A: potential direct ICP lead

Requires a configured direct contributor edge, current resolved employment, deterministic ICP account fit, and a deterministic stakeholder-persona match. The organization may be outside the named target list.

### B: direct target-account coach/champion candidate

Requires a configured direct contributor edge and a named target account, while the persona is uncertain or does not match. B always remains **review-pending coach/champion candidate**. It does not establish influence, warmth, or willingness.

### C: broker path to target stakeholder

Requires an explicit eligible contributed edge, active broker consent, a named target account, current resolved employment, and a deterministic stakeholder-persona match. Co-employment or interaction metadata alone cannot produce C.

### D: broker path to another target-account person

Requires the same explicit and consented broker-path boundary as C, but the destination persona is uncertain or does not match. D is always a **review-pending coach/champion candidate**.

## Hard gates

A candidate is blocked or review-only when applicable evidence is:

- identity-conflicted or unresolved;
- organization-unresolved or based on an unapproved alias;
- employment-ended, conflicted, stale, or not current enough;
- missing an explicit relationship edge for broker classes;
- relationship-stale;
- tied to expired, withdrawn, wrong-purpose, wrong-source, or wrong-category consent;
- tied to an inactive contributor;
- suppressed or excluded;
- outside policy scope.

Every dependency snapshot is checked. One valid edge cannot launder an invalid secondary source into a result.

## Scores

The engine emits component scores and a review priority. Scores answer only: **which already-eligible or reviewable records should a human inspect first?**

They do not answer:

- how strong a relationship is;
- whether someone is influential;
- whether someone will make an introduction;
- whether outreach is appropriate;
- whether the person is a qualified opportunity.

Hard gates run before scoring and cannot be overridden by score totals.

## Reason codes

Typical eligible reason codes include:

| Code                                       | Meaning                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `CATEGORY_A_ELIGIBLE`                      | Passed A's deterministic hard gates                          |
| `CATEGORY_B_ELIGIBLE`                      | Passed B's deterministic hard gates                          |
| `CATEGORY_C_ELIGIBLE`                      | Passed C's deterministic hard gates                          |
| `CATEGORY_D_ELIGIBLE`                      | Passed D's deterministic hard gates                          |
| `ICP_RULES_MATCHED`                        | Declared organization attributes met configured ICP rules    |
| `STAKEHOLDER_PERSONA_MATCHED`              | Declared person/employment attributes met persona rules      |
| `TARGET_ACCOUNT_EXACT`                     | Destination organization matched a named target              |
| `COACH_CANDIDATE_RULES_MATCHED_NOT_PROVEN` | Candidate rules matched, without proving influence or warmth |
| `HUMAN_REVIEW_REQUIRED`                    | Operator review remains mandatory                            |

Typical blocked codes include `IDENTITY_UNRESOLVED_OR_CONFLICTED`, `EMPLOYMENT_STALE`, and `RELATIONSHIP_STALE`. Treat reason codes as machine-readable explanations, not legal or sales conclusions.

## Evidence and provenance

A safe report provides counts and summaries of:

- claim types;
- source kinds;
- observation timestamps;
- consent, snapshot, evidence, and relationship dependency presence;
- current suppression status.

Exact dependency identifiers and broker details are redacted in safe views. Use `inspect dependencies` only inside an authorized local workspace and apply least privilege.

## What is never inferred

The engine does not infer relationships, warmth, influence, willingness, or stakeholder status from:

- name or title similarity;
- co-employment;
- email/calendar interaction metadata alone;
- public overlap;
- imported profile URLs;
- an LLM;
- one contributor's statement about another contributor's consent.

An introduction remains a separate human process requiring bilateral opt-in.
