# tRPC API compatibility

`src/router/` is the cloud API. Every merge to main deploys it within minutes. Desktop, mobile,
the `superset` CLI, `@superset/sdk`, and MCP call it from released builds that update on their
own schedule. A change to a procedure's input or output reaches those old builds at once.

**Why this file exists.** On 2026-09-23, #7726 changed `page.list` from a bare array to
`{ items, nextCursor }`. It updated every caller on main, so typecheck and tests passed. Desktop
1.30.0–1.30.2 still called `.map` on the result, and every workspace view crashed (SEV1, 337
Sentry events). A revert was not possible because the same PR had a migration that was already
applied. #7756 restored the bare array and moved pagination to `page.listPaginated`. #7317 did
the same kind of damage earlier when it removed a field from the plugins catalog output.

**Updating every caller on main is not enough.** CI only sees main. Nothing checks the API
against released builds, so you must.

## Rules

1. **Never change the input or output of a procedure that released clients call.** Add a new
   procedure instead. This is the #7756 fix, in `router/page/page.ts`:
   ```ts
   // Don't: change list's return type from Page[] to { items, nextCursor }
   // Do: keep list as it was, add a new procedure for the new shape
   list: protectedProcedure.input(legacyListPagesSchema).query(/* still returns Page[] */),
   listPaginated: protectedProcedure.input(listPagesSchema).query(/* { items, nextCursor } */),
   ```
2. **Add, do not change.** New procedures, new optional input fields, and new output fields are
   safe. Do not rename, remove, or retype an existing procedure, input field, or output field.
3. **New input fields are optional**, with a server-side default. Old clients do not send them.
   ```ts
   limit: z.number().int().positive().max(100).optional(), // Do: default in the handler
   limit: z.number().int().positive().max(100),            // Don't: old clients now fail
   ```
4. **Do not tighten validation on existing inputs**: no new `.min()`/`.max()`/`.uuid()`/
   `.refine()`, no narrower enum, no `nullish()` → `optional()`, no optional → required.
5. **Keep output shapes stable.** Do not remove a field, rename it, change its type, wrap it in
   an object, or make it nullable when it was not. Old clients read it without a guard. An enum
   output can grow only if old clients handle an unknown value.
6. **To accept a new input shape, accept both.** `automation/schema.ts` keeps the legacy
   top-level `rrule` next to `triggers` and folds it server-side.
7. **To replace a procedure, keep the old one** as a thin alias with `@deprecated`, like
   `task.all` → `task.list` and `task.createFromUi` → `task.create` in `task/task.ts`. A
   deprecated input field stays accepted and ignored, like `branch` in `task/schema.ts`.
8. **Ship a schema migration in a different PR from a contract change**, so a bad contract
   change can still be reverted.

## Who is still calling

- **Desktop**: builds below `MINIMUM_DESKTOP_VERSION`
  (`apps/api/src/app/api/desktop/version/route.ts`) are blocked on `UpdateRequiredPage`.
  Every build at or above it is live.
- **Mobile**: `MINIMUM_MOBILE_VERSION` (`apps/api/src/app/api/mobile/version/route.ts`) is
  `1.0.0`, so every build is live.
- **CLI, SDK, MCP**: no floor.
- **Usage data**: clients send `x-superset-client: <product>/<version>`. The middleware in
  `src/trpc.ts` samples calls into the PostHog event `api_procedure_called` (procedure,
  product, version).

## When removal is allowed

Remove a deprecated procedure or field only when both are true:

- `api_procedure_called` shows no calls from a client version that is still live.
- Every desktop build that calls it is below `MINIMUM_DESKTOP_VERSION`. Raising the floor is a
  product decision, not part of a cleanup PR.

Name the evidence in the PR. `d1aee0922f` (removal of `device.heartbeat`) is the model.

The host-service tRPC router (`packages/host-service/src/trpc/router`) has the same problem: a
desktop app often talks to a host-service on a different version. Apply the same rules there.
