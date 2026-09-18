# ICP, persona, target, and policy configuration

Matching behavior is declared in an engine configuration and a separate policy. Validate both before running:

```sh
node dist/cli/main.js config validate \
  --config /absolute/config/engine-config.json \
  --policy /absolute/config/engine-policy.json
```

Reference files:

- [`examples/demo-engine-config.json`](../examples/demo-engine-config.json)
- [`examples/demo-engine-policy.json`](../examples/demo-engine-policy.json)
- [`schemas/policy/engine-config.schema.json`](../schemas/policy/engine-config.schema.json)
- [`schemas/policy/engine-policy.schema.json`](../schemas/policy/engine-policy.schema.json)

## Configuration sections

### Direct contributors

`directContributorIds` declares whose explicit direct edges can produce A or B. IDs must be unique, exist in the workspace, and refer to active contributors.

### ICP rules

`icpRuleSet` evaluates organization attributes such as industry or other operator-provided fields. A may include any organization that deterministically meets ICP rules, not only named targets.

### Stakeholder persona rules

`stakeholderPersonaRuleSet` evaluates declared person/employment attributes such as function and seniority. C requires both a named target account and a deterministic persona match.

### Coach/champion candidate rules

These rules identify records worth human review. They do **not** prove coaching ability, influence, willingness, warmth, or advocacy. B and D remain review-pending candidates.

### Target accounts and account profiles

`targetAccounts` names organizations for B, C, and D. `accountProfiles` carry operator-provided attributes used by ICP evaluation. Organization aliases do not become trusted from config alone; they require a bound, same-workspace approval record.

### Scores and thresholds

Component scores cover account fit, persona fit, relationship confidence, employment confidence, path confidence, freshness, and review priority. Weights must total more than zero, IDs must be unique, and the uncertainty threshold must remain below the persona-match threshold.

Scores are review-ordering aids only. Hard authorization/evidence gates always take precedence.

### Freshness

Configure maximum ages for current employment, review-only employment, and relationship evidence. Stale evidence is blocked or review-only according to policy; a high score cannot override staleness.

### Suppressions and exclusions

Configuration suppressions, exclusions, and persisted suppression rules form a deterministic union. Suppression kinds include people, organizations, domains, source kinds, snapshots, categories, and available CRM state.

## Policy

The policy binds:

- workspace and purpose;
- effective time and version;
- allowed categories;
- direct and broker scope;
- whether broker individual consent is required;
- disabled network mode;
- external mutations set to false.

The workspace purpose, policy purpose, and every dependency consent must agree. A future policy is not active. Expired or withdrawn consent blocks eligibility and display.

## Run with an explicit clock

```sh
node dist/cli/main.js run \
  --db /absolute/private/workspace.db \
  --workspace workspace_acme \
  --config /absolute/config/engine-config.json \
  --policy /absolute/config/engine-policy.json \
  --actor actor_operator \
  --at 2026-09-18T12:00:00.000Z
```

The explicit clock makes freshness, expiry, IDs, and reruns inspectable. Save config and policy versions alongside the audit decision, without committing private target lists.

## Safe change process

1. Validate schemas.
2. Review changes with Sales Ops and the data owner.
3. Run on synthetic or minimized data.
4. Compare eligible, blocked, and review-only counts.
5. Inspect reason codes and dependencies.
6. Record the new config/policy version and effective time.
7. Never weaken consent or ambiguity gates merely to increase result volume.
