import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatPercent } from "@superset/i18n/format";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuChevronDown } from "react-icons/lu";
import { useForkMenuDialog } from "renderer/hooks/useForkMenuDialog";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { AddAccountDialog } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import {
	ForkAccountAvatar,
	QUOTA_TONE_TEXT,
	quotaTone,
} from "./components/ForkAccountAvatar";
import { ForkAccountMenuItems } from "./components/ForkAccountMenuItems";
import { useForkAccountChoices } from "./useForkAccountChoices";
import type { useForkCreationAccount } from "./useForkCreationAccount";

export function ForkAccountPicker({
	account,
	provider,
	model,
	compact = false,
	extraItems,
	hidden,
	hostUrl,
	disabled = false,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
	compact?: boolean;
	extraItems?: ReactNode;
	hidden?: string | null;
	hostUrl?: string | null;
	disabled?: boolean;
}) {
	const { t } = useLingui();
	const menuDialog = useForkMenuDialog();
	const { selected } = useForkAccountChoices(account, provider, model, hidden);
	if (!account.enabled) return null;
	const label = account.forcedApi
		? t({ message: "API billing" })
		: selected
			? forkAccountLabel(selected.option, selected.usage?.email)
			: t({ message: "Choose an account" });
	const quota = accountQuotaState(selected?.usage, model);
	return (
		<>
			<DropdownMenu
				modal={false}
				open={account.pickerOpen}
				onOpenChange={(open) => {
					account.setPickerOpen(open);
					if (open) void account.quota.refresh().catch(() => {});
				}}
			>
				{compact ? (
					<DropdownMenuTrigger
						data-fork-account-picker
						aria-label={label}
						title={label}
						disabled={disabled || !account.available || account.forcedApi}
						className="flex h-7 shrink-0 cursor-pointer items-center rounded-lg px-1 outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent data-[state=open]:bg-foreground/[0.07]"
					>
						<ForkAccountAvatar
							label={selected ? label : null}
							remaining={quota.remaining}
						/>
					</DropdownMenuTrigger>
				) : (
					<DropdownMenuTrigger
						data-fork-account-picker
						disabled={disabled || !account.available || account.forcedApi}
						className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50"
					>
						<ForkAccountAvatar
							label={selected ? label : null}
							remaining={quota.remaining}
						/>
						<span
							className={cn("truncate", !selected && "text-muted-foreground")}
						>
							{label}
						</span>
						<span className="ml-auto flex shrink-0 items-center gap-2">
							{selected && !account.forcedApi && quota.remaining !== null && (
								<span
									className={cn(
										"text-xs",
										QUOTA_TONE_TEXT[quotaTone(quota.remaining)],
									)}
								>
									{formatPercent(quota.remaining / 100, {
										maximumFractionDigits: 0,
									})}
								</span>
							)}
							<LuChevronDown className="size-4 text-muted-foreground" />
						</span>
					</DropdownMenuTrigger>
				)}
				<DropdownMenuContent
					className={cn(
						"w-96 max-w-[calc(100vw-32px)] max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] overflow-x-hidden overflow-y-auto",
						!compact && "min-w-(--radix-dropdown-menu-trigger-width)",
					)}
					align="start"
					collisionPadding={8}
					onCloseAutoFocus={menuDialog.onCloseAutoFocus}
				>
					<ForkAccountMenuItems
						account={account}
						provider={provider}
						model={model}
						afterClose={menuDialog.afterClose}
						extraItems={extraItems}
						hidden={hidden}
						hostUrl={hostUrl}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
			{(account.reconnect || account.adding) &&
				(provider === "claude" || provider === "codex") && (
					<AddAccountDialog
						open
						hostUrl={account.hostUrl}
						agent={account.reconnect?.agent ?? provider}
						switchTarget={account.reconnect}
						onOpenChange={(open) => {
							if (!open) {
								account.setReconnect(null);
								account.setAdding(false);
							}
						}}
						onAccountAdded={() => {
							void account.quota
								.refresh()
								.catch((error) => toast.error(errorMessage(error)));
							void account.options.refetch();
							void account.refreshDefault();
						}}
						onDefaultSwitched={() => {
							void account.refreshDefault();
							void account.quota
								.refresh()
								.catch((error) => toast.error(errorMessage(error)));
						}}
					/>
				)}
		</>
	);
}
