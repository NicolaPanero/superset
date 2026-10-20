import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { formatDate } from "@superset/i18n/format";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuCheck, LuPlus, LuRefreshCw, LuSettings2 } from "react-icons/lu";
import { ForkAccountResets } from "renderer/components/ForkAccountResets";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { ForkUsageSummary } from "../../../ForkUsageSummary";
import { useForkAccountChoices } from "../../useForkAccountChoices";
import type { useForkCreationAccount } from "../../useForkCreationAccount";

export function ForkAccountMenuItems({
	account,
	provider,
	model,
	afterClose,
	extraItems,
	hidden,
	hostUrl,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
	afterClose: (action: () => void) => void;
	extraItems?: ReactNode;
	/** An account not to offer, such as the one a chat already uses. */
	hidden?: string | null;
	/** Host used for reset actions on the active account detail block. */
	hostUrl?: string | null;
}) {
	const navigate = useNavigate();
	const { choices, selected, suggested } = useForkAccountChoices(
		account,
		provider,
		model,
		hidden,
	);
	const canSignIn = provider === "claude" || provider === "codex";
	const newest = Math.max(
		0,
		...choices.map(({ usage }) => usage?.fetchedAt.getTime() ?? 0),
	);
	const date = newest
		? formatDate(new Date(newest), { hour: "numeric", minute: "2-digit" })
		: null;
	return (
		<>
			<DropdownMenuLabel>
				<Trans>Account</Trans>
			</DropdownMenuLabel>
			{account.options.isSuccess && choices.length === 0 && (
				<p className="px-2 py-2 text-xs text-muted-foreground">
					<Trans>Add an account to start chatting.</Trans>
				</p>
			)}
			{choices.map(({ option, usage }) => {
				const chosen = account.selection === option.selection;
				return (
					<div key={option.selection ?? "system"}>
						{option.selection === null && <DropdownMenuSeparator />}
						<DropdownMenuItem
							onSelect={() => account.choose(option.selection)}
							className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1 py-1.5"
						>
							<LuCheck
								className={cn(
									"mt-0.5 size-3.5",
									chosen ? "text-foreground" : "invisible",
								)}
							/>
							<div className="flex min-w-0 items-center gap-1.5">
								<span className="truncate font-medium">
									{forkAccountLabel(option, usage?.email)}
								</span>
								{usage?.isDefault && (
									<span className="shrink-0 rounded border px-1 text-[10px] text-muted-foreground">
										<Trans>Default</Trans>
									</span>
								)}
								{suggested?.option.selection === option.selection && (
									<span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
										<Trans>Suggested</Trans>
									</span>
								)}
							</div>
							<div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-2">
								{chosen ? (
									usage && (
										<div className="w-full space-y-2 py-1">
											<ForkUsageSummary account={usage} model={model} />
											{hostUrl && (
												<ForkAccountResets
													hostUrl={hostUrl}
													account={usage}
													hideEmail
												/>
											)}
										</div>
									)
								) : (
									<>
										<ForkUsageSummary account={usage} model={model} compact />
										{(usage?.status === "signed_out" ||
											usage?.status === "token_expired") && (
											<span className="text-xs text-warning">
												<Trans>Reconnect account</Trans>
											</span>
										)}
									</>
								)}
							</div>
						</DropdownMenuItem>
					</div>
				);
			})}
			<DropdownMenuSeparator />
			{extraItems && (
				<>
					{extraItems}
					<DropdownMenuSeparator />
				</>
			)}
			{selected?.usage &&
				(selected.usage.status === "signed_out" ||
					selected.usage.status === "token_expired" ||
					selected.usage.status === "token_stale") &&
				canSignIn && (
					<DropdownMenuItem
						onSelect={() =>
							afterClose(() =>
								account.setReconnect({
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
			{canSignIn && (
				<DropdownMenuItem
					onSelect={() => afterClose(() => account.setAdding(true))}
				>
					<LuPlus className="size-3.5 shrink-0 text-muted-foreground" />
					<Trans>Add account</Trans>
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
				<LuRefreshCw className="size-3.5 shrink-0 text-muted-foreground" />
				<Trans>Refresh</Trans>
				{date && (
					<span className="ml-auto text-[10px] text-muted-foreground">
						<Trans>Updated {date}</Trans>
					</span>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() =>
					void navigate({
						to: "/settings/local-agent-accounts",
						search: provider ? { agent: provider } : {},
					})
				}
			>
				<LuSettings2 className="size-3.5 shrink-0 text-muted-foreground" />
				<Trans>Manage accounts…</Trans>
			</DropdownMenuItem>
		</>
	);
}
