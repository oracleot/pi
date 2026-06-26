# pi

Workspace root for Pi packages and repo-local agents.

This repository is **not** itself an installable Pi package. It publishes two shareable Pi packages:

- **`@oracleot-tools/orchestrate`** — hub-and-spoke orchestration for Pi
- **`@oracleot-tools/safe-install`** — audited npm package installation from Pi

## What ships from this repo

Published packages:

- [`@oracleot-tools/orchestrate`](packages/orchestrate/README.md)
- [`@oracleot-tools/safe-install`](packages/safe-install/README.md)

`@oracleot-tools/orchestrate` bundles:
- `/orchestrate` and `/hub`
- the `subagent` tool
- bundled base agents: `orchestrator`, `planner`, `scout`, `worker`

`@oracleot-tools/safe-install` bundles:
- `/safe-install`

For package behavior, updates, and package-specific details, use the authoritative package READMEs:

- [`packages/orchestrate/README.md`](packages/orchestrate/README.md)
- [`packages/safe-install/README.md`](packages/safe-install/README.md)

## Install

Canonical end-user install routes:

```bash
pi install npm:@oracleot-tools/orchestrate
pi install npm:@oracleot-tools/safe-install
```

Use `-l` only when you want the package recorded in the current repo's `.pi/settings.json` instead of your user settings:

```bash
pi install -l npm:@oracleot-tools/orchestrate
pi install -l npm:@oracleot-tools/safe-install
```

For installed package sources, receive future updates with:

```bash
pi update --extensions
# or
pi update --all
```

## Contributor checkout install

Install from the package directory, **not** the repo root:

```bash
pi install /absolute/path/to/pi/packages/orchestrate
pi install /absolute/path/to/pi/packages/safe-install
```

Why: the repo root is a private npm workspace root (`private: true`), while the installable Pi packages live under `packages/`.

## Repo-local `.pi/agents`

This repo also keeps project-local agents in [`.pi/agents/`](.pi/agents/).

Those agents are:
- local to this repository
- not published with `@oracleot-tools/orchestrate`
- available as project-scoped overrides when Pi is run with project agent scope enabled

In practice: bundled package agents provide the reusable baseline, while repo-local agents let this checkout carry durable specialists for work on this repository itself.

## Docs map

- Root overview: [`README.md`](README.md)
- Orchestrate package install/behavior reference: [`packages/orchestrate/README.md`](packages/orchestrate/README.md)
- Safe-install package install/behavior reference: [`packages/safe-install/README.md`](packages/safe-install/README.md)
- Current implementation notes: [`docs/implementation-plan.md`](docs/implementation-plan.md)
- Repo-local agents used in this checkout: [`.pi/agents/`](.pi/agents/)
