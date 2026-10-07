# Local native transfer engine

This fork uses txcript (Apache-2.0) from
[NicolaPanero/txcript](https://github.com/NicolaPanero/txcript), whose
`v<version>-fork.<n>` releases publish this helper prebuilt for Apple Silicon:
the official library at commit
`8cd3b0e63f797b1531a14197f41a0e9eeedec8c6` plus fixes for structured Codex
tool outputs and Codex's AGENTS.md prelude, Cursor's active transcript,
resumable graph and message order, and OpenCode's tool-result pairing, and a
conversion-only example with a bounded JSON
protocol. The same build serves NicolaPanero/zed. Agent file formats
remain in the official library. No second codec exists in Superset.

With Bun 1.3.14 on PATH, run from the repository root:

```sh
bun run scripts/build-txcript-transfer.ts
```

The script downloads the helper from the fork's latest release (or the one
`TXCRIPT_TAG` names), checks it against the release's SHA256SUMS and its
reported engine version, and installs it under
`$SUPERSET_HOME_DIR/bin/txcript-transfer`.
Bun loads the local development `.env`; check its SUPERSET_HOME_DIR first.
Without it, the destination is `~/.superset`. It does not replace the user's
`txcript` executable. Fixes to the helper or the engine go to the fork; a new
release reaches the app's next build without changes here.

Protocol version 1 accepts one JSON request on stdin: sourceAgent,
sourceSessionId, sourceRoot, sourceReference, targetAgent, targetRoot, cwd.
It returns a fresh native targetSessionId, reference, cwd, messageCount and
warnings. `capabilities` returns declared and verified adapters separately.
Errors contain fixed codes, never transcript text or credentials.

Engine `0.14.4-fork.5` has verified Claude Code, Codex, Cursor CLI, Grok
Build and OpenCode adapters on macOS arm64. All 20 cross-agent directions
passed real native resumes using dedicated multi-turn read/edit/shell
fixtures. Assertions check persisted targets, cwd, unmodified source
conversations, full text, tool IDs/results/error flags, and recall without
giving the expected markers in the resume prompt. Targets may join text
blocks or reorder tool-result records; results are compared by call ID.
Structured results are preserved as JSON text for target formats that
cannot accept the source block tags. Invalid tool IDs are normalized with
deterministic aliases, preserving call/result pairing; the helper response
includes `toolIdMap` for verification.
Cursor CLI user turns drop the `<timestamp>` prefix Cursor adds before
`<user_query>`, and message times are made strictly increasing because
Cursor stores one time for a whole chat.
Permissions, MCP configuration and credentials are not transferred; opaque
provider reasoning is not claimed to be portable. The helper never launches
an agent. Superset owns profile selection and the subsequent native resume.

Transfers require an idle source in the same workspace. A changed/incomplete
source, a different cwd or a source outside its store is rejected. The host
pins both the resolved config and target profile before conversion, bypassing
the wrapper's default-account refresh for that launch. Prepared jobs and
launch retries are coalesced per organization, bounded to 128 entries with a
30-minute lifetime. These jobs are in memory; host restart expires them.
Native files already created remain resumable through the native CLI.
Conversion runs in the requested workspace directory, including OpenCode's
CLI import. Cancellation stops the helper and its import child as one
process group on macOS/Linux and suppresses a late UI launch. The native
agent is subsequently launched through Superset's existing PTY pipeline.
Absolute Cursor CLI commands receive `CURSOR_AGENT=1`, so lifecycle hooks
keep identifying the CLI rather than the separate Cursor IDE Composer.

Claude and Codex honor the selected profile. Cursor, Grok and OpenCode
currently support only the verified default stores; non-default home/data
overrides are rejected. This is not a claim of universal lossless transfer:
provider-specific reasoning, permissions, runtime configuration, credentials
and MCP settings are not portable. A later native resume sends history to
the target model provider under that agent's configured account.

The renderer offers an explicit Context Handoff when native conversion
fails. Source session and directory are shown before conversion, and a
successful handoff reports the new native ID and any metadata warning.
Superset saves native parent/child lineage in its local SQLite database. The
workspace history supports branching, reusing a live session and reopening
a native session after a host restart, with its original profile. It does
not retain credentials or transcript copies. Context handoffs are not yet
recorded in that native history. Automatic account switching and installer
bundling remain later plan gates; the helper itself only converts sessions.

Reproduce library checks from the patched engine checkout:

```sh
cargo test --locked -p txcript --no-default-features --features opencode \
  --lib --test integration --test regression
cargo test --locked -p txcript --no-default-features --features opencode \
  --example superset-transfer
cargo clippy --locked -p txcript --no-default-features --features opencode \
  --lib --example superset-transfer --test regression --test integration \
  -- -D warnings
```

Some library tests bind a temporary localhost HTTP server. The checked
build has 64 library, 212 integration, 11 regression and one helper-ID
test. Native UI tests also cover agent ownership and disposal of the
dedicated test workspace's sessions. Private fixture transcripts are not
included in the repository patch.
