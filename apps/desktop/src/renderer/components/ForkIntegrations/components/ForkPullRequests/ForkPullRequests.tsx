import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useForkConnections } from "../../hooks/useForkConnections";
import { ForkPullRequestDetail } from "../ForkPullRequestDetail/ForkPullRequestDetail";

export function ForkPullRequests() {
	const { t } = useLingui(),
		{ client, hostUrl, connections } = useForkConnections(),
		cache = useQueryClient();
	const navigate = useNavigate();
	const search = useSearch({ strict: false }) as {
		forkProject?: string;
		forkNumber?: number;
	};
	const accounts = connections.filter(
		(c) => c.provider === "bitbucket" && c.enabled,
	);
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "scm-projects"],
		queryFn: () => client!.forkScm.projects.query(),
		enabled: !!client,
	});
	const repos =
		projects.data?.filter((p) => p.repository.provider === "bitbucket") ?? [];
	const [projectId, setProjectId] = useState(""),
		[accountId, setAccountId] = useState("");
	const project =
		repos.find((p) => p.projectId === (projectId || search.forkProject)) ??
		repos[0];
	const connectionId =
		accountId || project?.connectionId || accounts[0]?.id || "";
	const [state, setState] = useState<"open" | "closed" | "all">("open"),
		[selected, setSelected] = useState<ForkPullRequest | null>(null);
	const branch = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"default-branch",
			connectionId,
			project?.repository,
		],
		queryFn: () =>
			client!.forkScm.defaultBranch.query({
				connectionId,
				repository: project!.repository,
			}),
		enabled: !!client && !!project && !!connectionId,
	});
	const [create, setCreate] = useState(false),
		[title, setTitle] = useState(""),
		[description, setDescription] = useState(""),
		[source, setSource] = useState(""),
		[target, setTarget] = useState("");
	const query = useInfiniteQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"pull-requests",
			project?.repository,
			connectionId,
			state,
		],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			client!.forkScm.list.query({
				connectionId,
				repository: project!.repository,
				state,
				cursor: pageParam,
			}),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		enabled: !!client && !!project && !!connectionId,
		retry: false,
	});
	const mutation = useMutation({
		mutationFn: async () => {
			if (!client || !project) return;
			await client.forkConnections.bind.mutate({
				projectId: project.projectId,
				repository: project.repository,
				connectionId,
				remote: project.remote,
			});
			const pr = await client.forkScm.create.mutate({
				connectionId,
				repository: project.repository,
				title,
				description,
				source,
				target: target || branch.data || "",
			});
			setSelected(pr);
			setCreate(false);
			return pr;
		},
		onSuccess: () =>
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] }),
	});
	const linked = useQuery({
		queryKey: [
			"fork-integrations",
			hostUrl,
			"linked-pr",
			connectionId,
			project?.projectId,
			search.forkNumber,
		],
		queryFn: () =>
			client!.forkScm.get.query({
				connectionId,
				repository: project!.repository,
				number: search.forkNumber!,
			}),
		enabled: !!client && !!project && !!connectionId && !!search.forkNumber,
		retry: false,
	});
	const active = selected ?? linked.data ?? null;
	const [checkoutIds] = useState(() => new Map<string, string>());
	const checkoutKey = project?.projectId + ":" + active?.number;
	if (!checkoutIds.has(checkoutKey))
		checkoutIds.set(checkoutKey, crypto.randomUUID());
	const checkoutId = checkoutIds.get(checkoutKey)!;
	const checkout = useMutation({
		mutationFn: () =>
			client!.forkScm.checkout.mutate({
				connectionId,
				repository: project!.repository,
				number: active!.number,
				projectId: project!.projectId,
				workspaceId: checkoutId,
			}),
		onSuccess: (r) => {
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: r.workspaceId },
			});
		},
	});
	const bind = useMutation({
		mutationFn: (id: string) =>
			client!.forkConnections.bind.mutate({
				projectId: project!.projectId,
				repository: project!.repository,
				connectionId: id,
				remote: project!.remote,
			}),
		onSuccess: () =>
			void cache.invalidateQueries({ queryKey: ["fork-integrations"] }),
	});
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-2 border-b p-4">
				<span className="mr-2 text-lg font-semibold">Bitbucket</span>
				<select
					className="h-9 max-w-64 rounded-md border bg-background px-2 text-sm"
					aria-label={t({ message: "Repository" })}
					value={project?.projectId ?? ""}
					onChange={(e) => {
						setProjectId(e.target.value);
						setSelected(null);
						setAccountId("");
					}}
				>
					{repos.map((p) => (
						<option key={p.projectId} value={p.projectId}>
							{p.repository.owner}/{p.repository.name}
						</option>
					))}
				</select>
				<select
					className="h-9 max-w-48 rounded-md border bg-background px-2 text-sm"
					aria-label={t({ message: "Account" })}
					value={connectionId}
					onChange={(e) => {
						setAccountId(e.target.value);
						setSelected(null);
						if (project) bind.mutate(e.target.value);
					}}
				>
					{accounts.map((c) => (
						<option key={c.id} value={c.id}>
							{c.identity?.login ?? c.label}
						</option>
					))}
				</select>
				<select
					className="h-9 rounded-md border bg-background px-2 text-sm"
					aria-label={t({ message: "State" })}
					value={state}
					onChange={(e) => setState(e.target.value as typeof state)}
				>
					<option value="open">{t({ message: "Open" })}</option>
					<option value="closed">{t({ message: "Closed" })}</option>
					<option value="all">{t({ message: "All" })}</option>
				</select>
				<Button
					size="sm"
					disabled={!project || !connectionId}
					onClick={() => setCreate(!create)}
				>
					<Trans>Create pull request</Trans>
				</Button>
				<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
					<Trans>Refresh</Trans>
				</Button>
			</div>
			{create && (
				<form
					className="space-y-3 border-b p-4"
					onSubmit={(e) => {
						e.preventDefault();
						mutation.mutate();
					}}
				>
					<Input
						aria-label={t({ message: "Title" })}
						placeholder={t({ message: "Title" })}
						required
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
					<Textarea
						aria-label={t({ message: "Description" })}
						placeholder={t({ message: "Description" })}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
					<div className="flex gap-2">
						<Input
							aria-label={t({ message: "Source branch" })}
							placeholder={t({ message: "Source branch" })}
							required
							value={source}
							onChange={(e) => setSource(e.target.value)}
						/>
						<Input
							aria-label={t({ message: "Target branch" })}
							placeholder={t({ message: "Target branch" })}
							required
							value={target || branch.data || ""}
							onChange={(e) => setTarget(e.target.value)}
						/>
						<Button disabled={mutation.isPending}>
							<Trans>Create</Trans>
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						<Trans>Push your branch before creating a pull request.</Trans>
					</p>
					{mutation.error && (
						<p role="alert" className="text-sm text-destructive">
							{mutation.error.message}
						</p>
					)}
				</form>
			)}
			<div className="flex min-h-0 flex-1">
				<div
					className={
						active
							? "w-80 shrink-0 overflow-auto border-r"
							: "min-w-0 flex-1 overflow-auto"
					}
				>
					{(query.error || projects.error || bind.error) && (
						<p role="alert" className="p-4 text-sm text-destructive">
							{query.error?.message ??
								projects.error?.message ??
								bind.error?.message}
						</p>
					)}
					{query.data?.pages
						.flatMap((p) => p.items)
						.map((pr) => (
							<button
								type="button"
								key={pr.number}
								className="block w-full space-y-1 border-b p-4 text-left hover:bg-muted/40"
								onClick={() => setSelected(pr)}
							>
								<p className="text-sm font-medium">{pr.title}</p>
								<p className="text-xs text-muted-foreground">
									#{pr.number} · {pr.author} · {pr.sourceBranch} →{" "}
									{pr.targetBranch}
								</p>
							</button>
						))}
					{!project && !projects.isPending && (
						<p className="p-6 text-sm text-muted-foreground">
							<Trans>Add a Bitbucket repository to get started.</Trans>
						</p>
					)}
					{query.hasNextPage && (
						<Button
							className="m-4"
							variant="outline"
							onClick={() => void query.fetchNextPage()}
						>
							<Trans>Load more</Trans>
						</Button>
					)}
				</div>
				{active && (
					<div className="flex min-w-0 flex-1 flex-col">
						<Button
							className="m-3 self-end"
							size="sm"
							variant="outline"
							disabled={checkout.isPending}
							onClick={() => checkout.mutate()}
						>
							<Trans>Open in workspace</Trans>
						</Button>
						{checkout.error && (
							<p className="p-3 text-xs text-destructive">
								{checkout.error.message}
							</p>
						)}
						<ForkPullRequestDetail
							key={active.connectionId + active.url}
							pullRequest={active}
							onBack={() => {
								setSelected(null);
								void navigate({
									to: "/pull-requests",
									search: {
										forkProvider: "bitbucket",
										forkProject: project?.projectId,
									},
								});
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
