# @oracleot-tools/orchestrate

Shareable Pi package for the orchestrate hub-and-spoke workflow.

## What it includes

- `/orchestrate` and `/hub` commands via the bundled hub extension
- `subagent` tool via the bundled subagent extension
- bundled base agents:
  - `orchestrator`
  - `planner`
  - `scout`
  - `worker`

## Install

Use the published npm package for the normal user install path:

```bash
pi install npm:@oracleot-tools/orchestrate
```

Use `-l` only when the current project should load this package from project-local settings (`.pi/settings.json`) instead of your user settings:

```bash
pi install -l npm:@oracleot-tools/orchestrate
```

For installed package sources, receive future updates with:

```bash
pi update --extensions
# or
pi update --all
```

## Contributor and local workspace usage

Install from the extracted workspace package directory when testing from a checkout:

```bash
pi install /absolute/path/to/pi/packages/orchestrate
```

The repository root is a workspace root only; install the package from `packages/orchestrate`, not from the repo root.

If you intentionally want a checkout-based override only for the current repo, add `-l` to the install command. Prefer the published npm source for shareable project settings and end-user docs.

## How it works

- The package ships its own bundled/package base agents under `agents/`.
- Project-local agents discovered from the nearest `.pi/agents` override bundled/package agents with the same name when scope allows it.
- `/orchestrate` uses the bundled/package or project-local `orchestrator` agent and disables direct main-session editing while orchestration is active.
- In hub mode, obvious mutating main-session `bash` commands are also blocked so file changes keep flowing through delegated subagents.
- If the project does not appear to have suitable project-local specialist agents for the repo as a whole, the orchestrator first proposes a durable project-scoped agent set based on the codebase's overall stack and architecture, waits for approval, then delegates agent-file creation to `worker`.
- `/orchestrate` can be run with or without a task. With a task, bootstrap still happens first when needed; without a task, it performs bootstrap-only agent discovery/proposal for the repo.

## Project-local agents

This workspace keeps durable repository specialists in the repo-root `.pi/agents/`. Those agents remain project-local resources and are not moved into or published with this package.

When you run Pi from `packages/orchestrate` or another nested workspace path, hub/subagent discovery still walks upward to the nearest `.pi/agents/` directory.

In subagent calls, `agentScope: "user"` still means bundled/package agents only. Use `agentScope: "both"` or `"project"` to include project-local agents.
