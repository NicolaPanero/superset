import { expect, test } from "bun:test";
import type { HostServiceContext } from "../../../types";
import { usageRouter } from "./usage";

test("automatic profile finalization requires host authentication", async () => {
	const caller = usageRouter.createCaller({
		isAuthenticated: false,
	} as HostServiceContext);
	await expect(
		caller.finishAccountLogin({
			agent: "claude",
			credentialKind: "subscription",
			loginId: "34c89ba6-f34e-41d4-b351-76f90b58a0d4",
		}),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test("the new procedure rejects paths in place of a login identifier before accessing a profile", async () => {
	const caller = usageRouter.createCaller({
		isAuthenticated: true,
	} as HostServiceContext);
	await expect(
		caller.finishAccountLogin({
			agent: "claude",
			credentialKind: "subscription",
			loginId: "../../.claude-work",
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test("reset discovery and redemption require host authentication", async () => {
	const caller = usageRouter.createCaller({
		isAuthenticated: false,
	} as HostServiceContext);
	await expect(
		caller.accountResets({ selection: "/unused" }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	await expect(
		caller.consumeAccountReset({
			selection: "/unused",
			expectedIdentity: "a".repeat(64),
			idempotencyKey: "5c55a376-5263-41c5-a86c-3994ee645b48",
		}),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});
test("a reset confirmation requires an isolated profile, identity and valid operation key", async () => {
	const caller = usageRouter.createCaller({
		isAuthenticated: true,
	} as HostServiceContext);
	await expect(
		caller.consumeAccountReset({
			selection: "",
			expectedIdentity: "a".repeat(64),
			idempotencyKey: "5c55a376-5263-41c5-a86c-3994ee645b48",
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	await expect(
		caller.consumeAccountReset({
			selection: "/unused",
			expectedIdentity: "short",
			idempotencyKey: "5c55a376-5263-41c5-a86c-3994ee645b48",
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
