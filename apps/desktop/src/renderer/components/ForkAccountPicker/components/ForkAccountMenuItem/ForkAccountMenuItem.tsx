import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { LuChevronRight } from "react-icons/lu";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { useForkAccountChoices } from "../../useForkAccountChoices";
import type { useForkCreationAccount } from "../../useForkCreationAccount";
import { ForkAccountAvatar } from "../ForkAccountAvatar";

export function ForkAccountMenuItem({
	account,
	provider,
	model,
	className,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
	className?: string;
}) {
	const { t } = useLingui();
	const { selected } = useForkAccountChoices(account, provider, model);
	if (!account.enabled) return null;
	const label = account.forcedApi
		? t({ message: "API billing" })
		: selected
			? forkAccountLabel(selected.option, selected.usage?.email)
			: t({ message: "Choose an account" });
	const quota = accountQuotaState(selected?.usage, model);
	return (
		<DropdownMenuItem
			className={className}
			disabled={!account.available || account.forcedApi}
			onSelect={() => requestAnimationFrame(() => account.setPickerOpen(true))}
		>
			<ForkAccountAvatar
				label={selected ? label : null}
				remaining={quota.remaining}
				warning={quota.warning}
			/>
			<span className="shrink-0">
				<Trans>Account</Trans>
			</span>
			<span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
				{label}
			</span>
			{quota.remaining !== null && (
				<span
					className={cn(
						"shrink-0 text-[12px]",
						quota.warning ? "text-warning" : "text-success",
					)}
				>
					{formatPercent(quota.remaining / 100, { maximumFractionDigits: 0 })}
				</span>
			)}
			<LuChevronRight className="size-3 shrink-0 text-muted-foreground/70" />
		</DropdownMenuItem>
	);
}
