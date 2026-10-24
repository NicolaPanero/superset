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
