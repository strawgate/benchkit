# Agent Routing

Read files in this order before making code changes:
1. `README.md`
2. `DEVELOPING.md`
3. `CODE_STYLE.md`

Then read files for the area you will edit:
- Format package: `packages/format/src/**`
- Chart package: `packages/chart/README.md` and `packages/chart/src/**`
- Stash action: `actions/stash/src/main.ts` and `actions/stash/action.yml`
- Aggregate action: `actions/aggregate/src/main.ts` and `actions/aggregate/action.yml`
- Monitor action: `actions/monitor/src/**` and `actions/monitor/action.yml`
- Data contract: `schema/*.json`
- CI behavior: `.github/workflows/*.yml`

## Non-negotiable rules

- Keep this file lean: route to docs, do not duplicate long guidance.
- Do not change generated action bundles unless source changed and rebuild is intentional.
- Add or update tests for behavior changes in packages or actions.
- If changing data structure, update schema files and docs in the same PR.
- Keep public APIs backward compatible unless explicitly planned otherwise.

## Quick commands

- Install deps: `npm ci`
- Build: `npm run build`
- Test: `npm run test`
- Lint (ESLint + type checks): `npm run lint`

## Copilot and Claude pointers

- `CLAUDE.md` is a symlink to this file.
- `.github/copilot-instructions.md` points to this file.
