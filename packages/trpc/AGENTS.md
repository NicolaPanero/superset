# tRPC API compatibility

`src/router/` is the cloud API. Every merge to main deploys it within minutes, but desktop,
mobile, CLI, and SDK builds already released keep calling it. On 2026-09-23, #7726 changed
`page.list` from an array to `{ items, nextCursor }` and updated every caller on main. CI passed,
and every workspace view in desktop 1.30.x crashed. **Updating every caller on main is not
enough.**

**Before you change or remove an existing procedure, follow `.agents/skills/trpc-compat/SKILL.md`.**

## Rules

1. **Never change the input or output of a procedure that released clients call.** Add a new
   procedure. This is the fix in `router/page/page.ts` (#7756):
   ```ts
   list: protectedProcedure.input(legacyListPagesSchema).query(/* still Page[] */),
   listPaginated: protectedProcedure.input(listPagesSchema).query(/* { items, nextCursor } */),
   ```
2. **Add, do not change.** Do not rename, remove, or retype a procedure, input field, or output
   field. Keep a replaced procedure as a `@deprecated` alias (`task.all` → `task.list`).
3. **New input fields are optional**, with a default in the handler.
4. **Do not tighten validation on existing inputs**: no new `.min()`/`.max()`/`.uuid()`/
   `.refine()`, no narrower enum, no `nullish()` → `optional()`.
5. **Keep output shapes stable**: no removed, renamed, retyped, wrapped, or newly nullable field.
6. **Put a schema migration in its own PR.** A migration inside #7726 blocked its revert.
7. **Remove a deprecated procedure only with evidence** that no live client calls it (the skill,
   step 4). Raising `MINIMUM_DESKTOP_VERSION` is a product decision.
