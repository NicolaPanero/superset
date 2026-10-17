import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useForkMenuDialog } from "renderer/hooks/useForkMenuDialog";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { AddAccountDialog } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import { ForkUsageSummary } from "../ForkUsageSummary";
import { ForkAccountAvatar } from "./components/ForkAccountAvatar";
import { ForkAccountMenuItems } from "./components/ForkAccountMenuItems";
import { useForkAccountChoices } from "./useForkAccountChoices";
import type { useForkCreationAccount } from "./useForkCreationAccount";

export function ForkAccountPicker({
	account,
	provider,
	model,
	compact = false,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
	compact?: boolean;
}) {
	const { t } = useLingui();
	const menuDialog = useForkMenuDialog();
	const { choices, selected } = useForkAccountChoices(account, provider, model);
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
						disabled={
							!account.available ||
							account.forcedApi ||
							(choices.length === 1 && !!selected)
						}
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
						disabled={!account.available || account.forcedApi}
						className="flex h-[22px] min-w-0 max-w-[380px] shrink-0 whitespace-nowrap items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
					>
						<span className="truncate">{label}</span>
						{!account.forcedApi && (
							<>
								<span>·</span>
								<ForkUsageSummary
									account={selected?.usage}
									model={model}
									compact
								/>
							</>
						)}
					</DropdownMenuTrigger>
				)}
				<DropdownMenuContent
					className="w-80 max-w-[calc(100vw-32px)] max-h-[60vh] overflow-auto"
					align="start"
					onCloseAutoFocus={menuDialog.onCloseAutoFocus}
				>
					<ForkAccountMenuItems
						account={account}
						provider={provider}
						model={model}
						afterClose={menuDialog.afterClose}
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
