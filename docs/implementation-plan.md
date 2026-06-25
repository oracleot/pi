# Implementation plan

## Current repo contracts to preserve
- Package install/update flow is documented from the repo root in `README.md` and the package manifest at `packages/orchestrate/package.json`.
- Bundled base agents now live in `packages/orchestrate/agents/` and are exposed by `packages/orchestrate/package.json`.
- Hub-mode safety and bootstrap behavior live in `packages/orchestrate/extensions/hub/index.ts` and the bundled orchestrator contract in `packages/orchestrate/agents/orchestrator.md`.
- Subagent discovery and precedence rules live in `packages/orchestrate/extensions/subagent/index.ts` and `packages/orchestrate/extensions/subagent/agents.ts`.
- Project-local repo specialists already exist in `.pi/agents/*.md` and should remain the durable ownership model for repo-shaped work.

## Target end state
Adopt a monorepo-ready layout for the renamed `pi` repository around the fresh canonical package model: published npm packages under `@oracleot-tools`, with `@oracleot-tools/orchestrate` as the end-user install target. Because there are effectively no existing external users to preserve for package identity, implementation should optimize for that fresh-start model; repo-root git/local installs are only contributor or transitional paths as needed during implementation.

## Current doc state
- The extracted package now lives at `packages/orchestrate`.
- The repo root is a private workspace root, not an installable Pi package.
- Current supported install docs paths are the canonical npm source `npm:@oracleot-tools/orchestrate`, the project-local npm form `pi install -l npm:@oracleot-tools/orchestrate` when a repo should pin the package in `.pi/settings.json`, and the local workspace package path for contributor testing.

## Explicit implementation decisions
- The repository is renamed to `pi`.
- Canonical end-user installation is via published npm packages under the `@oracleot-tools` scope.
- The package name is `@oracleot-tools/orchestrate`.
- Canonical steady-state install syntax uses Pi's npm source form: `pi install npm:@oracleot-tools/orchestrate`.
- Repo-root git/local installs remain contributor or transitional implementation paths, not the canonical end-user install surface.
- Global/user-scope installs are the default for normal end-user usage; `-l` is for intentional project-local package settings, not the default release path.
- There is no required external-user package-identity compatibility bridge to preserve; package-identity decisions can optimize for the fresh canonical npm package model.

### Target layout
```text
/
  package.json                      # workspace root
  README.md
  docs/
    implementation-plan.md
  packages/
    orchestrate/
      package.json
      README.md
      agents/
      extensions/
      src-or-runtime-shared/        # only if extraction creates shared code
  .pi/
    agents/
```

### Package boundary rules
- The repository may contain multiple packages plus repo-level resources such as docs and project-local `.pi/agents/*`; those repo-global resources are not themselves end-user installable units.
- `packages/orchestrate` is the canonical home for the package contents, including its bundled `agents/`, `extensions/`, and package metadata.
- Each end-user installable unit must be its own package with its own manifest and package-relative bundled Pi resources.
- End users should install the specific package they want from that package's source; for this package, the canonical steady-state path is the published npm source `npm:@oracleot-tools/orchestrate`, with git/local sources reserved for contributor or transitional implementation cases.
- Root-level install support is only needed for contributors or transitional implementation needs; if the root remains a valid `pi install <git-url-or-path>` target during migration, treat that repo-root behavior as non-canonical scaffolding rather than a long-term package-selection model.
- Bundled Pi resources are versioned with the package that ships them; project-local `.pi/agents/*` remain repo-local resources and are not published.
- Do not assume git subdirectory installs from a monorepo are supported unless Pi documents that support; package selection must work without relying on undocumented git-subdirectory install behavior.
- Only extract additional shared packages if a real second consumer appears; do not invent a utility package before the repo needs one.

## Migration sequence

