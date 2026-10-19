import { Trans, useLingui } from "@lingui/react/macro";
import { chatRecoveryCapabilities } from "@superset/shared/fork-chat-recovery";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { type ReactNode, useId } from "react";

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
	type Mode = "stop" | "wait" | "switch" | "both";
	const mode: Mode =
		state?.switchAccounts && canSwitch
			? state?.resumeAtReset && canWait
				? "both"
				: "switch"
			: state?.resumeAtReset && canWait
				? "wait"
				: "stop";
	const choose = (next: Mode) =>
		save.mutate({
			...input,
			switchAccounts: next === "switch" || next === "both",
			resumeAtReset: next === "wait" || next === "both",
		});
	const choices: Array<{
		value: Mode;
		available: boolean;
		title: ReactNode;
		detail: ReactNode;
	}> = [
		{
			value: "stop",
			available: true,
			title: <Trans>Pause</Trans>,
			detail: <Trans>The chat pauses until you continue it.</Trans>,
		},
		{
			value: "wait",
			available: canWait,
			title: <Trans>Wait for the reset</Trans>,
			detail: <Trans>Continues on this account when quota returns.</Trans>,
		},
		{
			value: "switch",
			available: canSwitch,
			title: <Trans>Switch account</Trans>,
			detail: <Trans>Continues now on the account with the most quota.</Trans>,
		},
		{
			value: "both",
			available: canSwitch && canWait,
			title: <Trans>Switch, or wait</Trans>,
			detail: (
				<Trans>Waits for the reset when no other account has quota.</Trans>
			),
		},
	];
	const offered = canSwitch || canWait;
	return (
		<div className="space-y-2 text-xs">
			{offered && (
				<fieldset
					className="space-y-1"
					disabled={save.isPending}
					aria-label={t({ message: "Automatic continuation" })}
				>
					<legend className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						<Trans>When quota runs out</Trans>
					</legend>
					{choices
						.filter((choice) => choice.available)
						.map((choice) => {
							const selected = mode === choice.value;
							return (
								<label
									key={choice.value}
									className={cn(
										"flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 transition-colors",
										"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
										selected
											? "border-foreground/30 bg-accent/60"
											: "border-transparent hover:bg-accent/30",
									)}
								>
									<input
										type="radio"
										name={`${id}-mode`}
										className="sr-only"
										checked={selected}
										onChange={() => choose(choice.value)}
									/>
									<span
										aria-hidden="true"
										className={cn(
											"mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border",
											selected
												? "border-foreground"
												: "border-muted-foreground/50",
										)}
									>
										{selected && (
											<span className="size-1.5 rounded-full bg-foreground" />
										)}
									</span>
									<span className="min-w-0">
										<span className="block text-sm text-foreground">
											{choice.title}
										</span>
										<span className="block text-muted-foreground">
											{choice.detail}
										</span>
									</span>
								</label>
							);
						})}
				</fieldset>
			)}
			{offered && sessionLive === false && (
				<p className="px-1 text-muted-foreground">
					<Trans>Resume this chat to activate these options.</Trans>
				</p>
			)}
			{!canSwitch && (
				<p className="px-1 text-muted-foreground">
					<Trans>
						Automatic account switching needs isolated profiles for this agent.
					</Trans>
				</p>
			)}
			{!canWait && (
				<p className="px-1 text-muted-foreground">
					<Trans>
						Automatic continuation needs verified quota and reset data for this
						chat.
					</Trans>
				</p>
			)}
			{(local.switchAccounts || local.resumeAtReset) && !offered && (
				<p className="px-1 text-muted-foreground">
					<Trans>Automatic continuation is not supported on this host.</Trans>
				</p>
			)}
			{offered && state?.phase === "waiting" && (
				<output className="block px-1 text-foreground">
					<Trans>Waiting for quota. Stop cancels automatic continuation.</Trans>
				</output>
			)}
			{canSwitch && state?.phase === "switching" && (
				<output className="block px-1 text-foreground">
					<Trans>Continuing on {state.accountLabel}…</Trans>
				</output>
			)}
			{offered && (
				<p className="border-t px-1 pt-2 text-muted-foreground">
					<Trans>
						Keeps this conversation, model and permissions. Only subscription
						accounts with verified quota are used.
					</Trans>
				</p>
			)}
		</div>
	);
}
