# Contributing

Thanks for helping improve `convex-svelte`.

## Setup

Use pnpm 11.x, matching the GitHub Actions workflows:

```bash
corepack enable
pnpm install
```

For local development:

```bash
pnpm dev
```

If you need to initialize the demo Convex deployment and seed data, run:

```bash
pnpm dev:init
```

## Checks

Before opening a pull request, run the same checks that CI runs:

```bash
pnpm build
pnpm lint:package
pnpm test
pnpm check
pnpm lint
```

End-to-end tests use Playwright. If Chromium is not installed locally yet, run:

```bash
pnpm exec playwright install chromium
```

## Changesets

This project uses Changesets for versioning, changelogs, npm publishing, git tags, and GitHub Releases.

For changes that affect the published package, add a changeset:

```bash
pnpm changeset
```

This package is still pre-1.0, so version bumps do not promise strict semver compatibility yet. Choose the bump with this convention:

- `patch` for bug fixes and small internal improvements
- `minor` for notable features and breaking package changes before 1.0
- `major` is reserved for the eventual 1.0 line or an exceptional pre-1.0 reset

Documentation-only changes, tests, and internal maintenance usually do not need a changeset.

Do not edit `CHANGELOG.md` for unreleased changes. The release workflow updates it from merged changesets.

## Pull Requests

Pull requests should include:

- a clear description of the behavior change
- tests or updated examples when behavior changes
- a changeset when the published package should be released

Approved pull requests publish a temporary package preview with `pkg-pr-new` so reviewers can test the exact PR build before it is released. Preview packages are not npm releases and do not create changelog entries, git tags, or GitHub Releases.

## Release Flow

Merging changesets to `main` triggers the release workflow. The workflow either opens or updates a version pull request. Merging that version pull request publishes the package to npm, pushes git tags, and creates GitHub Releases.
