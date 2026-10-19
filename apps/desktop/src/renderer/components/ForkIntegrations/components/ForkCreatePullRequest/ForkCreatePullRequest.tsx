import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { LuPlus } from "react-icons/lu";
import type { ProjectQueryTarget } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectQueryTargets";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkProviderIcon } from "../ForkProviderIcon";

export function ForkCreatePullRequest({
	projectTargets,
}: {
	projectTargets: ProjectQueryTarget[];
}) {
	const { t } = useLingui();
	const { client, hostUrl, connections, data } = useForkConnections();
	const cache = useQueryClient();
	const navigate = useNavigate();
	const id = useId();
	const [open, setOpen] = useState(false);
	const [projectId, setProjectId] = useState("");
	const [accountId, setAccountId] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [source, setSource] = useState("");
	const [target, setTarget] = useState("");
	const accounts = connections.filter(
		(c) => c.provider === "bitbucket" && c.enabled,
	);
	const projects = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "scm-projects"],
		queryFn: () => required(client).forkScm.projects.query(),
		enabled: !!client && !!data?.version && accounts.length > 0,
	});
	const repos =
		projects.data?.filter(
			(p) =>
				p.repository.provider === "bitbucket" &&
				projectTargets.some(
					(target) =>
						target.projectId === p.projectId && target.hostUrl === hostUrl,
				),
		) ?? [];
	const project = repos.find((p) => p.projectId === projectId) ?? repos[0];
	const connectionId =
		accountId ||
		project?.connectionId ||
		accounts.find((c) => c.isDefault)?.id ||
		(accounts.length === 1 ? accounts[0]?.id : "") ||
		"";
	const branch = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: [
			"fork-integrations",
			hostUrl,
			"default-branch",
			connectionId,
			project?.repository,
		],
		queryFn: () =>
			required(client).forkScm.defaultBranch.query({
				connectionId,
				repository: required(project).repository,
			}),
		enabled: open && !!client && !!project && !!connectionId,
	});
	const create = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: async () => {
			const selected = required(project);
			await required(client).forkConnections.bind.mutate({
				projectId: selected.projectId,
				repository: selected.repository,
				connectionId,
				remote: selected.remote,
			});
			const pr = await required(client).forkScm.create.mutate({
				connectionId,
				repository: selected.repository,
				title: title.trim(),
				description,
				source: source.trim(),
				target: (target || branch.data || "").trim(),
			});
			return { pr, projectId: selected.projectId };
		},
		onSuccess: (result) => {
			setOpen(false);
			setTitle("");
			setDescription("");
			setSource("");
			setTarget("");
			void cache.invalidateQueries({ queryKey: ["pullRequests"] });
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] });
			void navigate({
				to: "/pull-requests/$prNumber",
				params: { prNumber: String(result.pr.number) },
				search: { forkProvider: "bitbucket", project: result.projectId },
			});
		},
	});
	if (!repos.length) return null;
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!create.isPending) {
					setOpen(value);
					create.reset();
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="icon-xs"
					aria-label={t({ message: "Create pull request" })}
					title={t({ message: "Create pull request" })}
				>
					<LuPlus className="size-3.5" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ForkProviderIcon provider="bitbucket" />
						<Trans>Create pull request</Trans>
					</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						create.mutate();
					}}
				>
					<fieldset disabled={create.isPending} className="space-y-4">
						<div className="space-y-1.5">
							<Label>
								<Trans>Repository</Trans>
							</Label>
							<Select
								value={project?.projectId}
								onValueChange={(value) => {
									setProjectId(value);
									setAccountId("");
									setTarget("");
								}}
							>
								<SelectTrigger aria-label={t({ message: "Repository" })}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{repos.map((p) => (
										<SelectItem key={p.projectId} value={p.projectId}>
											{p.repository.owner}/{p.repository.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{accounts.length > 1 && (
							<div className="space-y-1.5">
								<Label>
									<Trans>Account</Trans>
								</Label>
								<Select value={connectionId} onValueChange={setAccountId}>
									<SelectTrigger aria-label={t({ message: "Account" })}>
										<SelectValue placeholder={t({ message: "Account" })} />
									</SelectTrigger>
									<SelectContent>
										{accounts.map((c) => (
											<SelectItem key={c.id} value={c.id}>
												{c.identity?.login ?? c.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-title`}>
								<Trans>Title</Trans>
							</Label>
							<Input
								id={`${id}-title`}
								required
								value={title}
								onChange={(event) => setTitle(event.target.value)}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-source`}>
									<Trans>Source branch</Trans>
								</Label>
								<Input
									id={`${id}-source`}
									required
									value={source}
									onChange={(event) => setSource(event.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-target`}>
									<Trans>Target branch</Trans>
								</Label>
								<Input
									id={`${id}-target`}
									required
									value={target || branch.data || ""}
									onChange={(event) => setTarget(event.target.value)}
								/>
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-description`}>
								<Trans>Description</Trans>
							</Label>
							<Textarea
								id={`${id}-description`}
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							<Trans>Push your branch before creating a pull request.</Trans>
						</p>
						{(create.error || branch.error) && (
							<p role="alert" className="text-xs text-destructive">
								{create.error?.message ?? branch.error?.message}
							</p>
						)}
						<div className="flex justify-end gap-2">
							<Button
								variant="ghost"
								type="button"
								onClick={() => setOpen(false)}
							>
								<Trans>Cancel</Trans>
							</Button>
							<Button
								disabled={
									!connectionId ||
									!title.trim() ||
									!source.trim() ||
									!(target || branch.data)
								}
							>
								<Trans>Create pull request</Trans>
							</Button>
						</div>
					</fieldset>
				</form>
			</DialogContent>
		</Dialog>
	);
}
