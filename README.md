# pi

Workspace root for Pi packages. The repo root is not an installable Pi package.

## Packages

- `@oracleot-tools/orchestrate` → `packages/orchestrate`

See `packages/orchestrate/README.md` for package-specific install, update, and behavior details.

## Install

Use the published npm package for normal user installs:

```bash
pi install npm:@oracleot-tools/orchestrate
```

Use `-l` only when you want the package recorded in project-local settings (`.pi/settings.json`) for the current repo instead of your user settings:

```bash
pi install -l npm:@oracleot-tools/orchestrate
```

## Contributor checkout installs

- The repository root is a private workspace root, not an installable Pi package.
- Install from the package directory, not the repo root:

```bash
pi install /absolute/path/to/pi/packages/orchestrate
```

If you intentionally want that checkout source scoped to this repo only, add `-l`.

## Repo-local resources

- Repo-local specialist agents remain at `.pi/agents/`.
- Those project-local agents are not published with `@oracleot-tools/orchestrate`.
- Project-local agents can override bundled package agents with the same name when Pi is run with project-agent scope enabled.
