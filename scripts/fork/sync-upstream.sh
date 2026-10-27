#!/usr/bin/env bash
# Merge a verified upstream release into a feature or proposal branch.
#
#   scripts/fork/sync-upstream.sh [--checks] [--push] [REF]
#
# REF       what to merge; default: the newest published stable desktop release (desktop-v*).
#           Pass upstream/main to follow upstream's development branch instead.
# --checks  install dependencies, then run lint, check:i18n and typecheck of
#           the workspaces the fork changes
# --push    publish only the verified proposal branch; requires GITHUB_REPOSITORY
#
# FORK_SYNC_BRANCH sets the branch --push updates (default: the current one).
#
# Exit codes: 0 merged or up to date, 2 conflicts, 3 checks failed.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/fork-upstream-source.sh"
fork_upstream_load
run_checks=false
push=false
ref=""
expected_sha=""
while [[ "$#" -gt 0 ]]; do
	case "$1" in
	--checks) run_checks=true; shift ;;
	--push) push=true; shift ;;
	--expected-sha) expected_sha="${2:?Missing expected SHA}"; shift 2 ;;
	-*)
		echo "unknown option: $1" >&2
		exit 64
		;;
	*)
		[[ -z "$ref" ]] || { echo "Expected a single upstream ref" >&2; exit 64; }
		ref="$1"; shift ;;
	esac
done

cd "$(git rev-parse --show-toplevel)"
branch="$(git symbolic-ref --short HEAD)"
target="${FORK_SYNC_BRANCH:-$branch}"
case "$branch" in main|fork/main) echo "Run upstream merges on a feature or proposal branch" >&2; exit 64 ;; esac
if $push; then
	case "$target" in main|fork/main|refs/heads/main|refs/heads/fork/main) echo "Protected target branch" >&2; exit 64 ;; esac
fi
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
	echo "working tree has uncommitted changes; commit or stash them first" >&2
	exit 1
fi

fork_upstream_resolve "$ref"
if [[ -n "$expected_sha" && "$expected_sha" != "$FORK_UPSTREAM_SHA" ]]; then
	echo "The upstream release changed after preparation" >&2
	exit 65
fi
if $push; then
	fork_upstream_require_proposal "$target"
	[[ "$branch" = "$target" ]] || { echo "Check out the proposal branch before publishing" >&2; exit 64; }
	fork_upstream_require_origin "${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY}"
fi
fork_upstream_fetch
ref="$FORK_UPSTREAM_SHA"
echo "upstream ref: $FORK_UPSTREAM_REPOSITORY $FORK_UPSTREAM_TAG ($ref)"

if fork_upstream_ancestor "$ref" HEAD; then
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
        # Only catalog conflicts need dependencies in the sync job; use the merged lockfile.
        bun install --frozen --ignore-scripts >/dev/null
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
	if ! bash scripts/fork/validate.sh; then
		echo "checks failed after merging $ref" >&2
		exit 3
	fi
fi

if $push; then
	git push origin "HEAD:refs/heads/$target"
fi
echo "merged $ref into $target"
