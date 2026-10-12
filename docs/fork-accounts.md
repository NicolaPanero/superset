# Superset++ account profiles

Add an account from the workspace account menu or Settings → Usage. Sign in with
the provider’s own CLI; each profile stores its own login. Superset++ does not
copy credentials or refresh tokens from the external CLI login.

The profile name is optional when adding an account on an updated fork host.
Leave it empty to derive the folder name from the identity after the provider's
login finishes: `b4b@siapcn.it` becomes `~/.claude-b4b-siapcn-it`. Codex follows
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
It is available as an explicit launch choice, but cannot become the Superset++
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
