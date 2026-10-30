import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowRight,
	Check,
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

const AUTOMATIC = "__automatic__";

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
			<div className="space-y-5 p-5">
				<div className="space-y-3">
					<Label htmlFor={`${id}-project`}>
						<Trans>Project</Trans>
					</Label>
					<ForkJiraProjectPicker
						id={`${id}-project`}
						connectionId={connectionId}
						value={projectKey}
						disabled={save.isPending}
						onChange={(value) => {
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
						{(
							[
								{
									name: "progress",
									label: t({ message: "Work started" }),
									value: progress,
									set: setProgress,
									icon: Play,
								},
								{
									name: "review",
									label: t({ message: "Pull request opened" }),
									value: review,
									set: setReview,
									icon: GitPullRequest,
								},
							] as const
						).map((row) => (
							<div
								key={row.name}
								className="grid items-center gap-3 rounded-xl border border-border/60 bg-muted/15 p-4 @min-[520px]/jira-settings:grid-cols-[1fr_auto_1fr]"
							>
								<Label
									htmlFor={`${id}-${row.name}`}
									className="flex items-center gap-2 text-xs"
								>
									<row.icon
										className="size-4 shrink-0 text-muted-foreground"
										aria-hidden
									/>
									{row.label}
								</Label>
								<ArrowRight
									className="hidden size-4 text-muted-foreground @min-[520px]/jira-settings:block"
									aria-hidden
								/>
								<Select
									value={row.value || AUTOMATIC}
									disabled={
										mapping.isPending ||
										statuses.isPending ||
										mapping.isError ||
										statuses.isError ||
										save.isPending
									}
									onValueChange={(value) => {
										row.set(value === AUTOMATIC ? "" : value);
										setDirty(true);
									}}
								>
									<SelectTrigger
										id={`${id}-${row.name}`}
										className="w-full bg-background"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={AUTOMATIC}>
											<Trans>Automatic</Trans>
										</SelectItem>
										{row.value &&
											!statuses.data?.some(
												(status) => status.id === row.value,
											) && (
												<SelectItem value={row.value}>{row.value}</SelectItem>
											)}
										{statuses.data?.map((status) => (
											<SelectItem key={status.id} value={status.id}>
												{status.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						))}
					</div>
				) : (
					<div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
						<ArrowDown className="size-4 shrink-0" aria-hidden />
						<Trans>Select a project</Trans>
					</div>
				)}
				{(statuses.error || mapping.error || save.error) && (
					<p role="alert" className="text-xs text-destructive">
						{(statuses.error ?? mapping.error ?? save.error)?.message}
					</p>
				)}
			</div>
			<div className="flex items-center justify-between gap-3 border-t bg-muted/15 px-5 py-3">
				<span className="text-xs text-muted-foreground">
					{dirty ? (
						<Trans>Unsaved changes</Trans>
					) : !projectKey ? (
						<Trans>Select a project</Trans>
					) : progress || review ? (
						<Trans>Saved</Trans>
					) : (
						<Trans>Automatic</Trans>
					)}
				</span>
				<div className="flex gap-2">
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
							!projectKey ||
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
		</ForkJiraSettingsPanel>
	);
}
