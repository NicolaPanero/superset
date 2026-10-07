#!/usr/bin/env bash
# Merge an upstream superset-sh/superset release into the current fork branch.
#
#   scripts/fork/sync-upstream.sh [--checks] [--push] [REF]
#
# REF       what to merge; default: the newest desktop release tag (desktop-v*).
#           Pass upstream/main to follow upstream's development branch instead.
# --checks  install dependencies, then run lint, check:i18n and typecheck of
#           the workspaces the fork changes
# --push    push the merged branch
#
# FORK_SYNC_BRANCH sets the branch --push updates (default: the current one).
#
# Exit codes: 0 merged or up to date, 2 conflicts, 3 checks failed.
set -euo pipefail

UPSTREAM_URL="https://github.com/superset-sh/superset.git"
run_checks=false
push=false
ref=""
for arg in "$@"; do
	case "$arg" in
	--checks) run_checks=true ;;
	--push) push=true ;;
	-*)
		echo "unknown option: $arg" >&2
		exit 64
		;;
	*) ref="$arg" ;;
	esac
done

cd "$(git rev-parse --show-toplevel)"
branch="$(git symbolic-ref --short HEAD)"
target="${FORK_SYNC_BRANCH:-$branch}"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
	echo "working tree has uncommitted changes; commit or stash them first" >&2
	exit 1
fi

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
git fetch --quiet upstream main
if [[ -z "$ref" ]]; then
	ref="$(git ls-remote --tags --refs upstream 'desktop-v*' |
		sed 's#.*refs/tags/##' | grep -E '^desktop-v[0-9]+\.[0-9]+\.[0-9]+$' |
		sort -V | tail -n 1)"
	[[ -n "$ref" ]] || {
		echo "no desktop release tag found upstream" >&2
		exit 1
	}
	git fetch --quiet --no-tags upstream "refs/tags/$ref:refs/tags/$ref"
fi
echo "upstream ref: $ref"

if git merge-base --is-ancestor "$ref" HEAD; then
	echo "$branch already contains $ref"
	exit 0
fi

behind="$(git rev-list --count "HEAD..$ref")"
echo "merging $behind upstream commits ($ref) into $branch"
if ! git merge --no-edit --no-ff "$ref" >/dev/null; then
	conflicts="$(git diff --name-only --diff-filter=U)"
	# Catalogs conflict whenever both sides add strings; their entries are
	# independent, so they are joined and then regenerated from the source.
	if [[ -n "$conflicts" ]] && ! grep -qv '^packages/i18n/locales/.*\.po$' <<<"$conflicts"; then
		while read -r file; do
			git show ":2:$file" >"$file.ours"
			git show ":3:$file" >"$file.theirs"
			msgcat --use-first --sort-output -o "$file" "$file.ours" "$file.theirs"
			rm "$file.ours" "$file.theirs"
			git add "$file"
		done <<<"$conflicts"
		bun run check:i18n >/dev/null
		git add packages/i18n/locales
		git commit --no-edit >/dev/null
		echo "resolved catalog conflicts in: $(tr '\n' ' ' <<<"$conflicts")"
	else
		git merge --abort
		echo "merge conflicts:" >&2
		echo "$conflicts" >&2
		exit 2
	fi
fi

if $run_checks; then
	bun install --frozen --ignore-scripts
	# Only the workspaces the fork changes: a failure elsewhere is upstream's.
	if ! { bun run lint &&
		bunx turbo typecheck --filter=@superset/desktop \
			--filter=@superset/host-service --filter=@superset/chat-runtime \
			--filter=@superset/chat --filter=@superset/agent-setup &&
		bun run check:i18n &&
		git diff --exit-code --stat HEAD -- packages/i18n/locales; }; then
		echo "checks failed after merging $ref" >&2
		exit 3
	fi
fi

if $push; then
	git push origin "HEAD:$target"
fi
echo "merged $ref into $target"
