import type { SessionConfigOption } from "@superset/chat/protocol";

export class ForkLaunchEffort {
	private error?: Error;
	async apply(
		effort: string | undefined,
		previous: Promise<unknown>,
		options: () => SessionConfigOption[],
		change: (id: string, value: string) => Promise<void> | undefined,
	): Promise<void> {
		if (!effort) return;
		try {
			await previous;
			const option = options().find((o) => o.category === "thought_level");
			if (!option?.options.some((o) => o.id === effort))
				throw new Error("The selected effort is not available for this model.");
			if (option.currentValue !== effort) await change(option.id, effort);
			if (options().find((o) => o.id === option.id)?.currentValue !== effort)
				throw new Error("The agent did not confirm the selected effort.");
		} catch (error) {
			this.error = error instanceof Error ? error : new Error(String(error));
		}
	}
	assertConfirmed(): void {
		if (this.error) throw this.error;
	}
}
