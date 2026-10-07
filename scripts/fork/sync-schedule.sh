#!/usr/bin/env bash
# Run the upstream sync every day on this Mac, with the GitHub CLI login.
#
#   scripts/fork/sync-schedule.sh install [HH:MM]   default 09:30
#   scripts/fork/sync-schedule.sh uninstall
#   scripts/fork/sync-schedule.sh run                one sync now
#
# The sync uses its own worktree in ~/.superset-fork/sync, so it never touches
# a checkout you work in. Logs: ~/.superset-fork/sync.log.
set -euo pipefail

LABEL="dev.superset-fork.sync-upstream"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
STATE="$HOME/.superset-fork"
WORKTREE="$STATE/sync"
BRANCH="fork/main"
repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

notify() {
	osascript -e "display notification \"$1\" with title \"Superset fork sync\"" || true
}

run_sync() {
	mkdir -p "$STATE"
	if [[ ! -e "$WORKTREE/.git" ]]; then
		git -C "$repo" worktree add --force --detach "$WORKTREE" "origin/$BRANCH"
	fi
	cd "$WORKTREE"
	git fetch --quiet origin "$BRANCH"
	git checkout --quiet -B fork-sync "origin/$BRANCH"
	git reset --quiet --hard "origin/$BRANCH"
	set +e
	# Pushes use the GitHub CLI login, which can update workflow files.
	FORK_SYNC_BRANCH="$BRANCH" GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=2 \
		GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0= \
		GIT_CONFIG_KEY_1=credential.helper \
		GIT_CONFIG_VALUE_1="!gh auth git-credential" \
		bash scripts/fork/sync-upstream.sh --checks --push
	status=$?
	set -e
	case "$status" in
	0) return 0 ;;
	2) reason="Merge conflicts with upstream main" ;;
	3) reason="Checks failed after merging upstream main" ;;
	*) reason="Upstream sync failed" ;;
	esac
	git merge --abort 2>/dev/null || true
	git reset --quiet --hard "origin/$BRANCH"
	notify "$reason. See ~/.superset-fork/sync.log"
	origin="$(git remote get-url origin)"
	origin="${origin%.git}"
	gh issue create --repo "${origin#https://github.com/}" \
		--title "Upstream sync needs attention" \
		--body "$reason on $(date '+%Y-%m-%d %H:%M'). Run \`bun run fork:sync\` on \`$BRANCH\` to resolve it locally." \
		>/dev/null 2>&1 || true
	return "$status"
}

case "${1:-}" in
install)
	time="${2:-09:30}"
	hour="${time%%:*}"
	minute="${time##*:}"
	mkdir -p "$STATE" "$(dirname "$PLIST")"
	cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>$repo/scripts/fork/sync-schedule.sh</string>
		<string>run</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key><string>$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
	</dict>
	<key>StartCalendarInterval</key>
	<dict>
		<key>Hour</key><integer>$((10#$hour))</integer>
		<key>Minute</key><integer>$((10#$minute))</integer>
	</dict>
	<key>StandardOutPath</key><string>$STATE/sync.log</string>
	<key>StandardErrorPath</key><string>$STATE/sync.log</string>
</dict>
</plist>
EOF
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$PLIST"
	echo "scheduled daily at $time ($PLIST)"
	;;
uninstall)
	launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
	rm -f "$PLIST"
	echo "removed $LABEL"
	;;
run)
	echo "=== $(date '+%Y-%m-%d %H:%M:%S')"
	run_sync
	;;
*)
	echo "usage: $0 install [HH:MM] | uninstall | run" >&2
	exit 64
	;;
esac
