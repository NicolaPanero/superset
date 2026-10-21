import { Trans, useLingui } from "@lingui/react/macro";
import { accountQuotaRings } from "@superset/shared/fork-account-usage";
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
import { ForkAccountAvatar } from "../ForkAccountAvatar";
import { ForkAccountMenuItems } from "../ForkAccountMenuItems";

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
	const { selected } = useForkAccountChoices(account, provider, model);
	if (!account.enabled) return null;
	const label = account.forcedApi
		? t({ message: "API billing" })
		: selected
			? forkAccountLabel(selected.option, selected.usage?.email)
			: t({ message: "Choose an account" });
	const rings = accountQuotaRings(selected?.usage, model);
	const summary = (
		<>
			<ForkAccountAvatar label={selected ? label : null} {...rings} />
			<span className="shrink-0">
				<Trans>Account</Trans>
			</span>
			<span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
				{label}
			</span>
		</>
	);
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
					collisionPadding={8}
					className={cn(
						"w-96 max-w-[calc(100vw-32px)] max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] overflow-x-hidden overflow-y-auto",
						contentClassName,
					)}
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
