# Repository and task connections

The fork calls GitHub, Bitbucket Cloud and Jira Cloud APIs from the host.
Superset sign-in, organization integrations and cloud workspace credentials are
independent. No MCP connection is required.

Test coverage and the desktop QA method: [integration verification](fork-integrations-qa.md).

Configure accounts in **Fork Settings → Connections** or in onboarding.
Signing in to Superset with GitHub identifies the Superset user. It does not
sign the local GitHub CLI in or connect the host's repository account. The
onboarding step is optional when working with local folders or another Git
provider. A signed-in local GitHub CLI can be reused explicitly without
starting another sign-in flow.
GitHub can use the existing local CLI/credential-helper account. Jira and
Bitbucket accept personal API tokens or a compatible OAuth broker. A Jira token
needs the account email and an HTTPS `*.atlassian.net` site. Classic tokens
call the site. When the site rejects a scoped token, calls move to the cloud
gateway with the site's cloud ID, resolved from its tenant metadata.

Adding a second account for a provider makes the account in use the default,
so Git, `gh` and API calls keep the same identity. Codex receives MCP header
and environment secrets through a private environment file, not arguments.

Connection metadata and workspace associations live in fork-owned SQLite
tables. Secrets are sealed using the existing host machine encryption utility.
They are never returned by connection-list procedures. Credential management is
restricted to direct callers on the host computer. Connections are scoped to
the host's active organization; they are not synchronized to another machine.

An explicitly disconnected account is not silently recovered from a credential
helper. Signing out of the shared GitHub CLI is a separate, explicit option.
SSH remains independent of API authentication.

The New Project repository picker searches connected GitHub and Bitbucket
accounts together. Each result shows its provider icon and account. Accounts
load independently, so one unavailable account does not block the others.
Duplicate repositories prefer the default account; pagination remains
independent for each account.
Bitbucket discovery uses `/user/workspaces` and `/repositories/{workspace}`;
the old global repository-permissions endpoint has been retired. Listing all
workspaces needs `read:workspace:bitbucket`, and listing repositories needs
`read:repository:bitbucket`. A token without workspace-list access can still
list repositories in workspaces found in this host's existing Git projects.

GitHub and Bitbucket share the existing PR list, project filters and split view.
Provider icons identify each repository. Discovery reads the live Git remote;
stale GitHub metadata does not send a Bitbucket repository to GitHub search.
An unavailable account leaves the other repositories visible with a connection
notice. The review-requested filter includes Bitbucket reviewers. Other GitHub review
filters keep a notice when Bitbucket cannot represent their semantics.
Bitbucket supports approvals, change requests, threaded comments, inline diff
comments (including removed lines), checks, merge, decline,
PR creation and workspace checkout. Project bindings select the account for
HTTPS Git operations within that provider, including separate checkouts of the
same repository. Existing SSH keys continue to control SSH access.
GitHub keeps its CLI-based operations; a project's selected account supplies
the CLI token when it runs in that checkout.

Jira is the default Tasks view when configured. It has list/board views,
text and issue-key search, assignee/project/status filters, and optional JQL.
Filters and view mode survive opening an issue; wide windows show the issue
beside the list, while narrow windows show the detail with a close control.
Issue details open in reading mode, with explicit editing, workflow
transitions and comments. Tasks can create a workspace or link an existing
one; PR creation from that workspace includes the linked issue URLs.
Creating an issue opens Jira's native form, so project-specific required
fields remain available. Editing a title does not rewrite rich descriptions.
Descriptions and comments use Markdown converted to and from ADF. Headings,
lists, links, emphasis, code blocks, tables and quotes retain their structure.
Jira-only nodes such as mentions become readable text; attachment nodes and
custom rich nodes are not reconstructed by the Markdown editor.

