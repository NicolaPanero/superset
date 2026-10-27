#!/usr/bin/env bash
# Prepare a reviewable upstream release. Never updates fork/main or enables auto-merge.
set -euo pipefail
requested="${1:-}"
repository="${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY}"
cd "$(git rev-parse --show-toplevel)"
source scripts/fork/fork-upstream-source.sh
fork_upstream_load
fork_upstream_resolve "$requested"
if $FORK_UPSTREAM_DEVELOPMENT; then
 echo "Proposals are prepared only from published stable releases" >&2
 exit 64
fi
tag="$FORK_UPSTREAM_TAG"
sha="$FORK_UPSTREAM_SHA"
head="$FORK_UPSTREAM_HEAD"
existing=$(gh pr list --repo "$repository" --base fork/main --head "$head" --state all --json url,state --jq '[.[] | select(.state == "OPEN" or .state == "MERGED")][0].url // empty')
if [[ -n "$existing" ]]; then
 echo "Release already proposed: $existing"
 exit 0
fi
closed=$(gh pr list --repo "$repository" --base fork/main --head "$head" --state closed --json url --jq '.[0].url // empty')
if [[ -n "$closed" && "${FORK_SYNC_RETRY:-false}" != true ]]; then
 echo "Proposal closed without merge: $closed. Run the sync again with retry to propose it again."
 exit 0
fi
fork_upstream_require_proposal "$head"
fork_upstream_require_origin "$repository"
conflicted=false
if git ls-remote --exit-code --heads origin "refs/heads/$head" >/dev/null; then
 # Recover a prior push whose PR creation failed; preserve any manual fixes.
 git fetch --quiet origin "refs/heads/$head"
 git checkout -b "$head" FETCH_HEAD
 if ! fork_upstream_ancestor origin/fork/main HEAD; then
  conflicted=true
  echo "merge conflicts: recovered branch needs reconciliation with fork/main" >sync.log
 fi
else
 git checkout -b "$head"
 before=$(git rev-parse HEAD)
 set +e
 bash scripts/fork/sync-upstream.sh --expected-sha "$sha" "$tag" >sync.log 2>&1
 status=$?
 set -e
 cat sync.log
 case "$status" in
  0)
   if [[ "$(git rev-parse HEAD)" = "$before" ]]; then echo "Release already integrated; no PR needed"; exit 0; fi
   git push origin "HEAD:refs/heads/$head"
   ;;
  2)
   # The merge was aborted. Propose the official commit so GitHub shows the
   # conflicts against fork/main; resolving them preserves both histories.
   conflicted=true
   git push origin "$sha:refs/heads/$head"
   ;;
  *) echo "Upstream preparation failed; fork/main was not updated" >&2; exit "$status" ;;
 esac
fi
body=$(mktemp)
trap 'rm -f "$body"' EXIT
cat > "$body" <<BODY
Integrates the published upstream release [$tag](https://github.com/$FORK_UPSTREAM_REPOSITORY/releases/tag/$tag) from \`$FORK_UPSTREAM_REPOSITORY\` at commit \`$sha\`.

Review the changes before merging into \`fork/main\`. Its required checks and owner review remain in force. The release build starts only after that merge.
BODY
arguments=(pr create --repo "$repository" --base fork/main --head "$head" --title "Sync upstream $tag" --body-file "$body")
if $conflicted; then
 arguments+=(--draft)
 cat >> "$body" <<'BODY'

The automatic merge found conflicts. This draft points to the official release commit; resolve it against `fork/main`, then mark the PR ready and run its required checks. No fork release has been built.

Conflicting paths:
```
BODY
 sed -n '/^merge conflicts:/,$p' sync.log >> "$body"
 echo '```' >> "$body"
fi
url=$(gh "${arguments[@]}")
echo "Upstream review: $url"
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
 echo "pr_url=$url" >> "$GITHUB_OUTPUT"
fi
