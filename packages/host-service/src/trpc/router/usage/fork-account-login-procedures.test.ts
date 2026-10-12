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
