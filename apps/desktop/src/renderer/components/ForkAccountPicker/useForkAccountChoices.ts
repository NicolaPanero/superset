import { accountQuotaState } from "@superset/shared/fork-account-usage";
import { visibleForkAccountOptions } from "renderer/lib/fork-account-visibility";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import type { useForkCreationAccount } from "./useForkCreationAccount";

export function useForkAccountChoices(
	account: ReturnType<typeof useForkCreationAccount>,
	provider: string | null,
	model?: string,
) {
	const showCliOptions = useForkCliOptions();
	const choices = visibleForkAccountOptions(
		account.options.data ?? [],
		showCliOptions,
	)
		.toSorted(
			(a, b) => Number(a.selection === null) - Number(b.selection === null),
		)
		.map((option) => ({
			option,
			usage: account.quota.data?.find(
				(row) => row.agent === provider && row.selection === option.selection,
			),
		}));
	const selected = choices.find(
		(choice) => choice.option.selection === account.selection,
	);
	const suggested = choices
		.filter(
			(choice) =>
				choice.option.selection !== null &&
				accountQuotaState(choice.usage, model).reason === "ready",
		)
		.sort(
			(a, b) =>
				(accountQuotaState(b.usage, model).remaining ?? 0) -
				(accountQuotaState(a.usage, model).remaining ?? 0),
		)[0];
	return { choices, selected, suggested };
}
