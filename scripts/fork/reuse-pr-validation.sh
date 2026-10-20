#!/usr/bin/env bash
set -euo pipefail

find_validation() {
  local tree workflow_id runs run passed
  tree=$(git rev-parse 'HEAD^{tree}') || return 1
  workflow_id=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/fork-tests.yml" --jq .id) || return 1
  runs=$(gh api "repos/$GITHUB_REPOSITORY/actions/artifacts?name=fork-validated-tree-v1-$tree&per_page=100" \
    --jq '.artifacts[] | select(.expired == false) | .workflow_run.id') || return 1
  for run in $runs; do
    passed=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run" \
      --jq ".workflow_id == $workflow_id and .status == \"completed\" and .conclusion == \"success\" and (.event == \"pull_request\" or .event == \"workflow_dispatch\") and .head_repository.full_name == \"$GITHUB_REPOSITORY\"") || continue
    if [ "$passed" = true ]; then
      echo "Reusing regression validation for tree $tree from run $run"
      return 0
    fi
  done
  return 1
}

if find_validation; then
  echo 'validated=true' >> "$GITHUB_OUTPUT"
else
  echo 'No successful PR validation found for this tree; running release validation'
  echo 'validated=false' >> "$GITHUB_OUTPUT"
fi
