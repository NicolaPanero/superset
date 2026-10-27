# Paradev++ account profiles

Add an account from the workspace account menu or Settings → Usage. Sign in with
the provider’s own CLI; each profile stores its own login. Paradev++ does not
copy credentials or refresh tokens from the external CLI login.

The profile name is optional when adding an account on an updated fork host.
Leave it empty to derive the folder name from the identity after the provider's
login finishes: `work@example.com` becomes `~/.claude-work-example-com`. Codex follows
the same rule. API logins without an email use a unique `api-…` name. A folder
already in use or reserved by a disconnected profile gets a numeric suffix;
no existing profile is overwritten. The temporary sign-in is not offered as an
account until it is complete. On macOS the rename updates Claude's scoped
Keychain service through `SecItemUpdate`, preserving credentials and permissions.
Older hosts require an explicit name until updated.

Renaming an existing account edits its display alias only. Clearing that alias
restores the email label without moving its folder or affecting running chats.

Existing independent named profiles are adopted at their current paths. The
host keeps their first verified identity in bounded fork metadata, outside the
official database schema. The named default stays selected even if the directory
is removed or the account signs out: choose another account or reconnect it.

Reconnect with the same account. A different identity cannot replace a saved
profile or inherit its quota. To use another identity, add another profile with a
different name. Missing profiles remain visible until explicitly removed.

The secondary **CLI login** entry follows the external CLI’s current sign-in.
It is available as an explicit launch choice, but cannot become the Paradev++
default and is excluded from suggested automatic recovery targets. Changing the
external CLI login does not change independent profiles or stop running chats.

The updated desktop requests isolated account responses through optional tRPC
inputs. Legacy procedure inputs and explicit null selections retain their
meaning. Remote hosts need the updated fork for profile identity protection;
cloud workspaces do not expose this machine’s local profiles.

The application icon is packaged from `apps/desktop/src/resources/build/fork-icons`
only for the fork identity. Official icons, bundle identities and data locations
are unchanged by this icon customization.

A profile's last successful quota is tied to its verified account identity, not
the short-lived access token. Token renewal can therefore retain that reading
when the provider is temporarily unavailable. A different identity, missing
identity, signed-out profile, or changed provider email cannot inherit it.
The pane keeps a dimmed progress ring for **Last known** usage, with a dashed
track and the original timestamp. This does not mark the reading as fresh or
make the account eligible for automatic continuation.

## Free usage-limit resets

The pane's Account usage popover, the chat session menu and Settings → Local agent accounts include a small reset action. It does not change the account picker or automatic continuation preferences, and never redeems a reset automatically.

- Codex uses the installed CLI's documented `account/rateLimits/read` and `account/rateLimitResetCredit/consume` app-server methods. Availability and expiry are shown only when verified; missing support is unknown, not zero. Older hosts or CLIs fall back to the provider's usage website.
- Redemption requires an explicit confirmation and a registered, independent subscription profile. The host checks the profile identity and the CLI's account email before redeeming. API billing and mutable external logins cannot use the direct action.
- Requests and five-minute caches are shared across visible views, with at most two account probes running together. No prompt, model turn, hook, or MCP call is used. The selected account's quota is refreshed after redemption; other account caches and `Retry-After` backoff remain intact.
- Each logical redemption uses the same UUID on retries. A private host journal stores at most 128 operation records for 24 hours, with no credentials, to recover an uncertain result after a host restart. Successful, previously redeemed, unavailable-credit and ineligible-window responses remain distinct.
- Claude's free-reset offer currently has no documented Claude Code interface equivalent. The action opens Claude's official Settings → Usage page and asks the user to check the account email in the browser. A reset applied there also restores the same account's Claude Code allowance; Paradev++ does not infer offer counts or redeem it through undocumented browser endpoints.