### Phase 0 — pre-migration baseline
**Owner:** `repo-orchestrator` coordinating `repo-reviewer`
- Record the current install, update, and discovery contracts from `README.md`, `packages/orchestrate/package.json`, `packages/orchestrate/extensions/hub/index.ts`, `packages/orchestrate/extensions/subagent/index.ts`, and `packages/orchestrate/extensions/subagent/agents.ts`.
- Treat these as compatibility gates for every later phase.
- Add a short validation checklist before moving files so regressions are visible.

### Phase 1 — extraction seams without layout change
**Owner:** `package-architect`
- Normalize internal path assumptions so code can survive being moved under `packages/orchestrate/`.
- Keep `packageDir`-style resource resolution explicit and package-relative, as already used in `packages/orchestrate/extensions/hub/index.ts` and `packages/orchestrate/extensions/subagent/agents.ts`.
- Avoid changing runtime behavior yet; this phase is only for making path ownership obvious and move-safe.

### Phase 2 — workspace root introduction
**Owner:** `workspace-release-maintainer` with `package-architect`
- Convert the root `package.json` into a workspace root.
- Introduce `packages/orchestrate/package.json` as the real package manifest.
- Add a root transitional layer only if contributor workflows or migration validation genuinely need it.
- Do **not** treat repo-root install parity as a success gate for the migration; treat it as optional scaffolding that can be removed or skipped once the canonical package path is validated.

### Phase 3 — move package contents into `packages/orchestrate`
**Owner:** `package-architect`
- Move `agents/` and `extensions/` into `packages/orchestrate/`.
- Update package metadata so Pi still discovers the extension entrypoints now referenced from the package manifest.
- Keep resource paths package-local; do not make them depend on repository root layout.
- If temporary root stubs are required, keep them minimal and compatibility-focused.

### Phase 4 — discovery and hub behavior hardening
**Owners:** `hub-extension-maintainer`, `subagent-extension-maintainer`
- Re-verify hub-mode guardrails from `packages/orchestrate/extensions/hub/index.ts`: main-session editing remains disabled and delegated work remains mandatory.
- Preserve the requirement from `packages/orchestrate/agents/orchestrator.md` and `packages/orchestrate/extensions/hub/index.ts` that delegated calls use `agentScope: "both"` when project-local agents exist.
- Re-verify bundled-agent discovery from `packages/orchestrate/extensions/subagent/agents.ts` after the package move.
- Ensure nearest-project `.pi/agents` discovery still walks upward from the working directory and still lets project-local agents override bundled agents.
- Confirm project-agent confirmation/trust behavior from `packages/orchestrate/extensions/subagent/index.ts` is unchanged.

### Phase 5 — release/install/update path finalization
**Owners:** `workspace-release-maintainer`, `release-docs-maintainer`
- Define the supported install targets after migration:
  - package-specific npm source for the end-user package being installed (canonical), e.g. `pi install npm:@oracleot-tools/orchestrate`
  - package workspace path for contributor development/testing, e.g. `pi install /absolute/path/to/pi/packages/orchestrate`
  - project-local npm install when a repo should pin the package in `.pi/settings.json`, e.g. `pi install -l npm:@oracleot-tools/orchestrate`
- In the current extracted layout, no repo-root install target is documented.
- Keep `README.md` accurate for the compatibility story at each phase; never document a path that the repo does not yet support.
- Do not make `pi install https://github.com/oracleot/pi` a release success criterion; mention it only if a temporary compatibility path is intentionally preserved.
- Do not document or depend on git subdirectory installs from a monorepo unless Pi docs explicitly add support for them.
- Once any transitional root layer is proven unnecessary, document the steady-state monorepo install/update guidance around choosing a specific package source; do not invent migration notes for non-existent external users.

### Phase 6 — cleanup
**Owner:** `repo-orchestrator` with `repo-reviewer`
- Remove temporary compatibility shims only after all checkpoints below are green.
- Keep the repo-local specialist agent set in `.pi/agents/` intact; the migration changes package layout, not durable ownership.

## Ownership tracks

