import { Trans, useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import {
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { useForkAccountChoices } from "../../useForkAccountChoices";
import type { useForkCreationAccount } from "../../useForkCreationAccount";
import { ForkAccountAvatar, quotaTone } from "../ForkAccountAvatar";
import { ForkAccountMenuItems } from "../ForkAccountMenuItems";

const TONE_TEXT = {
	ok: "text-success",
	warning: "text-warning",
	danger: "text-destructive",
} as const;

export function ForkAccountSubmenu({
	account,
	provider,
	model,
	className,
	contentClassName,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
	className?: string;
	contentClassName?: string;
}) {
	const { t } = useLingui();
	const { choices, selected } = useForkAccountChoices(account, provider, model);
	if (!account.enabled) return null;
	const label = account.forcedApi
		? t({ message: "API billing" })
		: selected
			? forkAccountLabel(selected.option, selected.usage?.email)
			: t({ message: "Choose an account" });
	const quota = accountQuotaState(selected?.usage, model);
	const summary = (
		<>
			<ForkAccountAvatar
				label={selected ? label : null}
				remaining={quota.remaining}
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
						TONE_TEXT[quotaTone(quota.remaining)],
					)}
				>
					{formatPercent(quota.remaining / 100, { maximumFractionDigits: 0 })}
				</span>
			)}
		</>
	);
	if (choices.length === 1 && selected) {
		return (
			<div className={cn("flex cursor-default items-center", className)}>
				{summary}
			</div>
		);
	}
	return (
		<DropdownMenuSub
			onOpenChange={(open) => {
				if (open) void account.quota.refresh().catch(() => {});
			}}
		>
			<DropdownMenuSubTrigger
				className={className}
				disabled={!account.available || account.forcedApi}
			>
				{summary}
			</DropdownMenuSubTrigger>
			{/* Portaled: the parent panel's backdrop-blur would otherwise clip it. */}
			<DropdownMenuPortal>
				<DropdownMenuSubContent
					className={cn("w-96 max-h-[60vh] overflow-auto", contentClassName)}
				>
					<ForkAccountMenuItems
						account={account}
						provider={provider}
						model={model}
						afterClose={(action) => requestAnimationFrame(action)}
					/>
				</DropdownMenuSubContent>
			</DropdownMenuPortal>
		</DropdownMenuSub>
	);
}
