import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { accountQuotaState } from "@superset/shared/fork-account-usage";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { useForkMenuDialog } from "renderer/hooks/useForkMenuDialog";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import {
	AddAccountDialog,
	type SwitchSignInTarget,
} from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import { ForkUsageSummary } from "../ForkUsageSummary";
import { ForkAccountAvatar } from "./components/ForkAccountAvatar";
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
	const [adding, setAdding] = useState(false);
	const [reconnect, setReconnect] = useState<SwitchSignInTarget | null>(null);
	const { choices, selected, suggested } = useForkAccountChoices(
		account,
		provider,
		model,
	);
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
						disabled={!account.available || account.forcedApi}
						className="flex h-7 shrink-0 cursor-pointer items-center rounded-lg px-1 outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-foreground/[0.07]"
					>
						<ForkAccountAvatar
							label={selected ? label : null}
							remaining={quota.remaining}
							warning={quota.warning}
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
					className="w-96 max-w-[calc(100vw-32px)] max-h-[60vh] overflow-auto"
					align="start"
					onCloseAutoFocus={menuDialog.onCloseAutoFocus}
				>
					<DropdownMenuLabel>
						<Trans>Account</Trans>
					</DropdownMenuLabel>
					{account.options.isSuccess && choices.length === 0 && (
						<p className="px-2 py-2 text-xs text-muted-foreground">
							<Trans>Add an account to start chatting.</Trans>
						</p>
					)}
					{choices.map(({ option, usage }) => (
						<div key={option.selection ?? "system"}>
							{option.selection === null && <DropdownMenuSeparator />}
							<DropdownMenuItem
								key={option.selection ?? "system"}
								onSelect={() => account.choose(option.selection)}
								className="block cursor-pointer py-2"
							>
								<div className="flex items-center justify-between gap-3">
									<span className="truncate font-medium">
										{forkAccountLabel(option, usage?.email)}
									</span>
									<span className="shrink-0 text-[10px] text-muted-foreground">
										{usage?.isDefault && <Trans>Default</Trans>}
										{suggested?.option.selection === option.selection && (
											<>
												{" "}
												· <Trans>Suggested</Trans>
											</>
										)}
										{account.selection === option.selection && " ✓"}
									</span>
								</div>
								<div className="mt-1.5">
									<ForkUsageSummary account={usage} model={model} />
								</div>
								{(usage?.status === "signed_out" ||
									usage?.status === "token_expired") && (
									<div className="mt-1 text-warning">
										<Trans>Reconnect account</Trans>
									</div>
								)}
							</DropdownMenuItem>
						</div>
					))}
					<DropdownMenuSeparator />
					{selected?.usage &&
						(selected.usage.status === "signed_out" ||
							selected.usage.status === "token_expired" ||
							selected.usage.status === "token_stale") &&
						(provider === "claude" || provider === "codex") && (
							<DropdownMenuItem
								onSelect={() =>
									menuDialog.afterClose(() =>
										setReconnect({
											agent: provider,
											credentialKind:
												selected.usage?.credentialKind === "api_key"
													? "api_key"
													: "subscription",
											selection: selected.option.selection,
											label:
												selected.option.alias ??
												selected.usage?.email ??
												selected.option.label,
										}),
									)
								}
							>
								<Trans>Reconnect account</Trans>
							</DropdownMenuItem>
						)}
					<DropdownMenuItem
						onSelect={() => menuDialog.afterClose(() => setAdding(true))}
					>
						<Trans>Add account</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault();
							void account.quota
								.refresh()
								.catch((error) => toast.error(errorMessage(error)));
						}}
					>
						<Trans>Refresh</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{(reconnect || adding) &&
				(provider === "claude" || provider === "codex") && (
					<AddAccountDialog
						open
						hostUrl={account.hostUrl}
						agent={reconnect?.agent ?? provider}
						switchTarget={reconnect}
						onOpenChange={(open) => {
							if (!open) {
								setReconnect(null);
								setAdding(false);
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
