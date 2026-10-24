import { expect, test } from "bun:test";
import { ForkCursorModelCatalogAdapter } from "./forkCursorModelCatalogAdapter";
import { readForkModelCatalog } from "./forkModelCatalog";

test("Cursor reads models and per-model efforts without creating sessions or changing preferences", async () => {
	const methods: string[] = [];
	const adapter = new ForkCursorModelCatalogAdapter({
		command: "fake-cursor",
		authMethodId: "cursor_login",
		createTransport: (_options, handlers) => ({
			close: async () => {},
			send(line) {
				const frame = JSON.parse(line);
				methods.push(frame.method);
				const result =
					frame.method === "initialize"
						? { protocolVersion: 1 }
						: frame.method === "cursor/list_available_models"
							? {
									models: [
										{
											value: "gemini-4-argon",
											name: "Gemini 4 Argon",
											configOptions: [
												{
													id: "native-effort",
													name: "Effort",
													category: "thought_level",
													options: [{ value: "high", name: "High" }],
												},
											],
										},
									],
								}
							: {};
				queueMicrotask(() =>
					handlers.onLine(
						JSON.stringify({ jsonrpc: "2.0", id: frame.id, result }),
					),
				);
			},
		}),
	});
	const options = await readForkModelCatalog(adapter, { cwd: "/tmp" });
	expect(options[0]?.options).toEqual([
		{ id: "gemini-4-argon", label: "Gemini 4 Argon" },
	]);
	expect(adapter.modelConfigOptions["gemini-4-argon"]?.[0]?.options).toEqual([
		{ id: "high", label: "High" },
	]);
	expect(methods).toEqual([
		"initialize",
		"authenticate",
		"cursor/list_available_models",
	]);
});
