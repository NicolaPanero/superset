import { Trans, useLingui } from "@lingui/react/macro";
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
}: {
	workspaceId: string;
	terminalId: string;
	enabled: boolean;
	sessionLive?: boolean;
}) {
	const { t } = useLingui(),
		id = useId();
	const input = { workspaceId, terminalId };
	const query = workspaceTrpc.agents.quotaRecovery.useQuery(input, {
		enabled,
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
	if (!query.data?.supported) return null;
	const state = query.data,
		active = state.switchAccounts || state.resumeAtReset;
	return (
		<div>
			<details className="group rounded-md border">
				<summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
					<Repeat2 className="size-3.5 text-muted-foreground" />
					<span>
						<Trans>Automatic continuation</Trans>
					</span>
					<span className="ml-auto text-xs text-muted-foreground">
						{active ? <Trans>On</Trans> : <Trans>Off</Trans>}
					</span>
					<ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
				</summary>
				<fieldset
					className="space-y-3 px-3 pb-3"
					disabled={save.isPending}
					aria-label={t({ message: "Automatic continuation" })}
				>
					<p className="text-xs text-muted-foreground">
						{sessionLive === false ? (
							<Trans>Resume this chat to activate these options.</Trans>
						) : (
							<Trans>
								Applies immediately to this chat, even if its quota has already
								run out. No agent or account change is required.
							</Trans>
						)}
					</p>
					<label
						htmlFor={`${id}-switch`}
						className="flex cursor-pointer items-center gap-2 text-sm"
					>
						<Checkbox
							id={`${id}-switch`}
							checked={state.switchAccounts}
							onCheckedChange={(checked) =>
								save.mutate({ ...input, switchAccounts: checked === true })
							}
						/>
						<Trans>Switch to the suggested account when quota runs out</Trans>
					</label>
					<label
						htmlFor={`${id}-reset`}
						className="flex cursor-pointer items-center gap-2 text-sm"
					>
						<Checkbox
							id={`${id}-reset`}
							checked={state.resumeAtReset}
							onCheckedChange={(checked) =>
								save.mutate({ ...input, resumeAtReset: checked === true })
							}
						/>
						<Trans>Wait and continue when quota resets</Trans>
					</label>
					<p className="text-xs text-muted-foreground">
						<Trans>
							Keeps this Claude conversation and model. Automatic account
							switching uses only subscription accounts with verified quota.
						</Trans>
					</p>
				</fieldset>
			</details>
			{state.phase === "waiting" && (
				<output className="mt-2 block text-xs text-muted-foreground">
					<Trans>Waiting for quota. Stop cancels automatic continuation.</Trans>
				</output>
			)}
			{state.phase === "switching" && (
				<output className="mt-2 block text-xs text-muted-foreground">
					<Trans>Continuing on {state.accountLabel}…</Trans>
				</output>
			)}
		</div>
	);
}
