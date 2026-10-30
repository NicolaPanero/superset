import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	ArrowDown,
	Check,
	CheckCircle2,
	CircleAlert,
	CircleDashed,
	GitBranch,
	GitPullRequest,
	Loader2,
	Play,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { ForkJiraProjectPicker } from "../ForkJiraProjectPicker";
import { ForkJiraSettingsPanel } from "../ForkJiraSettingsPanel";

import { ForkJiraWorkflowStep } from "./components/ForkJiraWorkflowStep";

export function ForkJiraStatusMapping({
	connectionId,
}: {
	connectionId: string;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const id = useId();
	const [open, setOpen] = useState(false);
	const [projectKey, setProjectKey] = useState("");
	const [progress, setProgress] = useState("");
	const [review, setReview] = useState("");
	const [dirty, setDirty] = useState(false);
	const target = { connectionId, projectKey };
	const statuses = useQuery({
		queryKey: ["fork-integrations", hostUrl, "jira-statuses", target],
		queryFn: () => required(client).forkTasks.projectStatuses.query(target),
		enabled: !!client && open && !!projectKey,
		staleTime: 300_000,
		retry: false,
	});
	const mapping = useQuery({
		queryKey: ["fork-integrations", hostUrl, "jira-status-mapping", target],
		queryFn: () => required(client).forkTasks.statusMapping.query(target),
		enabled: !!client && open && !!projectKey,
		refetchOnWindowFocus: false,
		retry: false,
	});
	useEffect(() => {
		if (!mapping.isSuccess || dirty) return;
		setProgress(mapping.data?.progressStatusId ?? "");
		setReview(mapping.data?.reviewStatusId ?? "");
	}, [mapping.isSuccess, mapping.data, dirty]);
	const save = useMutation({
		mutationFn: () =>
			required(client).forkTasks.setStatusMapping.mutate({
				...target,
				progressStatusId: progress || null,
				reviewStatusId: review || null,
			}),
		onSuccess: async () => {
			await mapping.refetch();
			setDirty(false);
			toast.success(t({ message: "Saved" }));
		},
	});
	const close = (next: boolean) => {
		if (save.isPending) return;
		setOpen(next);
		if (!next) {
			setProjectKey("");
			setDirty(false);
			save.reset();
		}
	};
	return (
		<ForkJiraSettingsPanel
			icon={GitBranch}
			title={<Trans>Workflow statuses</Trans>}
			description={
				<Trans>Update Jira when work starts or a pull request opens.</Trans>
			}
			open={open}
			onOpenChange={close}
		>
			<div className="space-y-5 p-4 @min-[640px]/jira-settings:p-5">
				<div className="min-w-0 space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor={`${id}-project`} className="text-sm font-medium">
							<Trans>Jira project</Trans>
						</Label>
						<p className="text-xs leading-relaxed text-muted-foreground">
							<Trans>Choose a project, then choose where its tasks move.</Trans>
						</p>
					</div>
					<ForkJiraProjectPicker
						id={`${id}-project`}
						connectionId={connectionId}
						value={projectKey}
						disabled={save.isPending}
						onChange={(value) => {
							if (value === projectKey) return;
							setProjectKey(value);
							setProgress("");
							setReview("");
							setDirty(false);
							save.reset();
						}}
					/>
				</div>
				{projectKey ? (
					<div className="space-y-3">
						<ForkJiraWorkflowStep
							id={`${id}-progress`}
							title={<Trans>Work started</Trans>}
							icon={Play}
							value={progress}
							onChange={(value) => {
								setProgress(value);
								setDirty(true);
							}}
							statuses={statuses.data ?? []}
							disabled={
								mapping.isPending ||
								statuses.isPending ||
								mapping.isError ||
								statuses.isError ||
								save.isPending
							}
							loading={mapping.isPending || statuses.isPending}
							automaticHelp={
								<Trans>
									Automatic selects an available in-progress status.
								</Trans>
							}
						/>
						<ForkJiraWorkflowStep
							id={`${id}-review`}
							title={<Trans>Pull request opened</Trans>}
							icon={GitPullRequest}
							value={review}
							onChange={(value) => {
								setReview(value);
								setDirty(true);
							}}
							statuses={statuses.data ?? []}
							disabled={
								mapping.isPending ||
								statuses.isPending ||
								mapping.isError ||
								statuses.isError ||
								save.isPending
							}
							loading={mapping.isPending || statuses.isPending}
							automaticHelp={
								<Trans>
									Automatic looks for an available status with “review” in its
									name.
								</Trans>
							}
						/>
					</div>
				) : (
					<div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-background p-4 text-foreground">
						<ArrowDown
							className="mt-0.5 size-4 shrink-0 text-primary"
							aria-hidden
						/>
						<p className="text-xs leading-relaxed text-muted-foreground">
							<Trans>Select a project to configure its workflow.</Trans>
						</p>
					</div>
				)}
				{(statuses.error || mapping.error || save.error) && (
					<div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
						<p
							role="alert"
							className="text-xs leading-relaxed text-destructive [overflow-wrap:anywhere]"
						>
							{errorMessage(statuses.error ?? mapping.error ?? save.error)}
						</p>
						{(statuses.error || mapping.error) && (
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => {
									void statuses.refetch();
									void mapping.refetch();
								}}
							>
								<Trans>Retry</Trans>
							</Button>
						)}
					</div>
				)}
			</div>
			{projectKey && (
				<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/15 px-4 py-3 @min-[640px]/jira-settings:px-5">
					<output
						className={cn(
							"flex min-w-0 items-center gap-2 text-xs",
							dirty ? "text-warning" : "text-muted-foreground",
						)}
					>
						{dirty ? (
							<CircleAlert className="size-3.5 shrink-0" aria-hidden />
						) : progress || review ? (
							<CheckCircle2
								className="size-3.5 shrink-0 text-success"
								aria-hidden
							/>
						) : (
							<CircleDashed className="size-3.5 shrink-0" aria-hidden />
						)}
						{dirty ? (
							<Trans>Unsaved changes</Trans>
						) : progress || review ? (
							<Trans>Saved</Trans>
						) : (
							<Trans>Automatic</Trans>
						)}
					</output>
					<div className="ml-auto flex gap-2">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							disabled={save.isPending}
							onClick={() => close(false)}
						>
							<Trans>Close</Trans>
						</Button>
						<Button
							type="button"
							size="sm"
							disabled={
								!dirty ||
								mapping.isPending ||
								statuses.isPending ||
								mapping.isError ||
								statuses.isError ||
								save.isPending
							}
							onClick={() => save.mutate()}
						>
							{save.isPending ? (
								<Loader2 className="size-3.5 animate-spin" aria-hidden />
							) : (
								<Check className="size-3.5" aria-hidden />
							)}
							{save.isPending ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
						</Button>
					</div>
				</div>
			)}
		</ForkJiraSettingsPanel>
	);
}
