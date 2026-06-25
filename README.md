# pi

Workspace root for Pi packages and repo-local agents.

This repository is **not** itself an installable Pi package. Today it primarily publishes **`@oracleot-tools/orchestrate`**, a shareable Pi package for a hub-and-spoke workflow where a main orchestrator delegates repo work to isolated subagents.

## What ships from this repo

Published package: [`@oracleot-tools/orchestrate`](packages/orchestrate/README.md)

That package bundles:
- `/orchestrate` and `/hub`
- the `subagent` tool
- bundled base agents: `orchestrator`, `planner`, `scout`, `worker`

For package behavior, updates, and package-specific details, use the authoritative package README:

- [`packages/orchestrate/README.md`](packages/orchestrate/README.md)

## Install

Canonical end-user install route:

```bash
pi install npm:@oracleot-tools/orchestrate
```

Use `-l` only when you want the package recorded in the current repo's `.pi/settings.json` instead of your user settings:

```bash
pi install -l npm:@oracleot-tools/orchestrate
```

## Contributor checkout install

Install from the package directory, **not** the repo root:

```bash
pi install /absolute/path/to/pi/packages/orchestrate
```

Why: the repo root is a private npm workspace root (`private: true`), while the installable Pi package lives at `packages/orchestrate`.

## Repo-local `.pi/agents`

This repo also keeps project-local agents in [`.pi/agents/`](.pi/agents/).

Those agents are:
- local to this repository
- not published with `@oracleot-tools/orchestrate`
- available as project-scoped overrides when Pi is run with project agent scope enabled

In practice: bundled package agents provide the reusable baseline, while repo-local agents let this checkout carry durable specialists for work on this repository itself.

## Docs map

- Root overview: [`README.md`](README.md)
- Package install/behavior reference: [`packages/orchestrate/README.md`](packages/orchestrate/README.md)
- Current implementation notes: [`docs/implementation-plan.md`](docs/implementation-plan.md)
- Repo-local agents used in this checkout: [`.pi/agents/`](.pi/agents/)
