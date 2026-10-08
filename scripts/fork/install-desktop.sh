#!/usr/bin/env bash
# Build this fork's desktop app from this checkout, against the production
# Superset services and with the txcript transfer helper inside, and install it
# in /Applications. Released builds come from the fork-release workflow.
#
#   scripts/fork/install-desktop.sh
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
for tool in bun git cargo; do
	command -v "$tool" >/dev/null || {
		echo "$tool is required (see README, Fork section)" >&2
		exit 1
	}
done

if pgrep -f "/Applications/Superset Fork.app/Contents/MacOS/" >/dev/null; then
	echo "Quit Superset Fork before installing." >&2
	exit 1
fi

# An empty env file keeps the local development .env (localhost services) out
# of the build, so the app uses the production defaults.
env_file="$(mktemp)"
helper_home="$(mktemp -d)"
trap 'rm -rf "$env_file" "$helper_home"' EXIT
(cd "$root" && SUPERSET_HOME_DIR="$helper_home" bun scripts/build-txcript-transfer.ts)

cd "$root/apps/desktop"
# The fork's identity (see fork-identity.ts); it also overrides the workspace
# name a Superset terminal exports.
export SUPERSET_ENV_FILE="$env_file" SUPERSET_AUTO_UPDATE=disabled \
	SUPERSET_WORKSPACE_NAME=fork DESKTOP_NOTIFICATIONS_PORT=51742
env -u SUPERSET_HOME_DIR bun run prebuild
install -m 755 "$helper_home/bin/txcript-transfer" dist/resources/bin/txcript-transfer
install -m 755 "$helper_home/bin/txcript-cli" dist/resources/bin/txcript-cli
CSC_IDENTITY_AUTO_DISCOVERY=false env -u SUPERSET_HOME_DIR \
	bunx electron-builder --config electron-builder.ts --publish never --dir

name="Superset Fork.app"
app="$(find release -maxdepth 2 -name "$name" -path 'release/mac*' | head -n 1)"
[[ -n "$app" ]] || {
	echo "build produced no $name" >&2
	exit 1
}

backup="$HOME/.superset-fork/previous-app"
if [[ -d "/Applications/$name" ]]; then
	rm -rf "$backup"
	mkdir -p "$backup"
	mv "/Applications/$name" "$backup/"
	echo "previous app kept in $backup/$name"
fi
ditto "$app" "/Applications/$name"
echo "installed /Applications/$name ($(git -C "$root" rev-parse --short HEAD))"