### Track A — hub orchestration behavior
**Owner:** `hub-extension-maintainer`
- Source of truth: `packages/orchestrate/extensions/hub/index.ts`, `packages/orchestrate/agents/orchestrator.md`.
- Keep hub mode coordinator-first.
- Maintain the bootstrap-skipped path when suitable project-local agents already exist.
- Preserve the explicit project-agent visibility rule (`agentScope: "both"`) before, during, and after migration.
- Validation checkpoint: `/hub` and `/orchestrate` still disable direct main-session editing and still route repo work through subagents.

### Track B — subagent execution and discovery
**Owner:** `subagent-extension-maintainer`
- Source of truth: `packages/orchestrate/extensions/subagent/index.ts`, `packages/orchestrate/extensions/subagent/agents.ts`.
- Preserve three-mode execution semantics: single, parallel, chain.
- Preserve discovery precedence: bundled agents first, then project-local override when scope is `both`; project-only when explicitly requested.
- During migration, bundled-agent lookup must follow the installed package location, not assume repo-root-relative paths.
- Validation checkpoint: project-local `.pi/agents/orchestrator.md` or similarly named overrides still win when present.

### Track C — package architecture and extraction seams
**Owner:** `package-architect`
- Source of truth: `packages/orchestrate/package.json`, `README.md`, and the current `packages/orchestrate/agents/` and `packages/orchestrate/extensions/` layout.
- Create the minimal `packages/orchestrate` structure first; postpone further splits.
- Keep runtime code and bundled resources together in the owning package.
- Validation checkpoint: package-local resource resolution works for the canonical package target and in contributor development flows.

### Track D — resource layout and discoverability
**Owner:** `resource-library-curator`
- Source of truth: bundled `packages/orchestrate/agents/`, project-local `.pi/agents/`.
- Keep bundled resources inside the package that ships them.
- Keep project-local repo specialists in `.pi/agents/` at repo root; they are workspace-wide repo resources, not package-published assets.
- If future skills/themes/examples are added, prefer package-local resource folders unless they are intentionally repo-global.
- Validation checkpoint: bundled resources remain discoverable after package extraction, and repo-local resources remain discoverable from nested workspace paths.

### Track E — workspace release mechanics
**Owner:** `workspace-release-maintainer`
- Source of truth: the current workspace root `package.json`, `packages/orchestrate/package.json`, and any future workspace manifests after migration.
- Recommended approach: npm workspaces with package-owned versioning and Changesets-style release tracking once there is more than one releasable workspace.
- Until multiple published packages exist, keep release semantics simple: one releasable package, one canonical end-user package source, and one compatibility story.
- If the repo later contains multiple end-user packages, each installable unit must publish or otherwise expose its own package source rather than relying on repo-root selection semantics.
- Pi resources do not get separate versions; they ship with the package version that contains them.
- Validation checkpoint: version bumps, changelog/release notes, and install instructions all point to the same package boundary.

### Track F — release-facing documentation
**Owner:** `release-docs-maintainer`
- Source of truth: `README.md` plus any future release docs.
- Document three states explicitly: current single-package behavior, migration compatibility window, post-migration steady state.
- Distinguish end-user install/update guidance from contributor workspace-development guidance.
- In steady-state docs, direct end users to the specific package source they want, preferably npm when published, and avoid implying undocumented git-subdirectory install support.
- Validation checkpoint: docs match actual manifests, workspace paths, and supported install commands.

### Track G — repo-wide review
**Owner:** `repo-reviewer`
- Review each migration phase before the next one starts.
- Focus on regressions against the canonical package target, broken extension entrypoints, discovery precedence drift, and accidental weakening of hub-mode safeguards.
- Final gate: no cleanup merge unless canonical-package validation and bounded rollback steps are still executable.

## Agent and resource discovery behavior

### Before migration
- Bundled agents are loaded from the installed package directory via package-relative resolution in `packages/orchestrate/extensions/hub/index.ts` and `packages/orchestrate/extensions/subagent/agents.ts`.
- Project-local agents are discovered by walking upward to the nearest `.pi/agents` directory.
- In hub mode, project-local agents are only exposed when delegated calls include `agentScope: "both"`.

