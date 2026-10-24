import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	type AcpAdapterOptions,
	AcpRpcClient,
	EventQueue,
	type HarnessAdapter,
	type HarnessStartOptions,
	spawnAcpTransport,
} from "@superset/chat-runtime";
import { z } from "zod";

const option = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string().optional(),
	currentValue: z.string().optional(),
	options: z.array(z.object({ value: z.string(), name: z.string() })),
});
const catalog = z.object({
	models: z.array(
		z.object({
			value: z.string(),
			name: z.string(),
			configOptions: z.array(option),
		}),
	),
});

export class ForkCursorModelCatalogAdapter implements HarnessAdapter {
	private queue = new EventQueue();
	private client?: AcpRpcClient;
	private disposed = false;
	modelConfigOptions: Record<string, SessionConfigOption[]> = {};
	constructor(private options: AcpAdapterOptions) {}
	start(start: HarnessStartOptions) {
		void this.load(start);
		return this.queue.iterable();
	}
	private async load(start: HarnessStartOptions) {
		try {
			const launch = await this.options.launch?.();
			if (this.disposed) return;
			const client = new AcpRpcClient({
				createTransport: (handlers) =>
					(this.options.createTransport ?? spawnAcpTransport)(
						{ ...this.options, ...launch, cwd: start.cwd },
						handlers,
					),
				onNotification: () => {},
				onServerRequest: () => {},
				onExit: () => {
					if (!this.disposed)
						this.queue.push({ kind: "session", session: { status: "dead" } });
				},
			});
			this.client = client;
			await client.request(
				"initialize",
				{
					protocolVersion: 1,
					clientCapabilities: { _meta: { parameterizedModelPicker: true } },
				},
				15_000,
			);
			if (this.options.authMethodId)
				await client.request(
					"authenticate",
					{ methodId: this.options.authMethodId },
					15_000,
				);
			const result = catalog.parse(
				await client.request("cursor/list_available_models", {}, 15_000),
			);
			this.modelConfigOptions = Object.fromEntries(
				result.models.map((model) => [
					model.value,
					model.configOptions.map((o) => ({
						id: o.id,
						label: o.name,
						category: o.category,
						currentValue: o.currentValue,
						options: o.options.map((v) => ({ id: v.value, label: v.name })),
					})),
				]),
			);
			const configOptions: SessionConfigOption[] = [
				{
					id: "model",
					label: "Model",
					category: "model",
					options: result.models.map((model) => ({
						id: model.value,
						label: model.name,
					})),
				},
			];
			this.queue.push({
				kind: "session",
				session: { status: "idle", configOptions },
			});
		} catch (error) {
			this.queue.push({
				kind: "item",
				turnId: "catalog",
				item: {
					id: "catalog-error",
					kind: "notice",
					noticeKind: "error",
					startedAtMs: Date.now(),
					text: error instanceof Error ? error.message : String(error),
				},
			});
			this.queue.push({ kind: "session", session: { status: "dead" } });
		}
	}
	prompt(): void {
		throw new Error("Model discovery cannot send prompts");
	}
	cancelTurn(): void {}
	setMode(): void {}
	respondToApproval(): void {
		throw new Error("Model discovery cannot approve tools");
	}
	async dispose() {
		this.disposed = true;
		await this.client?.close();
		this.queue.close();
	}
}
