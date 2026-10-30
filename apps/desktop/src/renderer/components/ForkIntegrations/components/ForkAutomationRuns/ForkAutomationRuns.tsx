import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkRelativeTime } from "../ForkRelativeTime";

export const FORK_AUTOMATION_STATE_LABELS: Record<string, MessageDescriptor> = {
	queued: msg({ message: "Queued" }),
	launching: msg({ message: "Starting" }),
	running: msg({ message: "Running" }),
	waiting_input: msg({ message: "Waits for you" }),
	agent_done: msg({ message: "Agent finished" }),
	verifying: msg({ message: "Checking" }),
	verified: msg({ message: "Verified" }),
	failed: msg({ message: "Failed" }),
	cancelled: msg({ message: "Cancelled" }),
	skipped: msg({ message: "Skipped" }),
	retried: msg({ message: "Retried" }),
	unknown: msg({ message: "To check" }),
};

const STATE_TONE: Record<string, string> = {
	waiting_input: "bg-warning/15 text-warning",
	failed: "bg-destructive/15 text-destructive",
	unknown: "bg-destructive/15 text-destructive",
	verified: "bg-success/15 text-success",
	agent_done: "bg-primary/10 text-primary",
};

const RETRYABLE = ["failed", "unknown", "cancelled", "skipped", "agent_done"];

export function ForkAutomationRuns({
	ruleId,
	states,
	limit,
	emptyText,
	wrapTitles = false,
}: {
	ruleId?: string;
	states?: string[];
	limit?: number;
	emptyText?: ReactNode;
	wrapTitles?: boolean;
}) {
	const { i18n } = useLingui();
	const { client, hostUrl, data } = useForkConnections();
	const navigate = useNavigate();
	const cache = useQueryClient();
	const supported = (data?.version ?? 0) >= 9;
	const key = ["fork-integrations", hostUrl, "automation-attempts", ruleId];
	const attempts = useQuery({
		queryKey: key,
		queryFn: () =>
			required(client).forkTasks.automationAttempts.query({ id: ruleId }),
		enabled: !!client && supported,
		refetchInterval: 10_000,
		retry: false,
		networkMode: "always",
	});
	const action = useMutation({
		mutationFn: (input: {
			attemptId: string;
			action: "retry" | "cancel" | "verified" | "release";
		}) => required(client).forkTasks.automationAttemptAction.mutate(input),
		onSuccess: () =>
			cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "automation-attempts"],
			}),
	});
	if (!supported) return null;
	const rows = (attempts.data ?? [])
		.filter((attempt) => (states ? states.includes(attempt.state) : true))
		.slice(0, limit);
	return (
		<div className="space-y-2">
			{(attempts.error || action.error) && (
				<p role="alert" className="text-xs text-destructive">
					{(attempts.error ?? action.error)?.message}
				</p>
			)}
			{rows.length === 0 && attempts.isSuccess && emptyText && (
				<p className="text-xs text-muted-foreground">{emptyText}</p>
			)}
			{rows.map((attempt) => (
				<div
					key={attempt.id}
					className="space-y-1 rounded-lg border border-border/60 px-3 py-2"
				>
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span
							className={cn(
								"rounded px-1.5 py-0.5 text-[11px] font-medium",
								STATE_TONE[attempt.state] ?? "bg-muted text-muted-foreground",
							)}
						>
							{i18n._(
								FORK_AUTOMATION_STATE_LABELS[attempt.state] ??
									msg({ message: "Unknown" }),
							)}
						</span>
						<span
							className={cn(
								"min-w-0 flex-1 font-medium",
								wrapTitles
									? "basis-full break-words [overflow-wrap:anywhere]"
									: "truncate",
							)}
						>
							{attempt.title}
						</span>
						{!ruleId && (
							<span className="truncate text-xs text-muted-foreground">
								{attempt.ruleName}
							</span>
						)}
						<span className="text-xs text-muted-foreground">
							<ForkRelativeTime
								value={new Date(attempt.updatedAt).toISOString()}
							/>
						</span>
					</div>
					{attempt.error && (
						<p className="text-xs text-destructive">{attempt.error}</p>
					)}
					{attempt.verifyOutput && (
						<details className="text-xs">
							<summary className="cursor-pointer text-muted-foreground">
								<Trans>Check output</Trans>
							</summary>
							<pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[11px]">
								{attempt.verifyOutput}
							</pre>
						</details>
					)}
					<div className="flex flex-wrap gap-1">
						{attempt.workspaceId &&
							!["queued", "skipped", "cancelled"].includes(attempt.state) && (
								<Button
									size="xs"
									variant="ghost"
									onClick={() =>
										void navigate({
											to: "/v2-workspace/$workspaceId",
											params: {
												workspaceId: required(attempt.workspaceId),
											},
										})
									}
								>
									<Trans>Open workspace</Trans>
								</Button>
							)}
						{attempt.url && (
							<Button size="xs" variant="ghost" asChild>
								<a href={attempt.url} target="_blank" rel="noreferrer">
									<Trans>Open source</Trans>
								</a>
							</Button>
						)}
						{RETRYABLE.includes(attempt.state) && (
							<Button
								size="xs"
								variant="ghost"
								disabled={action.isPending}
								onClick={() =>
									action.mutate({ attemptId: attempt.id, action: "retry" })
								}
							>
								<Trans>Run again</Trans>
							</Button>
						)}
						{attempt.state === "queued" && (
							<Button
								size="xs"
								variant="ghost"
								disabled={action.isPending}
								onClick={() =>
									action.mutate({ attemptId: attempt.id, action: "cancel" })
								}
							>
								<Trans>Cancel</Trans>
							</Button>
						)}
						{["running", "waiting_input", "verifying"].includes(
							attempt.state,
						) && (
							<Button
								size="xs"
								variant="ghost"
								disabled={action.isPending}
								onClick={() =>
									action.mutate({ attemptId: attempt.id, action: "release" })
								}
							>
								<Trans>Stop tracking</Trans>
							</Button>
						)}
						{attempt.state === "agent_done" && (
							<Button
								size="xs"
								variant="ghost"
								disabled={action.isPending}
								onClick={() =>
									action.mutate({ attemptId: attempt.id, action: "verified" })
								}
							>
								<Trans>Mark as verified</Trans>
							</Button>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
