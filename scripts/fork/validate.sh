#!/usr/bin/env bash
# Shared PR/release checks; install dependencies with a frozen lockfile first.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
bun run check:i18n
git diff --exit-code -- packages/i18n/locales
bun run lint
bunx turbo typecheck --filter=@superset/desktop --filter=@superset/host-service --filter=@superset/chat-runtime --filter=@superset/chat --filter=@superset/agent-setup --filter=@superset/shared
bun run test:fork --catalogs-ready
