import { Trans, useLingui } from "@lingui/react/macro";
import { chatRecoveryCapabilities } from "@superset/shared/fork-chat-recovery";
import { Checkbox } from "@superset/ui/checkbox";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { ChevronDown, Repeat2 } from "lucide-react";
import { useId } from "react";

export function ForkQuotaRecoveryControls({
	workspaceId,
	terminalId,
	enabled,
	sessionLive,
	agent,
}: {
	workspaceId: string;
	terminalId: string;
	enabled: boolean;
	sessionLive?: boolean;
	agent?: string;
}) {
	const { t } = useLingui(),
		id = useId();
	const provider = agent ?? "claude";
	const local = chatRecoveryCapabilities(provider);
	const input = { workspaceId, terminalId, ...(agent ? { agent } : {}) };
	const query = workspaceTrpc.agents.quotaRecovery.useQuery(input, {
		enabled: enabled && (local.switchAccounts || local.resumeAtReset),
		retry: false,
		refetchInterval: (query) =>
			query.state.error ? false : enabled ? 5000 : false,
	});
	const save = workspaceTrpc.agents.setQuotaRecovery.useMutation({
		onSuccess: () => {
			void query.refetch();
		},
		onError: () =>
			toast.error(t({ message: "Couldn't save continuation options" })),
	});
	if (
		(local.switchAccounts || local.resumeAtReset) &&
		!query.data &&
		!query.error
	)
		return null;
	const state = query.data;
	const capabilities = state?.capabilities ?? {
		switchAccounts: provider === "claude" && state?.supported === true,
		resumeAtReset: provider === "claude" && state?.supported === true,
	};
	const canSwitch = local.switchAccounts && capabilities.switchAccounts;
	const canWait = local.resumeAtReset && capabilities.resumeAtReset;
	const active =
		(canSwitch && state?.switchAccounts) || (canWait && state?.resumeAtReset);
	return (
		<div>
			<details className="group rounded-md border">
				<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
					<Repeat2 className="size-3.5 text-muted-foreground" />
					<span>
						<Trans>Automatic continuation</Trans>
					</span>
					<span className="ml-auto text-xs text-muted-foreground">
						{active ? (
							<Trans>On</Trans>
						) : canSwitch || canWait ? (
							<Trans>Off</Trans>
						) : null}
					</span>
					<ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
				</summary>
				<fieldset
					className="space-y-3 px-3 pb-3"
					disabled={save.isPending}
					aria-label={t({ message: "Automatic continuation" })}
				>
					{(canSwitch || canWait) && (
						<p className="text-xs text-muted-foreground">
							{sessionLive === false ? (
								<Trans>Resume this chat to activate these options.</Trans>
							) : (
								<Trans>
									Applies immediately to this chat, even if its quota has
									already run out. No agent or account change is required.
								</Trans>
							)}
						</p>
					)}
					<div className="space-y-1">
						<label
							htmlFor={canSwitch ? `${id}-switch` : undefined}
							className={`flex items-center gap-2 text-sm ${canSwitch ? "cursor-pointer" : ""}`}
						>
							{canSwitch && (
								<Checkbox
									id={`${id}-switch`}
									checked={state?.switchAccounts ?? false}
									onCheckedChange={(checked) =>
										save.mutate({ ...input, switchAccounts: checked === true })
									}
								/>
							)}
							<Trans>Switch to the suggested account when quota runs out</Trans>
						</label>
						{!canSwitch && (
							<p className="text-xs text-muted-foreground">
								<Trans>
									Automatic account switching needs isolated profiles for this
									agent.
								</Trans>
							</p>
						)}
					</div>
					<div className="space-y-1 border-t pt-3">
						<label
							htmlFor={canWait ? `${id}-reset` : undefined}
							className={`flex items-center gap-2 text-sm ${canWait ? "cursor-pointer" : ""}`}
						>
							{canWait && (
								<Checkbox
									id={`${id}-reset`}
									checked={state?.resumeAtReset ?? false}
									onCheckedChange={(checked) =>
										save.mutate({ ...input, resumeAtReset: checked === true })
									}
								/>
							)}
							<Trans>Wait and continue when quota resets</Trans>
						</label>
						{!canWait && (
							<p className="text-xs text-muted-foreground">
								<Trans>
									Automatic continuation needs verified quota and reset data for
									this chat.
								</Trans>
							</p>
						)}
					</div>
					{(local.switchAccounts || local.resumeAtReset) &&
						!canSwitch &&
						!canWait && (
							<p className="text-xs text-muted-foreground">
								<Trans>
									Automatic continuation is not supported on this host.
								</Trans>
							</p>
						)}
					{(canSwitch || canWait) && (
						<p className="text-xs text-muted-foreground">
							<Trans>
								Keeps this conversation, model and permissions. Only
								subscription accounts with verified quota are used.
							</Trans>
						</p>
					)}
				</fieldset>
			</details>
			{(canWait || canSwitch) && state?.phase === "waiting" && (
				<output className="mt-2 block text-xs text-muted-foreground">
					<Trans>Waiting for quota. Stop cancels automatic continuation.</Trans>
				</output>
			)}
			{canSwitch && state?.phase === "switching" && (
				<output className="mt-2 block text-xs text-muted-foreground">
					<Trans>Continuing on {state.accountLabel}…</Trans>
				</output>
			)}
		</div>
	);
}
