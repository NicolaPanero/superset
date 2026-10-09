import { Trans } from "@lingui/react/macro";
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
import {
	AddAccountDialog,
	type SwitchSignInTarget,
} from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";
import { ForkUsageSummary } from "../ForkUsageSummary";
import type { useForkCreationAccount } from "./useForkCreationAccount";

export function ForkAccountPicker({
	account,
	provider,
	model,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
}) {
	const [reconnect, setReconnect] = useState<SwitchSignInTarget | null>(null);
	if (!account.enabled) return null;
	const choices = (account.options.data ?? []).map((option) => ({
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
			(choice) => accountQuotaState(choice.usage, model).reason === "ready",
		)
		.sort(
			(a, b) =>
				(accountQuotaState(b.usage, model).remaining ?? 0) -
				(accountQuotaState(a.usage, model).remaining ?? 0),
		)[0];
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
				<DropdownMenuTrigger
					data-fork-account-picker
					disabled={!account.available || account.forcedApi}
					className="flex h-[22px] min-w-0 max-w-[240px] shrink-0 whitespace-nowrap items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs"
				>
					<span className="truncate">
						{account.forcedApi ? (
							<Trans>API billing</Trans>
						) : (
							(selected?.option.alias ??
							selected?.usage?.email ?? <Trans>Account</Trans>)
						)}
					</span>
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
				<DropdownMenuContent
					className="w-96 max-w-[calc(100vw-32px)] max-h-[60vh] overflow-auto"
					align="start"
				>
					<DropdownMenuLabel>
						<Trans>Account</Trans>
					</DropdownMenuLabel>
					{choices.map(({ option, usage }) => (
						<DropdownMenuItem
							key={option.selection ?? "system"}
							onSelect={() => account.choose(option.selection)}
							className="block cursor-pointer py-2"
						>
							<div className="flex items-center justify-between gap-3">
								<span className="truncate font-medium">
									{option.alias ?? usage?.email ?? option.label}
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
							<ForkUsageSummary account={usage} model={model} />
							{(usage?.status === "signed_out" ||
								usage?.status === "token_expired") && (
								<div className="mt-1 text-amber-500">
									<Trans>Reconnect account</Trans>
								</div>
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					{selected?.usage &&
						(selected.usage.status === "signed_out" ||
							selected.usage.status === "token_expired" ||
							selected.usage.status === "token_stale") &&
						(provider === "claude" || provider === "codex") && (
							<DropdownMenuItem
								onSelect={() =>
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
									})
								}
							>
								<Trans>Reconnect account</Trans>
							</DropdownMenuItem>
						)}
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
			{reconnect && (
				<AddAccountDialog
					open
					hostUrl={account.hostUrl}
					agent={reconnect.agent}
					switchTarget={reconnect}
					onOpenChange={(open) => {
						if (!open) setReconnect(null);
					}}
					onAccountAdded={() => {
						void account.quota
							.refresh()
							.catch((error) => toast.error(errorMessage(error)));
						void account.options.refetch();
					}}
					onDefaultSwitched={() => {
						void account.quota
							.refresh()
							.catch((error) => toast.error(errorMessage(error)));
					}}
				/>
			)}
		</>
	);
}
