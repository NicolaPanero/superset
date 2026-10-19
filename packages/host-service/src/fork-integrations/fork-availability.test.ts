import { expect, test } from "bun:test";
import type { ForkConnection } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import { ForkAvailability } from "./fork-availability";

const connection = {
	id: "bitbucket",
	provider: "bitbucket",
	enabled: true,
} as ForkConnection;
const offline = () => {
	throw new TRPCError({ code: "BAD_GATEWAY", message: "Network unavailable" });
};

test("provider outages back off and recover with one shared read-only probe", async () => {
	let now = 1000;
	let probes = 0;
	const availability = new ForkAvailability(() => now);
	await expect(
		availability.run(connection, async () => offline()),
	).rejects.toThrow();
	const probe = async () => {
		probes++;
	};
	expect(await availability.check([connection], probe)).toEqual([
		{
			connectionId: connection.id,
			provider: "bitbucket",
			since: now,
			retryAt: 31_000,
		},
	]);
	expect(probes).toBe(0);
	now = 31_000;
	const recovered = await Promise.all([
		availability.check([connection], probe),
		availability.check([connection], probe),
	]);
	expect(probes).toBe(1);
	expect(recovered).toEqual([[], []]);
});

test("credential rejection is distinct from an outage and disabled accounts stop retrying", async () => {
	const availability = new ForkAvailability(() => 1000);
	await expect(
		availability.run(connection, async () => offline()),
	).rejects.toThrow();
	await expect(
		availability.run(connection, async () => {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}),
	).rejects.toThrow();
	expect(await availability.check([connection], async () => {})).toEqual([]);
	await expect(
		availability.run(connection, async () => offline()),
	).rejects.toThrow();
	expect(
		await availability.check([{ ...connection, enabled: false }], async () => {
			throw new Error("Disabled connections must not be probed");
		}),
	).toEqual([]);
});
