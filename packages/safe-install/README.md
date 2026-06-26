# @oracleot-tools/safe-install

Shareable Pi package that adds a `/safe-install` slash command for auditing one npm registry package before installing it into the current project.

## What it does

`/safe-install`:

- parses a single npm registry package spec plus install flags
- detects the project package manager from `package.json#packageManager` or lockfiles
- audits the package with six checks
- computes a preliminary risk label (`SAFE`, `CAUTION`, or `HIGH RISK / DO NOT INSTALL`)
- blocks installs when the audit lands on `HIGH RISK / DO NOT INSTALL`
- supports a command-level `--dry-run`
- requires explicit confirmation before non-dry-run installs when the audit is `SAFE` or `CAUTION`
- installs with `--ignore-scripts`
- sends a markdown audit report into the Pi session

## Audit checks

1. Registry metadata
2. Publish recency
3. Maintainer surface
4. Lifecycle scripts
5. Executable/native surface
6. Dependency and size surface

## Usage

```bash
/safe-install zod
/safe-install react-hook-form --dev
/safe-install lodash@4.17.21 --exact
/safe-install @types/node@latest
/safe-install vite --manager pnpm
/safe-install typescript --dry-run
```

Flags:

- `--dry-run` - audit only; no install command is executed
- `--dev` / `-D` - install as a dev dependency
- `--exact` / `-E` - pin the exact version
- `--manager <npm|pnpm|yarn|bun>` - override package-manager detection

## Install

Normal user install:

```bash
pi install npm:@oracleot-tools/safe-install
```

Use `-l` only when the current project should load this package from project-local settings (`.pi/settings.json`) instead of your user settings:

```bash
pi install -l npm:@oracleot-tools/safe-install
```

For installed package sources, receive future updates with:

```bash
pi update --extensions
# or
pi update --all
```

## Contributor and local workspace usage

Local workspace testing from this repo:

```bash
pi install /absolute/path/to/pi/packages/safe-install
```

Install the package from `packages/safe-install`, not from the repo root workspace.

If you intentionally want a checkout-based override only for the current repo, add `-l` to the install command. Prefer the published npm source for shareable project settings and end-user docs.

## Notes and caveats

- The current implementation intentionally supports **one npm registry package spec per command run**.
- Accepted package specs are limited to npm registry package names with an optional registry version, range, or dist-tag such as `react`, `@types/node@latest`, or `lodash@^4.17.21`.
- Rejected input includes aliases, `npm:` aliases, local paths, tarball URLs, git or GitHub specs, and `file:`, `link:`, or `workspace:` protocols.
- The audit is preliminary. It reviews npm registry metadata and packed tarball contents, not full transitive source code.
- The command always uses `--ignore-scripts` for installs.
- `--dry-run` is implemented at the command level: it reports the planned install command without executing it.
- If Pi is running without confirmation UI, non-dry-run installs stop after the audit report because explicit confirmation is required.
