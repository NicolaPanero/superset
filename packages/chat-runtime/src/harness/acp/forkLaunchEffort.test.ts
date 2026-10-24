import { expect, test } from "bun:test";
import type { SessionConfigOption } from "@superset/chat/protocol";
import { ForkLaunchEffort } from "./forkLaunchEffort";

test("launch effort waits for the model's options and requires agent confirmation", async () => {
	let options: SessionConfigOption[] = [];
	let finish!: () => void;
	const model = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const effort = new ForkLaunchEffort();
	let changes = 0;
	const applied = effort.apply(
		"high",
		model,
		() => options,
		async (id, value) => {
			changes++;
			options = options.map((o) =>
				o.id === id ? { ...o, currentValue: value } : o,
			);
		},
	);
	expect(changes).toBe(0);
	options = [
		{
			id: "native_effort",
			label: "Effort",
			category: "thought_level",
			currentValue: "low",
			options: [{ id: "high", label: "High" }],
		},
	];
	finish();
	await applied;
	expect(changes).toBe(1);
	expect(() => effort.assertConfirmed()).not.toThrow();
	const rejected = new ForkLaunchEffort();
	await rejected.apply(
		"max",
		Promise.resolve(),
		() => options,
		() => undefined,
	);
	expect(() => rejected.assertConfirmed()).toThrow("not available");
});
