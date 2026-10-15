import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { LuSettings2 } from "react-icons/lu";
import { forkAccountLabel } from "renderer/lib/fork-account-label";
import { ForkUsageSummary } from "../../../ForkUsageSummary";
import { useForkAccountChoices } from "../../useForkAccountChoices";
import type { useForkCreationAccount } from "../../useForkCreationAccount";

export function ForkAccountMenuItems({
	account,
	provider,
	model,
	afterClose,
}: {
	account: ReturnType<typeof useForkCreationAccount>;
	provider: string | null;
	model?: string;
	afterClose: (action: () => void) => void;
}) {
	const navigate = useNavigate();
	const { choices, selected, suggested } = useForkAccountChoices(
		account,
		provider,
		model,
	);
	const canSignIn = provider === "claude" || provider === "codex";
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
			{choices.map(({ option, usage }) => (
				<div key={option.selection ?? "system"}>
					{option.selection === null && <DropdownMenuSeparator />}
					<DropdownMenuItem
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
				<Trans>Refresh</Trans>
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
