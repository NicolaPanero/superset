# host-service

The tRPC router in `src/trpc/router` is called by desktop, CLI, and mobile, often on a different
version than the host. It goes both ways: an old client calls a new host, and a new client calls
a host as old as `MIN_HOST_SERVICE_VERSION` (`packages/shared/src/host-version.ts`).

- Follow the rules in `packages/trpc/AGENTS.md` and `.agents/skills/trpc-compat/SKILL.md`.
  Changes must be additive.
- A client that calls a new procedure must handle a host that does not have it, or the change
  must raise `MIN_HOST_SERVICE_VERSION` with a note in that file on why.