### During migration
- If a root compatibility layer exists, it must continue to expose the same bundled agents and extension entrypoints even if their canonical files live under `packages/orchestrate/`.
- Discovery behavior must remain package-relative for bundled resources and cwd-relative for `.pi/agents`.
- No phase should require users to move or rename `.pi/agents/*`.

### After migration
- The installed package resolves its own bundled agents/resources from the installed package root using package-relative paths after extraction.
- Project-local `.pi/agents/*` continue to override bundled agents by name when discovery scope includes both sources.
- Nested workspace execution must still find the repo-root `.pi/agents/` directory by upward search.

## Install and update compatibility expectations
- Canonical end-user install/update guidance should target the published npm package source: `pi install npm:@oracleot-tools/orchestrate`.
- `pi install https://github.com/oracleot/pi` may be kept as a transitional path only if the repo intentionally restores and documents it; it is not part of the current extracted-package guidance.
- Any temporary root manifest contract in `package.json` should exist only if needed to support contributor workflows or migration validation; the current root manifest is a private workspace root.
- Update expectations in `README.md` (`pi update --extensions` / `pi update --all`) must remain internally consistent with whatever install paths are still intentionally supported.
- Local checkout install guidance should point to the package workspace path, not the repo root.
- Checkout-path installs are contributor/testing overrides; for shareable project-local installs, prefer the published npm source with `-l` instead of a machine-specific checkout path.
- Repo-root install behavior during migration, if retained, is a compatibility bridge and not the canonical package-selection model.
- Do not assume users can target a package by git subdirectory within a monorepo; unless Pi documents that capability, package install guidance must rely on supported package sources instead.

## Release and versioning approach
- Near term: keep one user-facing package version while the repo is in transition.
- Migration target: workspace-aware repo with package-owned versions.
- Recommended policy once additional releasable workspaces exist:
  - version packages independently;
  - track cross-package release notes together via Changesets or an equivalent workspace release ledger;
  - ship bundled Pi resources with their owning package version;
  - never version `.pi/agents/*` separately from the repo.
- If the repo never grows beyond one published package, workspaces may still exist for structure, but release behavior should stay effectively single-package.

## Validation checkpoints
1. **Canonical install target:** install/update guidance centers on `npm:@oracleot-tools/orchestrate` and the package manifest exposes the needed hub/subagent extensions from that package boundary.
2. **Package moved:** bundled agents and extension entrypoints resolve from the new package location.
3. **Hub safety:** hub mode still blocks main-session `write`/`edit` and preserves delegation-only workflow.
4. **Discovery precedence:** project-local agents still override bundled agents when names collide and scope is `both`.
5. **Nested cwd check:** running from a nested workspace path still finds repo-root `.pi/agents/`.
6. **Docs sync:** `README.md` and any new release docs match the actual supported commands.
7. **Release metadata:** package versions, manifests, and release notes describe the same package boundary.
8. **Transitional root path (if retained):** any repo-root git/local install behavior that remains documented is explicitly marked transitional and does not conflict with the canonical package target.

## Rollback and compatibility checks
- Keep any root compatibility package/manifests only while they are still needed for contributor workflows or migration validation.
- Make the file move and the release/docs changes separable so the repo can revert the layout without losing the canonical package story.
- Preserve old-to-new path mapping notes during migration so broken entrypoints can be traced quickly.
- Before cleanup, confirm that reverting the package move or temporary compatibility layer would still be a bounded change rather than a full rewrite.

## Open questions
1. **Workspace release tooling:** the repo does not yet encode whether Changesets is the chosen release mechanism; adopt it only when the second releasable workspace appears, or decide sooner if CI automation work starts first.
2. **Transitional root compatibility implementation:** if contributor or migration needs justify it, the repo does not yet encode whether that temporary path should be provided by a root package wrapper, root re-export/stub files, or a root package that points into the workspace package.
3. **Future shared packages:** no current source file proves a second runtime consumer exists, so any shared package split remains deferred until a real consumer appears.
