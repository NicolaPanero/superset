# Jira, Bitbucket and Git integration verification

Verification date: 2026-10-19. Feature baseline: "feat(fork): finish Jira automation
and Bitbucket review workflows".

## Results

| Check | Result |
| --- | --- |
| Fork suite | 953 passed: 309 desktop, 619 unit/runtime, 25 host integration |
| Additional upstream Git/PR tests | 207 passed |
| Native worker tests | 4 passed |
| Desktop and host-service typechecks | Passed |
| Internationalization | All 17 locales extracted and compiled successfully |
| Biome and whitespace checks | Passed for the changed files |

The mixed provider RPC scenario and automation CRUD use separate tests so
each stays within the default five-second test budget. The mixed deletion
test seeds real Git worktrees directly instead of repeating workspace launch
and provisioning, which are covered by the account/branch integration tests.

## Coverage

| Area | Verification |
| --- | --- |
| Accounts | Two HTTPS checkouts of the same Bitbucket repository use their own bound tokens while GitHub remains separate. Nested requests to an unbound project return to the default account. Disabled accounts fail without switching identity. |
| GitHub PRs | Concurrent detail and diff requests share a cache only within the same host database, organization and account configuration. Eviction stays scoped. Search groups projects by account. Existing upstream Git and PR suites cover the native path. |
| Jira | Two sites with the same issue ID/key retain separate content, links and transitions. Markdown fences and list continuations round-trip without hanging. Removing a linked issue clears generated names, preserves manual edits and transfers names to another linked issue. |
| Bitbucket | Search, review filters, approvals, comments on removed lines, diff statistics, checks and stale sidebar refreshes. Unsupported filters cannot silently return an unfiltered list. |
| Automations | Paused creation, connection isolation, enable/pause/delete, empty history, baseline matching, concurrent poll deduplication, failed launch history, pause during search and bounded launch batches. |
| Git branches | Existing and imported branches, shared worktrees, uncommitted files, remote references, provenance checks and mixed branch deletion remain protected. |
| Compatibility | Existing RPC input/output shapes and integration version stay unchanged. The provider transport dependency is optional and defaults to the existing network implementation. |

The new integration fixtures run through the real Hono/tRPC stack, SQLite and
temporary Git repositories. Provider credentials and responses are test data;
the fixtures do not contact Jira, Bitbucket or GitHub.

## Desktop verification

A separate Electron instance used this checkout's renderer on port 41005,
its own profile, a temporary host database and a temporary Git repository.
External Jira and Bitbucket requests were routed to a local provider fixture
in that instance's host process. The regular desktop instance stayed running.

Native CDP mouse, drag and text input verified:

- Jira list/board navigation and switching between two sites with `APP-7`.
- A real intercepted drag into In Progress, repeated boundary crossings,
  stationary dwells and 120 ms renderer stalls every 400 ms. The server accepted
  the transition and the card appeared in its destination. No React errors
  were captured during the gesture.
- The Move action and a transition requiring a Review note. Empty submission
  stayed invalid; completing the field moved the issue into Code Review.
- Jira linking and removal in the new-workspace composer.
- Bitbucket PR preview, additions/deletions, reviewer display, approval,
  comment submission and successful build display.
- A simulated Bitbucket outage displayed the service notice while Jira's
  other site remained usable. Restoring the fixture cleared the notice.

The automation form was opened and its required-field validation was checked;
CRUD and launch scheduling were tested through RPC and injected launch actions.
No real agent was started by the desktop verification. Real provider permissions,
production OAuth consent/email verification and live pipelines need a separate
check against the owner's accounts. This report does not claim those checks.

## Repeatable checks

```sh
bun run check:i18n
bun run --cwd apps/desktop typecheck
bun run --cwd packages/host-service typecheck
bun run test:fork --catalogs-ready
bun run --cwd packages/host-service test:integration:workers
```

Additional native-path regression checks, from `packages/host-service`:

```sh
bun test --preload ./test/setup-env.ts src/runtime/git src/runtime/pull-requests src/trpc/router/pull-requests/shared
```

## Keeping upstream merges small

Provider behavior, request scoping, cache identity and test fixtures live in
fork-owned files. The shared Git resolver has one optional path-scoping hook;
the request middleware, CLI helper and PR caches delegate to fork helpers.
The draft unlink hook delegates the Jira-specific patch to the fork utility.
No generated database migration, API contract replacement or dependency update
is part of this verification change.

The merge simulation against the fetched `origin/fork/main` was clean. Against
official `upstream/main` at `8bc96462cc`, both the feature baseline and
the verification fix have the same 37 conflicting paths. This change adds no conflicting path. Those existing conflicts require
a dedicated upstream sync; the simulation changed no working files.

Before staging, inspect `git diff --check` and the upstream-file hooks. A
`git merge-tree --write-tree HEAD origin/fork/main` check can detect conflicts
against the fetched fork base without changing the checkout. This cannot
guarantee that future upstream edits will merge without conflicts.
