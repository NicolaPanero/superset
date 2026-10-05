# Nicola Superset local handoff roadmap

Historical preparation snapshot. Superseded on 2026-10-03 by
[nicola-local-implementation.md](nicola-local-implementation.md) and
[nicola-local-architecture.md](nicola-local-architecture.md), following the
new five-agent local plan. Unchecked items and environment statements below
describe the earlier preparation phase, not the current project status.

## Objective

Start with terminal session transfer on the local computer. This phase changes no hosted API, auth provider, cloud database, or OAuth integration. Microsoft, account linking, Jira, Bitbucket and automatic account fallback remain later decisions.

## Progress

- [x] Clone upstream into an isolated local checkout.
- [x] Read root AGENTS.md, CODEX.md, DEVELOPMENT.md, CONTRIBUTING.md and applicable desktop/host-service instructions.
- [x] Create feature/txcript-native-handoff; main remains upstream code.
- [x] Map the current terminal handoff and resume launch path.
- [x] Run the existing shared handoff tests: 12 passed, 0 failed.
- [x] Run an offline synthetic txcript experiment: four cases passed, Claude to Codex and Codex to Claude with explicit export and isolated native target stores.
- [ ] Complete upstream development build and full baseline checks.
- [ ] Prove real CLI resume and continuation on controlled demo conversations.
- [ ] Launch converted sessions through the Superset terminal pipeline and verify binding/restart.
- [ ] Add a minimal native-transfer UI after that proof.

## Baseline

- Superset commit: b8c5ad799e1f2f626cc0daab3d970de87bb9b950
- Branch: feature/txcript-native-handoff
- Remote upstream: https://github.com/superset-sh/superset.git
- No personal GitHub fork or origin remote created yet.
- txcript: 0.14.4
- Claude Code: 2.1.285
- Codex CLI: 0.159.0
- Bun: 1.3.14, downloaded and checksum-verified under ../toolchain; no global install or shell changes.
- Docker engine available: 29.4.0. No containers started for this phase.
- GitHub CLI not found on PATH; required for later GitHub fork/PR operations, not the offline experiment.
- Dependency install, lint, typecheck, full test suite and desktop build have not run.

## Existing code path

TerminalSessionHandoffMenu.tsx
-> useAgentSessionLauncher/useAgentSessionLauncher.ts
-> workspaceTrpc.agents.run
-> packages/host-service/src/trpc/router/agents/agents.ts
-> runAgentInWorkspace / runTerminalAgent
-> terminal creation and host-managed launch

Context retrieval:
terminal.transcript
-> packages/host-service/src/terminal/terminal.ts:transcriptSession
-> terminalHarnessSession and readHarnessTranscriptOffLoop
-> retained PTY/screen fallbacks
-> packages/shared/src/terminal-session-handoff.ts (36,000 characters)

The launcher already accepts resumeSessionId. The desktop createNewAgentSession input currently exposes forkSessionId but not resumeSessionId. Its normal path can choose ACP chat first: a future native terminal resume must bypass that choice, as native fork already does. This does not require changing the ACP harness.

## Discoveries

- txcript continue --no-resume saves without starting an agent.
- Explicit --out is an export mode: it preserves the source session ID. It must not be mistaken for a new imported-session identity.
- Saving to isolated target stores without --out generates a new target UUID. Source fixture SHA-256 hashes stayed unchanged.
- These small fixtures preserve canonical text, image data where supplied, reasoning text and completed tool call/result blocks. Opaque reasoning/signatures were excluded from the claim.
- cli_version in the converted metadata can still describe the source CLI. Resume compatibility must be tested with the actual target CLI.
- CLI target ID currently comes from human output. Parsing it is a spike technique, not the production contract.

## Decisions

1. Start with Claude and Codex only, on one local host and the same demo workspace.
2. Fix source and target profile/store roots independently before saving.
3. Superset owns terminal creation, process launch and session binding.
4. Keep the current context handoff as a selectable fallback.
5. Use controlled conversations for runtime tests; existing user histories are not needed for the experiment.
6. Select CLI JSON enhancement or a small Rust helper only after the runtime proof. A helper must mint a fresh identity before save.
7. Full UI, Cursor/Grok and account fallback are later local milestones.

## Open Questions

- Do Claude 2.1.285 and Codex 0.159.0 actually resume the converted histories and use their contents?
- Do path encoding, Unicode, symlinks and long paths work in both directions?
- What is lost for compaction, MCP calls, pending tool calls and opaque reasoning?
- Can a saved transfer be launched and rebound after a restart without converting twice?
- Does the installed app use the expected local host/profile for the selected session?

## Validation

Existing upstream shared handoff suite: 12 pass, 0 fail, 28 expectations.
Synthetic txcript experiment: 4 cases PASS; source hashes and cwd checked, agent executable tripwires never triggered.
Report: ../local-handoff-spike/report.json
Reproduction: python3 ../local-handoff-spike/run_spike.py
These results prove fixture conversion and isolated storage behavior. They do not prove target-agent resume, Superset UI integration, or full application baseline.

## Next step

Complete the local development baseline with the repository setup, then test real Claude/Codex resume against short demo sessions before any production transfer UI is added. Development services may run locally for this test; the hosted backend and authentication configuration remain unchanged.