Use provider API tokens with the permissions needed for the enabled actions.
Read access does not grant merge, write or delete access. API errors remain
visible in the relevant screen; connecting an account does not elevate it.
Jira and Bitbucket credentials are configured separately, even when they
belong to the same Atlassian account. Token setup:
[Jira API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/),
[Bitbucket API tokens](https://support.atlassian.com/bitbucket-cloud/docs/api-tokens/).

## Workspace and review workflow

**Start in workspace** opens the normal workspace screen with the Jira issue
linked. Choose the project, base and agent there. The agent receives the title,
URL and description; the issue key names the branch and is added to PR titles.
Bug/Defect issues use `bugfix/`; the project's configured branch prefix still
applies. After creation the issue is linked and moved to an input-free working
status if one is available. Opening a PR tries an input-free review transition.
Workflows that require fields remain available through the issue's transition
form. Linked workspaces can be opened or unlinked from the issue detail.

Jira issues can also be linked from New workspace or mentioned in chat with `@`.
The command palette's **My Jira issues** opens the unfinished assigned issues.
Project, status, type, parent/epic and current-sprint filters are remembered.
Sprint field IDs are discovered per site. The board supports drag-and-drop and
an equivalent **Move** menu; only Jira's available transitions are offered.
Required transition fields open a form, and a failed move leaves the card in
its original status.

Bitbucket's PR detail shows reviewers, approvals, change requests, threads and
inline comments using the app's diff renderer. **Fix findings** selects an agent,
prepares or reuses a checkout and sends unresolved review comments plus failed
checks to it. The prompt treats provider text as external data and leaves
changes for review. **Open in workspace** reuses a linked workspace in the
selected project when its branch still matches. PR rows include pipeline
status and additions/deletions; workspace sidebar links refresh in background.
The endpoints follow [Bitbucket's pull request API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pullrequests/)
and [Jira's transition API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/).

## Local Jira automations

Open **Automations** in the Jira Tasks view. A rule contains a JQL query, target
project, agent and instructions. Rules are local to this host and organization;
they use the existing workspace and agent launch paths, with the configured
agent's account. They do not use the hosted automation service.

Rules are saved paused. After enabling, the first successful poll records
existing matches without launching them. The host checks once a minute while
running. Each later matching issue starts one workspace and agent per rule,
with `automation` and `jira` tags and the issue context in the prompt. Up to five
new launches per rule are handled in one poll. Queries must match at most 1000
issues; narrow a query that exceeds this limit. Offline reads launch nothing.

Run history retains the workspace and any launch error. A durable claim prevents
automatic duplicate attempts after a failure or interrupted host. Check the
workspace and start an agent manually after fixing a launch problem. Pausing
prevents future launches; deleting a rule deletes its history and leaves its
workspaces intact. The host must be running for polling; events that enter and
leave the query entirely between polls cannot be observed.

## OAuth broker protocol, version 1

The service is an authentication broker, not an API proxy. The desktop calls
the provider APIs directly. The broker must be trusted to issue credentials
for the user's selected accounts. Production broker URLs require HTTPS.

`GET <configured-base>/.well-known/superset-oauth`:

```json
{
  "version": 1,
  "providers": ["jira", "bitbucket"],
  "authorization_endpoint": "https://auth.example.com/authorize",
  "token_endpoint": "https://auth.example.com/token",
  "revocation_endpoint": "https://auth.example.com/revoke"
}
```

Endpoints must have the configured service's origin. The revocation endpoint
is optional. HTTP is accepted only on loopback for development.

The desktop opens the authorization endpoint with:

- `client_id=superset-fork-desktop`
- `response_type=code`
- `providers=jira bitbucket` (space-separated, restricted to requested products)
- `redirect_uri=http://127.0.0.1:<ephemeral-port>/callback`
- a random `state`
- `code_challenge` and `code_challenge_method=S256`

The broker authenticates the person and obtains the provider's consent. Jira
and Bitbucket can be one browser journey but have separate grants. It redirects
to the exact loopback URI with `code` and the original `state`. Authorization
codes must be short-lived, single-use, bound to client, redirect URI, providers
and PKCE challenge. Never put access tokens in a callback URL.

The host POSTs JSON to the token endpoint:

```json
{
  "grant_type": "authorization_code",
  "code": "<single-use-code>",
  "code_verifier": "<pkce-verifier>",
  "redirect_uri": "http://127.0.0.1:<port>/callback"
}
```

Response:

```json
{
  "connections": [
    {
      "provider": "jira",
      "access_token": "<provider-access-token>",
      "refresh_token": "<opaque-broker-session>",
      "expires_in": 3600,
      "site": "https://example.atlassian.net",
      "cloud_id": "<authorized-cloud-id>"
    },
    {
      "provider": "bitbucket",
      "access_token": "<provider-access-token>",
      "refresh_token": "<opaque-broker-session>",
      "expires_in": 3600
    }
  ]
}
```

Each opaque refresh credential belongs to this desktop authorization, not to
the MCP client. Provider client secrets and provider refresh tokens stay on the
broker. A partial authorization can return one of the requested providers;
the other card remains unconnected.

Refresh POST body:
`{ "grant_type": "refresh_token", "refresh_token": "...", "provider": "jira" }`.
Return one grant object, not the `connections` wrapper. The broker must retain
the authorized identity, site and scopes, rotate its session as needed, and
serialize refreshes of any shared upstream grant.

Revocation POST body:
`{ "token": "<opaque-broker-session>", "provider": "jira" }`.
Revoke that desktop session; do not revoke other desktop/MCP clients implicitly.
Responses must use `Cache-Control: no-store` and must not log credentials.

A login that only returns a personal MCP token does not implement this desktop
protocol. It needs an explicit broker endpoint before it can be selected here.
No provider endpoint is built into the fork.

## Compatibility and extension

New host APIs are additive: `forkConnections`, `forkScm`, `forkTasks`.
The renderer probes `forkConnections.list` and leaves legacy GitHub flows
available on older hosts. No released upstream procedure changes its shape.

Version 4 adds local Jira automations, review repair and board transition
destinations. These controls are gated by `forkConnections.list.version` and
leave older host APIs available. New-workspace Jira linking falls back to the
existing `link` procedure on older fork hosts. The existing procedure shapes
remain compatible; transition destinations and comment sides are optional
additions. The fork owns its SQLite tables and their initialization.

Version 3 adds a guarded availability query. Provider outages are tracked on the
host, separately from account credentials. After a failed Bitbucket or Jira
request, the desktop shows an unreachable notice and probes the affected account
at most once every 30 seconds. Recovery refreshes active reads. Network failures
during account verification preserve the saved identity, credentials and state.
Cached tasks, PRs and repositories remain visible during failed refreshes for
the same filters. Mutations fail immediately and are never queued for replay
when the network returns.

Provider references include service, host and repository; Jira references also
include the connection/site. Jira IDs never enter native Superset `taskId`
fields. Tables are initialized by `ensureForkTables`, outside upstream migration
journals. An expired Jira configuration remains visible in Tasks
with a recoverable error when Pro features are hidden.

Future providers add a definition in `FORK_PROVIDER_DEFINITIONS`, implement
`ForkSourceControlProvider` or `ForkTaskProvider`, and map their official APIs.
They do not need changes to app sign-in or the broker transport.

The broker protocol above is implemented by the desktop client and covered
by a local broker fixture. Running an OAuth broker in production is a separate
deployment; pointing at an arbitrary MCP login URL is not sufficient.
