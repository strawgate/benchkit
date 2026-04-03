# Agent Handoff

This is the current operational handoff for agents working in `benchkit`.

Keep this file short and execution-focused. Product direction and roadmap truth
belong in [`../vision-and-roadmap.md`](../vision-and-roadmap.md), not here.

Matching GitHub issue: `strawgate/benchkit#164`.

## Read order

When picking up work, read these files in this order:

1. [`../../AGENTS.md`](../../AGENTS.md)
2. [`../../README.md`](../../README.md)
3. [`../../DEVELOPING.md`](../../DEVELOPING.md)
4. [`../../CODE_STYLE.md`](../../CODE_STYLE.md)
5. [`../README.md`](../README.md)
6. [`../vision-and-roadmap.md`](../vision-and-roadmap.md)

Then read the package, action, or workflow you are about to change.

If you work on dashboard accessibility, also read
[`../research/copilot-playwright-audit.md`](../research/copilot-playwright-audit.md).

## Current execution queue

- Active cleanup/documentation sequence:
  - `#159` define current-truth docs and deprecation policy
  - `#160` clarify the role of `packages/dashboard`
  - `#161` add the migration-readiness and example-coverage matrix
  - `#162` fix public dashboard accessibility and semantics
  - `#163` align chart docs with the shipped component surfaces
- Follow-on format work:
  - `#153` fix unsafe `JSON.stringify` equality in run-detail conversion
  - `#152` wrap parser `JSON.parse` failures with contextual errors
  - `#137` reduce OTLP projection duplication
- Historical handoff issue `#71` is no longer the active queue.

## Recommended next-agent sequence

1. Start with `#159` so docs ownership is clear and this file stays
   operational-only.
2. Then land `#160` and `#161` to make the public package/demo story and
   example inventory truthful.
3. After that, land `#162` and `#163` to improve the public dashboard surface
   and align shipped docs with shipped exports.
4. Parallel or follow-on work can then pick up `#153`, `#152`, and `#137`.

## Cross-repo context

- `strawgate/benchkit-demo` now has a baseline cleanup PR open as `#16`.
- Demo PR `#15` should not be merged until it is rebased or recreated on top of
  that cleaned-up baseline.
- Demo issue `#4` still tracks the switch from sibling `file:` dependencies to
  published `benchkit` packages.

## Guardrails

1. Do not duplicate roadmap or shipped-status content in this file.
2. Do not change committed action `dist/` bundles unless the corresponding
   action source changed and you rebuilt intentionally.
3. `packages/dashboard` is a real public Pages surface today, but its exact role
   is still being clarified in `#160`.
4. Do not assume old issue references, PR dependency notes, or pre-OTLP monitor
   behavior are still current without checking the code and GitHub state first.
