import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

export function ForkJiraStatusMapping({
	connectionId,
}: {
	connectionId: string;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const [open, setOpen] = useState(false);
	const [projectKey, setProjectKey] = useState("");
	const [progress, setProgress] = useState("");
	const [review, setReview] = useState("");
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "jira-projects", connectionId],
		queryFn: () => required(client).forkTasks.projects.query({ connectionId }),
		enabled: !!client && open,
		staleTime: 300_000,
	});
	const target = { connectionId, projectKey };
	const statuses = useQuery({
		queryKey: ["fork-integrations", hostUrl, "jira-statuses", target],
		queryFn: () => required(client).forkTasks.projectStatuses.query(target),
		enabled: !!client && open && !!projectKey,
		staleTime: 300_000,
	});
	const mapping = useQuery({
		queryKey: ["fork-integrations", hostUrl, "jira-status-mapping", target],
		queryFn: () => required(client).forkTasks.statusMapping.query(target),
		enabled: !!client && open && !!projectKey,
	});
	useEffect(() => {
		if (!mapping.isSuccess) return;
		setProgress(mapping.data?.progressStatusId ?? "");
		setReview(mapping.data?.reviewStatusId ?? "");
	}, [mapping.isSuccess, mapping.data]);
	const save = useMutation({
		mutationFn: () =>
			required(client).forkTasks.setStatusMapping.mutate({
				...target,
				progressStatusId: progress || null,
				reviewStatusId: review || null,
			}),
		onSuccess: () => {
			toast.success(t({ message: "Saved" }));
			void mapping.refetch();
		},
	});
	if (!open)
		return (
			<Button
				size="xs"
				variant="ghost"
				className="mt-3 sm:ml-13"
				onClick={() => setOpen(true)}
			>
				<Trans>Workflow statuses</Trans>
			</Button>
		);
	const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
	return (
		<div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-4 text-sm sm:ml-13">
			<p className="text-xs text-muted-foreground">
				<Trans>
					Choose the statuses Superset moves an issue to when work starts and
					when a pull request opens. Without a choice, it looks for a status
					named like “review”.
				</Trans>
			</p>
			<div className="space-y-1">
				<Label htmlFor="jira-mapping-project">
					<Trans>Project</Trans>
				</Label>
				<select
					id="jira-mapping-project"
					className={selectClass}
					value={projectKey}
					onChange={(e) => setProjectKey(e.target.value)}
				>
					<option value="">{t({ message: "Select a project" })}</option>
					{projects.data?.map((project) => (
						<option key={project.id} value={project.key}>
							{project.key} · {project.name}
						</option>
					))}
				</select>
			</div>
			{projectKey && (
				<div className="grid gap-3 sm:grid-cols-2">
					{(
						[
							[
								"jira-mapping-progress",
								t({ message: "Work started" }),
								progress,
								setProgress,
							],
							[
								"jira-mapping-review",
								t({ message: "Pull request opened" }),
								review,
								setReview,
							],
						] as const
					).map(([id, label, value, setValue]) => (
						<div key={id} className="space-y-1">
							<Label htmlFor={id}>{label}</Label>
							<select
								id={id}
								className={selectClass}
								value={value}
								onChange={(e) => setValue(e.target.value)}
							>
								<option value="">{t({ message: "Automatic" })}</option>
								{statuses.data?.map((status) => (
									<option key={status.id} value={status.id}>
										{status.name}
									</option>
								))}
							</select>
						</div>
					))}
				</div>
			)}
			{(statuses.isError || save.isError) && (
				<p role="alert" className="text-xs text-destructive">
					{(statuses.error ?? save.error)?.message}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={!projectKey || save.isPending}
					onClick={() => save.mutate()}
				>
					<Trans>Save</Trans>
				</Button>
				<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
					<Trans>Close</Trans>
				</Button>
			</div>
		</div>
	);
}
