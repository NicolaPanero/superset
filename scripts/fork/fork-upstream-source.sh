#!/usr/bin/env bash
set -euo pipefail

fork_upstream_load() {
	local settings
	settings=$(jq -er '
        select(.id | type == "string" and test("^[a-z][a-z0-9-]*$")) |
        select(.repository | type == "string" and test("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")) |
        select(.gitUrl == "https://github.com/" + .repository + ".git") |
        select(.branch | type == "string" and test("^[A-Za-z0-9][A-Za-z0-9._/-]*$")) |
        select(.stableTagPattern | type == "string") |
        select(.mirrorMain | type == "boolean") |
        [.id, .repository, .gitUrl, .branch, .stableTagPattern, (.mirrorMain | tostring)] | @tsv
    ' "$(dirname "${BASH_SOURCE[0]}")/upstream.json")
	IFS=$'\t' read -r FORK_UPSTREAM_ID FORK_UPSTREAM_REPOSITORY FORK_UPSTREAM_URL \
		FORK_UPSTREAM_BRANCH FORK_UPSTREAM_TAG_PATTERN FORK_UPSTREAM_MIRROR <<<"$settings"
	FORK_UPSTREAM_TAG_PATTERN="${FORK_UPSTREAM_TAG_PATTERN//\\\\/\\}"
	git check-ref-format "refs/heads/$FORK_UPSTREAM_BRANCH"
}

fork_upstream_resolve() {
	local requested="${1:-}" release
	FORK_UPSTREAM_DEVELOPMENT=false
	if [[ "$requested" = "upstream/$FORK_UPSTREAM_BRANCH" ]]; then
		FORK_UPSTREAM_DEVELOPMENT=true
		FORK_UPSTREAM_TAG="$FORK_UPSTREAM_BRANCH"
	else
		if [[ -z "$requested" ]]; then
			requested=$(gh api --paginate "repos/$FORK_UPSTREAM_REPOSITORY/releases?per_page=100" \
				--jq '.[] | select(.draft == false and .prerelease == false) | .tag_name' |
				jq -Rrs --arg pattern "$FORK_UPSTREAM_TAG_PATTERN" '
                    [split("\n")[] | select(test($pattern))] |
                    sort_by(ltrimstr("desktop-v") | split(".") | map(tonumber)) |
                    last // empty')
		fi
		if [[ -z "$requested" || ! "$requested" =~ $FORK_UPSTREAM_TAG_PATTERN ]]; then
			echo "Expected a published stable desktop release or upstream/$FORK_UPSTREAM_BRANCH" >&2
			return 64
		fi
		release=$(gh api "repos/$FORK_UPSTREAM_REPOSITORY/releases/tags/$requested")
		if ! jq -e --arg tag "$requested" \
			'.tag_name == $tag and .draft == false and .prerelease == false' \
			<<<"$release" >/dev/null; then
			echo "The selected release is not a published stable desktop release" >&2
			return 65
		fi
		FORK_UPSTREAM_TAG="$requested"
	fi
	FORK_UPSTREAM_SHA=$(gh api "repos/$FORK_UPSTREAM_REPOSITORY/commits/$FORK_UPSTREAM_TAG" --jq .sha)
	if [[ ! "$FORK_UPSTREAM_SHA" =~ ^[a-f0-9]{40}$ ]]; then
		echo "The upstream API did not return a commit SHA" >&2
		return 65
	fi
	FORK_UPSTREAM_REF="refs/fork/upstream/$FORK_UPSTREAM_ID/$FORK_UPSTREAM_TAG"
	FORK_UPSTREAM_HEAD="fork/sync-$FORK_UPSTREAM_ID-${FORK_UPSTREAM_TAG//\//-}-${FORK_UPSTREAM_SHA:0:12}"
}

fork_upstream_fetch() {
	local remote_url recorded="" incoming fetched source_ref status
	if remote_url=$(git remote get-url upstream 2>/dev/null); then
		if [[ "$remote_url" != "$FORK_UPSTREAM_URL" ]]; then
			echo "Updating upstream remote to $FORK_UPSTREAM_REPOSITORY" >&2
			git remote set-url upstream "$FORK_UPSTREAM_URL"
		fi
	else
		git remote add upstream "$FORK_UPSTREAM_URL"
	fi
	if recorded=$(git rev-parse --verify --quiet "$FORK_UPSTREAM_REF^{commit}"); then
		if ! $FORK_UPSTREAM_DEVELOPMENT && [[ "$recorded" != "$FORK_UPSTREAM_SHA" ]]; then
			echo "The registered upstream release changed SHA: $FORK_UPSTREAM_TAG" >&2
			return 65
		fi
	else
		status=$?
		[[ "$status" = 1 ]] || return "$status"
		recorded=""
	fi
	incoming="$FORK_UPSTREAM_REF.incoming-$$"
	if $FORK_UPSTREAM_DEVELOPMENT; then source_ref="refs/heads/$FORK_UPSTREAM_BRANCH";
	else source_ref="refs/tags/$FORK_UPSTREAM_TAG"; fi
	if ! git fetch --quiet --no-tags upstream "$source_ref:$incoming"; then
		git update-ref -d "$incoming"
		return 1
	fi
	if ! fetched=$(git rev-parse --verify "$incoming^{commit}") || [[ "$fetched" != "$FORK_UPSTREAM_SHA" ]]; then
		git update-ref -d "$incoming"
		echo "Fetched upstream commit does not match the release API SHA" >&2
		return 65
	fi
	if ! git update-ref "$FORK_UPSTREAM_REF" "$fetched" "$recorded"; then
		git update-ref -d "$incoming"
		return 1
	fi
	git update-ref -d "$incoming"
}

fork_upstream_require_origin() {
	local repository="$1" address
	if [[ "$repository" = "$FORK_UPSTREAM_REPOSITORY" || "$repository" = "superset-sh/superset" ||
		! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
		echo "Expected the fork repository, not the upstream repository" >&2
		return 64
	fi
	for address in "$(git remote get-url origin)" "$(git remote get-url --push origin)"; do
		case "$address" in
		"https://github.com/$repository"|"https://github.com/$repository.git"|\
		"git@github.com:$repository.git"|"ssh://git@github.com/$repository.git") ;;
		*) echo "Origin does not point to $repository; refusing to publish" >&2; return 65 ;;
		esac
	done
}

fork_upstream_require_proposal() {
	local branch="$1"
	if [[ "$branch" != "$FORK_UPSTREAM_HEAD" ]]; then
		echo "Only the verified proposal branch may be published: $FORK_UPSTREAM_HEAD" >&2
		return 64
	fi
	git check-ref-format "refs/heads/$branch"
}

fork_upstream_ancestor() {
	local status
	if git merge-base --is-ancestor "$1" "$2"; then return 0;
	else status=$?; [[ "$status" = 1 ]] || exit "$status"; return 1; fi
}

fork_upstream_mirror() {
	local parent
	if [[ "$FORK_UPSTREAM_MIRROR" != true ]]; then return; fi
	parent=$(gh api "repos/${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY}" --jq .parent.full_name)
	if [[ "$parent" != "$FORK_UPSTREAM_REPOSITORY" ]]; then
		echo "GitHub parent differs from the configured upstream; mirror cancelled" >&2
		return 65
	fi
	gh api --method POST "repos/$GITHUB_REPOSITORY/merge-upstream" \
		-f branch=main --jq '"\(.merge_type): \(.message)"'
}

if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
	fork_upstream_load
	case "${1:-}" in
	mirror) fork_upstream_mirror ;;
	*) echo "Expected mirror" >&2; exit 64 ;;
	esac
fi
