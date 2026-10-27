import { expect, test } from "bun:test";
import { queryFixture, renderHook } from "renderer/test-utils/fork-ui";
import { useForkModelCatalog } from "./useForkModelCatalog";

test("cached model options and native efforts stay scoped to the selected host and account", () => {
	const fixture = queryFixture();
	const key = [
		"fork-model-catalog",
		"http://host-a",
		"cursor",
		"account-a",
		undefined,
		undefined,
		null,
	];
	fixture.client.setQueryData(key, {
		configOptions: [
			{
				id: "model",
				label: "Model",
				category: "model",
				options: [{ id: "argon", label: "Argon" }],
			},
		],
		modelConfigOptions: {
			argon: [
				{
					id: "effort",
					label: "Effort",
					category: "thought_level",
					options: [{ id: "high", label: "High" }],
				},
			],
		},
	});
	const view = renderHook(
		({ hostUrl, accountSelection }) =>
			useForkModelCatalog({
				hostUrl,
				accountSelection,
				agent: "cursor",
				model: "argon",
				enabled: false,
			}),
		{
			wrapper: fixture.wrapper,
			initialProps: {
				hostUrl: "http://host-a",
				accountSelection: "account-a" as string | null | undefined,
			},
		},
	);
	expect(view.result.current.models.map((o) => o.id)).toEqual(["argon"]);
	expect(view.result.current.efforts.map((o) => o.id)).toEqual(["high"]);
	view.rerender({ hostUrl: "http://host-a", accountSelection: "account-b" });
	expect(view.result.current.models).toEqual([]);
	view.rerender({ hostUrl: "http://host-b", accountSelection: "account-a" });
	expect(view.result.current.models).toEqual([]);
	fixture.client.setQueryData(
		[...key.slice(0, 3), { defaultAccount: true }, ...key.slice(4)],
		fixture.client.getQueryData(key),
	);
	view.rerender({ hostUrl: "http://host-a", accountSelection: undefined });
	expect(view.result.current.models.map((o) => o.id)).toEqual(["argon"]);
	view.rerender({ hostUrl: "http://host-a", accountSelection: null });
	expect(view.result.current.models).toEqual([]);
});

test("picking a model keeps an effort on screen until its own efforts load", () => {
	const fixture = queryFixture();
	const key = [
		"fork-model-catalog",
		"http://host-a",
		"claude",
		{ defaultAccount: true },
		undefined,
		undefined,
	];
	const options = (model: string, effort: string) => [
		{
			id: "model",
			label: "Model",
			category: "model" as const,
			currentValue: model,
			options: [
				{ id: "opus", label: "Opus" },
				{ id: "sonnet", label: "Sonnet" },
			],
		},
		{
			id: "effort",
			label: "Effort",
			category: "thought_level" as const,
			currentValue: effort,
			options: [{ id: effort, label: effort }],
		},
	];
	fixture.client.setQueryData([...key, null], {
		configOptions: options("opus", "xhigh"),
	});
	const view = renderHook(
		() =>
			useForkModelCatalog({
				hostUrl: "http://host-a",
				agent: "claude",
				model: "sonnet",
				enabled: false,
			}),
		{ wrapper: fixture.wrapper },
	);
	expect(view.result.current.efforts.map((o) => o.id)).toEqual(["xhigh"]);
	expect(
		view.result.current.configOptions.find((o) => o.category === "model")
			?.currentValue,
	).toBe("sonnet");
	fixture.client.setQueryData([...key, "sonnet"], {
		configOptions: options("sonnet", "high"),
	});
	view.rerender({});
	expect(view.result.current.efforts.map((o) => o.id)).toEqual(["high"]);
});