References: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Claude limit resets](https://support.claude.com/en/articles/17007452-what-is-a-limit-reset).

The macOS menu bar uses separate monochrome `forkIconTemplate.png` and `forkIconTemplate@2x.png` assets under `apps/desktop/src/resources/tray`, with the same central plus. macOS template rendering adapts them to light, dark and selected states; official builds keep their original tray icon. The adjacent SVG is the editable vector source.


## Message restart and context meters

The desktop keeps native restart separate from a text branch. Claude and Codex
use the adapter's message-point fork extension. The installed Grok 1.0.62 and
Cursor 2026.10.01 do not advertise standard ACP session/fork; enabling the same
message-point metadata for them would not implement a rewind. Their message
menu can open a new chat from the loaded message text through the selected
message. The confirmation states that tool state and files are not restored.
It preserves the current agent configuration, explicit account, model and mode.

Grok's `_x.ai/session/info` provides context usage without a model request.
The adapter reads it after attaching, after a turn and after a configuration
change. An older CLI returning method-not-found is probed once. Standard ACP
usage notifications remain supported for every agent. The verified Cursor
build exposes model selection but no context metrics over ACP; its context
control shows an unavailable state rather than an estimated percentage.

Account avatar rings measure used quota, with fixed periods: outer 5-hour,
inner weekly. Rings show the provider's general windows; model-specific
limits remain in the menu and automatic continuation. Codex periods are matched by their reported window labels, rather than
assuming primary always means five hours. Missing periods and stale samples
have no filled arc. Automatic continuation still uses the most restrictive
applicable quota independently of this display.

## Chat plans and naming

New Chat is the workspace action (Cmd+Shift+A); agent still names the provider
and its configuration. The context control stays visible before the first prompt
and keeps the same width once usage arrives. Its ring matches the account avatar’s
outer ring; the percentage appears inside for every reported value, including 0%.
Unknown usage remains dashed without an estimated percentage. Account quota rings
and the compact menu both show quota consumed; compact percentages explicitly
say used.

Structured plans share a Markdown preview and a side sheet, with progress for
item lists. Cursor plan approval details stay visible after a decision, including
old approvals whose target identifies Create Plan. Cursor replay also restores the
plan from the Create Plan tool input when it omits the approval event. ACP Markdown and file plan
updates are retained; a file reference opens through the existing workspace file
action. No plan file is read automatically. Agents that only send a task list
show that list; ordinary assistant prose stays in the chat and can also open in a side sheet
from its message actions, so plans written as prose work with every agent.

## Assessment: conversation and file rollback

This change retains chat-only restart. The runtime has no per-turn file
snapshot ledger. Grok exposes separate native rewind points and file restore
modes, but these do not provide a shared implementation for Cursor and the
other adapters. The desktop would also need to reconcile its journal after
an in-place native rewind; the current restart instead preserves the original
conversation and loads a fork.

A shared implementation needs checkpoints before each turn, handling for new,
deleted, binary and untracked files, and conflict detection when the user or
another chat has changed the workspace since the checkpoint. A simple git
reset or stash would not establish which changes belong to the selected turn.
There are no existing checkpoints to restore older sessions. This is deferred
as a separate feature; no file rollback or repository reset is performed here.

Native Grok interfaces were checked against the installed CLI and
[xAI's rewind handlers](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/src/extensions/rewind.rs).
Cursor was checked against its installed ACP implementation and
[the official ACP documentation](https://cursor.com/docs/cli/acp).


Reset waiting remains available when the chat has background processes. Once
fresh quota confirms availability on the same account, it sends the continuation
to the existing worker, preserving those processes. Account rotation still waits
for background work to finish. This also applies when reset waiting is enabled
after the quota error.

ACP plan documents use the same card and side panel across providers. Codex
receives the draft `plan` capability and full document updates; removed plans
remain archived in the transcript. Claude and Cursor tool input is also read on
history replay. Grok's `x.ai/exit_plan_mode` approval carries the document and
receives its native approved, abandoned or cancelled outcome. These cards require
an explicit plan event or tool; ordinary prose is not classified as a plan.

The background activity menu includes detached terminals as well as ACP tasks.
A detached terminal can be an idle shell. Clicking an ACP process opens its full
name and latest progress details, with a button to open the owning chat, including
chats in the right pane. A confirmed successful stop removes the task immediately;
a refused stop keeps it visible. Async events from unrelated sessions are ignored.
Some adapters reconcile running processes only on subsequent session activity;
age alone is not evidence that a process has finished, so there is no age-based
termination or automatic dismissal.

The chat mode menu is ordered by increasing permissions: Ask (read-only Q&A),
Plan, Ask for approval, Approve for me, and Full access, using only modes offered
by the agent. New chats use Full access when no explicit or saved per-agent mode
exists. The bounded `chatModeByAgent` preference still takes precedence, and
resuming a native conversation without an explicit mode keeps its own mode.

Queued messages have a direct Edit pencil, including messages with images and
files. Editing first reloads workspace and stored attachments, then removes the
queued message and restores text, pasted text cards and files into the composer.
An attachment read or queue removal failure leaves the queue entry intact. Existing
composer text and files are kept, and restored files use the same draft retention
as newly attached files. The queue's `e` shortcut also accepts attachment messages.

Agent handoff keeps the selected transfer mode while native capability checks
load or fail. Full history cannot silently become Summary only: Switch remains
disabled until native handoff is available, and the dialog displays the pending
or unavailable status. A messages-only continuation requires selecting Summary
only explicitly, including on hosts without the native transfer helper.
