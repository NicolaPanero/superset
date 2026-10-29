import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { ForkAutomationRuns } from "../../../ForkAutomationRuns";
import { ForkRelativeTime } from "../../../ForkRelativeTime";
import { FORK_AUTOMATION_SOURCES } from "../../utils/forkAutomationTemplates";

const EXAMPLE_ISSUE = "APP-123";

const PREVIEW_LABELS = {
	start: msg({ message: "Would start" }),
	handled: msg({ message: "Already handled" }),
	baseline: msg({ message: "Recorded on enable, not started" }),
	limit: msg({ message: "Run limit reached" }),
	missed: msg({ message: "Too late, skipped" }),
} as const;

export interface ForkAutomationRule {
	id: string;
	name: string;
	jql: string;
	enabled: boolean;
	error: string | null;
	checkedAt: number | null;
	attention?: number;
	active?: number;
	options?: {
		sourceKind: string;
		pausedReason: string | null;
	} | null;
	launch: { surface: string; model: string | null } | null;
}

export function ForkAutomationRuleCard({
	rule,
	onEdit,
}: {
	rule: ForkAutomationRule;
	onEdit?: () => void;
}) {
	const { i18n } = useLingui();
	const { client, hostUrl, data } = useForkConnections();
	const cache = useQueryClient();
	const v2 = (data?.version ?? 0) >= 9;
	const [panel, setPanel] = useState<"runs" | "preview" | "run" | null>(null);
	const [taskKey, setTaskKey] = useState("");
	const kind = rule.options?.sourceKind ?? "jira";
	const source = FORK_AUTOMATION_SOURCES.find((s) => s.kind === kind);
	const refresh = () =>
		cache.invalidateQueries({
			queryKey: ["fork-integrations", hostUrl, "automations"],
		});
	const preview = useQuery({
		queryKey: ["fork-integrations", hostUrl, "automation-preview", rule.id],
		queryFn: () =>
			required(client).forkTasks.automationPreview.query({ id: rule.id }),
		enabled: !!client && panel === "preview",
		retry: false,
	});
	const mutation = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: async (
			action:
				| { kind: "enable"; enabled: boolean }
				| { kind: "delete" }
				| { kind: "run"; dryRun: boolean },
		) => {
			const api = required(client).forkTasks;
			if (action.kind === "enable")
				return api.automationEnable.mutate({
					id: rule.id,
					enabled: action.enabled,
				});
			if (action.kind === "delete")
				return api.automationDelete.mutate({ id: rule.id });
			return api.automationRunNow.mutate({
				id: rule.id,
				taskKey: kind === "jira" ? taskKey.trim().toUpperCase() : undefined,
				dryRun: action.dryRun,
			});
		},
		onSuccess: (result, action) => {
			if (action.kind === "run" && !action.dryRun) setPanel("runs");
			void refresh();
			void cache.invalidateQueries({
				queryKey: ["fork-integrations", hostUrl, "automation-attempts"],
			});
			return result;
		},
	});
	const dryRun =
		mutation.data && "dryRun" in mutation.data && mutation.data.dryRun
			? mutation.data
			: null;
	const paused = rule.options?.pausedReason;
	const active = rule.active ?? 0;
	return (
		<div className="space-y-2 rounded-lg border p-3">
			<div className="flex flex-wrap items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-sm font-medium">
					{rule.name}
				</span>
				{v2 && source && (
					<span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
						{i18n._(source.label)}
					</span>
				)}
				<Button
					size="sm"
					variant="outline"
					disabled={mutation.isPending}
					onClick={() =>
						mutation.mutate({
							kind: "enable",
							enabled: !rule.enabled || !!paused,
						})
					}
				>
					{rule.enabled && !paused ? (
						<Trans>Pause</Trans>
					) : (
						<Trans>Enable</Trans>
					)}
				</Button>
				{v2 && onEdit && (
					<Button size="sm" variant="ghost" onClick={onEdit}>
						<Trans>Edit</Trans>
					</Button>
				)}
				<Button
					size="sm"
					variant="ghost"
					disabled={mutation.isPending}
					onClick={() => mutation.mutate({ kind: "delete" })}
				>
					<Trans>Delete</Trans>
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				{rule.launch &&
					(rule.launch.surface === "chat" ? (
						<Trans>ACP chat</Trans>
					) : (
						<Trans>Terminal</Trans>
					))}
				{rule.launch?.model ? ` · ${rule.launch.model}` : ""}
				{rule.checkedAt && (
					<>
						{" · "}
						<Trans>checked</Trans>{" "}
						<ForkRelativeTime value={new Date(rule.checkedAt).toISOString()} />
					</>
				)}
				{!!rule.active && (
					<>
						{" · "}
						<Trans>{active} in progress</Trans>
					</>
				)}
			</p>
			{kind === "jira" && (
				<p className="break-all font-mono text-xs text-muted-foreground">
					{rule.jql}
				</p>
			)}
			{paused && (
				<p role="alert" className="text-xs text-amber-600 dark:text-amber-400">
					{paused}
				</p>
			)}
			{rule.error && (
				<p role="alert" className="text-xs text-destructive">
					{rule.error}
				</p>
			)}
			{mutation.error && (
				<p role="alert" className="text-xs text-destructive">
					{mutation.error.message}
				</p>
			)}
			{v2 && (
				<div className="flex flex-wrap gap-1">
					{(["runs", "preview", "run"] as const).map((name) => (
						<Button
							key={name}
							size="xs"
							variant={panel === name ? "secondary" : "ghost"}
							onClick={() => setPanel(panel === name ? null : name)}
						>
							{name === "runs" ? (
								<>
									<Trans>Runs</Trans>
									{!!rule.attention && (
										<span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
											{rule.attention}
										</span>
									)}
								</>
							) : name === "preview" ? (
								<Trans>Preview</Trans>
							) : (
								<Trans>Run now</Trans>
							)}
						</Button>
					))}
				</div>
			)}
			{panel === "runs" && (
				<ForkAutomationRuns
					ruleId={rule.id}
					emptyText={<Trans>No runs yet.</Trans>}
				/>
			)}
			{panel === "preview" && (
				<div className="space-y-1">
					{preview.isFetching && (
						<p className="text-xs text-muted-foreground">
							<Trans>Checking…</Trans>
						</p>
					)}
					{preview.error && (
						<p role="alert" className="text-xs text-destructive">
							{preview.error.message}
						</p>
					)}
					{preview.data?.length === 0 && (
						<p className="text-xs text-muted-foreground">
							<Trans>Nothing matches right now.</Trans>
						</p>
					)}
					{preview.data?.map((item) => (
						<div key={item.key} className="flex gap-2 text-xs">
							<span className="w-44 shrink-0 text-muted-foreground">
								{i18n._(PREVIEW_LABELS[item.status])}
							</span>
							<span className="min-w-0 truncate">{item.title}</span>
						</div>
					))}
				</div>
			)}
			{panel === "run" && (
				<div className="space-y-2">
					{kind === "jira" && (
						<Input
							aria-label={i18n._(msg({ message: "Issue key" }))}
							placeholder={EXAMPLE_ISSUE}
							value={taskKey}
							onChange={(e) => setTaskKey(e.target.value)}
						/>
					)}
					<div className="flex gap-2">
						<Button
							size="xs"
							variant="outline"
							disabled={
								mutation.isPending || (kind === "jira" && !taskKey.trim())
							}
							onClick={() => mutation.mutate({ kind: "run", dryRun: true })}
						>
							<Trans>Show the prompt</Trans>
						</Button>
						<Button
							size="xs"
							disabled={
								mutation.isPending || (kind === "jira" && !taskKey.trim())
							}
							onClick={() => mutation.mutate({ kind: "run", dryRun: false })}
						>
							<Trans>Start a run</Trans>
						</Button>
					</div>
					{dryRun && (
						<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
							{dryRun.prompt}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
