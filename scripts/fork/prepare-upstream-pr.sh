#!/usr/bin/env bash
# Prepare a reviewable upstream release. Never updates fork/main or enables auto-merge.
set -euo pipefail
tag="${1:?Pass a published desktop release tag}"
[[ "$tag" =~ ^desktop-v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid desktop release tag" >&2; exit 64; }
repository="${GITHUB_REPOSITORY:?Set GITHUB_REPOSITORY}"
head="fork/sync-$tag"
cd "$(git rev-parse --show-toplevel)"
existing=$(gh pr list --repo "$repository" --base fork/main --head "$head" --state all --json url --jq '.[0].url // empty')
if [[ -n "$existing" ]]; then
 echo "Release already proposed: $existing"
 exit 0
fi
conflicted=false
if git ls-remote --exit-code --heads origin "refs/heads/$head" >/dev/null; then
 # Recover a prior push whose PR creation failed; preserve any manual fixes.
 git fetch --quiet origin "refs/heads/$head"
 git checkout -b "$head" FETCH_HEAD
 if ! git merge-base --is-ancestor origin/fork/main HEAD; then
  conflicted=true
  echo "merge conflicts: recovered branch needs reconciliation with fork/main" >sync.log
 fi
else
 git checkout -b "$head"
 before=$(git rev-parse HEAD)
 set +e
 bash scripts/fork/sync-upstream.sh "$tag" >sync.log 2>&1
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
   release_sha=$(git rev-parse "$tag^{commit}")
   git push origin "$release_sha:refs/heads/$head"
   ;;
  *) echo "Upstream preparation failed; fork/main was not updated" >&2; exit "$status" ;;
 esac
fi
body=$(mktemp)
trap 'rm -f "$body"' EXIT
cat > "$body" <<BODY
Integrates the published upstream release [$tag](https://github.com/superset-sh/superset/releases/tag/$tag).

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
