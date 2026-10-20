import type { SessionConfigOption } from "@superset/chat/protocol";
import { AcpTimeoutError } from "./rpcClient";
import { acpConfigOptionUpdateSchema } from "./wire";

const REOPEN =
	"Cursor model selection timed out. Reopen this chat before sending another message.";
const EFFORT_IDS = new Set([
	"effort",
	"reasoning",
	"reasoning_effort",
	"thought_level",
]);

function startSelection(
	option: SessionConfigOption,
	requested: string | undefined,
): { model: string; parameters: Array<{ id: string; value: string }> } {
	const value = requested ?? option.currentValue;
	if (!value) throw new Error("Cursor did not offer a selected model.");
	if (option.options.some((model) => model.id === value))
		return { model: value, parameters: [] };
	const bracket = /^([^[\]]+)\[([^[\]]*)\]$/.exec(value);
	const base = bracket?.[1];
	const settings = bracket?.[2];
	if (
		base &&
		settings !== undefined &&
		option.options.some((model) => model.id === base)
	) {
		const parameters = settings
			? settings.split(",").map((entry) => {
					const pair = /^([^=,\s]+)=([^=,\s]+)$/.exec(entry);
					const id = pair?.[1],
						value = pair?.[2];
					if (!id || !value)
						throw new Error(`Invalid Cursor model parameter: ${entry}`);
					return { id, value };
				})
			: [];
		return { model: base, parameters };
	}
	for (const model of option.options) {
		if (!value.startsWith(`${model.id}-`)) continue;
		const suffix = value.slice(model.id.length + 1);
		const effort =
			/^(thinking-)?(none|minimal|low|medium|high|xhigh|max)$/.exec(suffix);
		const level = effort?.[2];
		if (level)
			return {
				model: model.id,
				parameters: [
					...(effort?.[1] ? [{ id: "thinking", value: "true" }] : []),
					{ id: "thought_level", value: level },
				],
			};
	}
	if (
		value === "auto" &&
		option.options.some((model) => model.id === "auto-smart")
	)
		return { model: "auto-smart", parameters: [] };
	throw new Error(
		`Cursor model "${value}" is unavailable. Select an available model before sending a message.`,
	);
}

export class ForkCursorModelSelection {
	private tail: Promise<unknown> = Promise.resolve();
	private pending = 0;
	private modelRevision = 0;
	private readonly revisions = new Map<string, number>();
	private modelConfirmed = false;
	private readonly failures = new Map<string, Error>();
	private uncertain = false;

	get confirmed(): boolean {
		return (
			this.modelConfirmed &&
			this.pending === 0 &&
			this.failures.size === 0 &&
			!this.uncertain
		);
	}

	start(
		options: SessionConfigOption[],
		requested: string | undefined,
		change: (id: string, value: string) => Promise<SessionConfigOption[]>,
	): Promise<void> {
		const option = options.find((option) => option.category === "model");
		if (!option) throw new Error("Cursor did not offer a model selector.");
		const selection = startSelection(option, requested);
		const modelRevision = this.modelRevision + 1;
		const revisions = new Map(this.revisions);
		const apply = async () => {
			let current = await change(option.id, selection.model);
			if (this.modelRevision !== modelRevision) return;
			this.assertAccepted();
			for (const parameter of selection.parameters) {
				if (this.modelRevision !== modelRevision) return;
				const target =
					current.find((entry) => entry.id === parameter.id) ??
					(EFFORT_IDS.has(parameter.id)
						? current.find((entry) => entry.category === "thought_level")
						: undefined);
				if (
					!target ||
					!target.options.some((entry) => entry.id === parameter.value)
				)
					throw new Error(
						`Cursor does not offer ${parameter.id}=${parameter.value} for model "${selection.model}".`,
					);
				if (
					(this.revisions.get(target.id) ?? 0) !==
					(revisions.get(target.id) ?? 0)
				)
					continue;
				current = await change(target.id, parameter.value);
				this.assertAccepted();
			}
		};
		return apply().catch((error: Error) => {
			this.failures.set("startup", error);
			throw error;
		});
	}

	select(
		configId: string,
		value: string,
		request: () => Promise<unknown>,
		model = true,
	): Promise<unknown> {
		if (model) this.modelRevision += 1;
		this.revisions.set(configId, (this.revisions.get(configId) ?? 0) + 1);
		this.pending += 1;
		const result = this.tail.then(async () => {
			if (this.uncertain) throw new Error(REOPEN);
			const response = await request();
			const options = acpConfigOptionUpdateSchema.safeParse(response);
			const selected = options.success
				? options.data.configOptions.find(
						(option) => (option.configId ?? option.id) === configId,
					)?.currentValue
				: undefined;
			if (selected !== value)
				throw new Error(
					`Cursor did not confirm ${configId}="${value}". Select the model settings again before sending a message.`,
				);
			return response;
		});
		this.tail = result
			.then(
				() => {
					if (model) {
						this.modelConfirmed = true;
						this.failures.clear();
					} else this.failures.delete(configId);
				},
				(error: unknown) => {
					if (error instanceof AcpTimeoutError) this.uncertain = true;
					this.failures.set(
						configId,
						new Error(
							this.uncertain
								? REOPEN
								: `Cursor model selection failed: ${error instanceof Error ? error.message : String(error)}`,
						),
					);
				},
			)
			.then(() => {
				this.pending -= 1;
			});
		return result;
	}

	assertConfirmed(): void {
		this.assertAccepted();
		if (this.pending > 0)
			throw new Error("Cursor model settings are not confirmed.");
	}

	private assertAccepted(): void {
		if (this.uncertain) throw new Error(REOPEN);
		if (this.failures.size) throw [...this.failures.values()].at(-1);
		if (!this.modelConfirmed)
			throw new Error("Cursor model settings are not confirmed.");
	}
}
