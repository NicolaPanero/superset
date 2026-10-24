import { expect, mock, test } from "bun:test";
import type { useForkModelCatalog } from "renderer/hooks/useForkModelCatalog";
import { fireEvent, flush, render } from "renderer/test-utils/fork-ui";
import { ForkCreationModelPicker } from "./ForkCreationModelPicker";

test("creation offers and launches the agent's discovered models instead of the static registry", async () => {
	const onModelChange = mock();
	const catalog: ReturnType<typeof useForkModelCatalog> = {
		models: [{ id: "gemini-4-argon", label: "Gemini 4 Argon" }],
		efforts: [],
		configOptions: [],
		isFetching: false,
		isError: false,
		isSuccess: true,
		refetch: async () => {
			throw new Error("Unexpected refresh");
		},
	};
	const view = render(
		<ForkCreationModelPicker
			agents={[{ id: "cursor", label: "Cursor", presetId: "cursor-agent" }]}
			selectedAgent="cursor"
			onSelectAgent={() => {}}
			selectedModel={null}
			onModelChange={onModelChange}
			efforts={[]}
			selectedEffort={null}
			onEffortChange={() => {}}
			catalog={catalog}
		/>,
	);
	fireEvent.keyDown(view.getByRole("button", { name: /Default model/ }), {
		key: "ArrowDown",
		code: "ArrowDown",
	});
	await flush();
	expect(view.queryByRole("menuitem", { name: /Composer/ })).toBeNull();
	fireEvent.click(view.getByRole("menuitem", { name: /Gemini 4 Argon/ }));
	await flush();
	expect(onModelChange).toHaveBeenCalledWith("gemini-4-argon");
});
