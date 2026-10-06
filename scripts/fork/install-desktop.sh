#!/usr/bin/env bash
# Build this fork's desktop app against the production Superset services and
# install it in /Applications, with the txcript transfer helper in ~/.superset.
#
#   scripts/fork/install-desktop.sh [--skip-helper]
#
# Fork builds do not update themselves: run this again after pulling.
set -euo pipefail

skip_helper=false
[[ "${1:-}" == "--skip-helper" ]] && skip_helper=true

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
for tool in bun git; do
	command -v "$tool" >/dev/null || {
		echo "$tool is required (see README, Fork section)" >&2
		exit 1
	}
done

if pgrep -f "/Applications/Superset.app/Contents/MacOS/" >/dev/null; then
	echo "Quit Superset before installing." >&2
	exit 1
fi

if ! $skip_helper; then
	command -v cargo >/dev/null || {
		echo "cargo is required to build the txcript helper (or pass --skip-helper)" >&2
		exit 1
	}
	# The installed app reads the helper from the default Superset home.
	(cd "$root" && env -u SUPERSET_HOME_DIR bun scripts/build-txcript-transfer.ts)
fi

# An empty env file keeps the local development .env (localhost services) out
# of the build, so the app uses the production defaults.
env_file="$(mktemp)"
trap 'rm -f "$env_file"' EXIT

cd "$root/apps/desktop"
export SUPERSET_ENV_FILE="$env_file" SUPERSET_AUTO_UPDATE=disabled
env -u SUPERSET_HOME_DIR bun run prebuild
CSC_IDENTITY_AUTO_DISCOVERY=false env -u SUPERSET_HOME_DIR \
	bunx electron-builder --config electron-builder.ts --publish never --dir

app="$(find release -maxdepth 2 -name Superset.app -path 'release/mac*' | head -n 1)"
[[ -n "$app" ]] || {
	echo "build produced no Superset.app" >&2
	exit 1
}

backup="$HOME/.superset/previous-app"
if [[ -d /Applications/Superset.app ]]; then
	rm -rf "$backup"
	mkdir -p "$backup"
	mv /Applications/Superset.app "$backup/"
	echo "previous app kept in $backup/Superset.app"
fi
ditto "$app" /Applications/Superset.app
echo "installed /Applications/Superset.app ($(git -C "$root" rev-parse --short HEAD))"
