import { Trans, useLingui } from "@lingui/react/macro";
import { isForkServiceUnavailable } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { PullRequestListToggle } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestListToggle";
import { useForkConnections } from "../../hooks/useForkConnections";
import { required } from "../../utils/required";
import { ForkProviderIcon } from "../ForkProviderIcon";
import { ForkPullRequestDetail } from "../ForkPullRequestDetail/ForkPullRequestDetail";
import { ForkServiceNotice } from "../ForkServiceNotice";

export function ForkPullRequests({
	projectId,
	number,
	hostUrl,
}: {
	projectId: string;
	number: number;
	hostUrl: string | null;
}) {
	const { t } = useLingui();
	const { client, connections, data } = useForkConnections(hostUrl);
	const navigate = useNavigate();
	const projects = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", hostUrl, "scm-projects"],
		queryFn: () => required(client).forkScm.projects.query(),
		enabled: !!client && !!data?.version,
	});
	const project = projects.data?.find((p) => p.projectId === projectId);
	const accounts = connections.filter(
		(c) => c.provider === project?.repository.provider && c.enabled,
	);
	const [account, setAccount] = useState("");
	const connectionId =
		account ||
		project?.connectionId ||
		accounts.find((c) => c.isDefault)?.id ||
		(accounts.length === 1 ? accounts[0]?.id : "") ||
		"";
	const detail = useQuery({
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: [
			"fork-integrations",
			hostUrl,
			"linked-pr",
			projectId,
			connectionId,
			number,
		],
		queryFn: () =>
			required(client).forkScm.get.query({
				connectionId,
				repository: required(project).repository,
				number,
			}),
		enabled: !!client && !!project && !!connectionId,
	});
	const [workspaceId] = useState(() => crypto.randomUUID());
	const checkout = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: () =>
			required(client).forkScm.checkout.mutate({
				connectionId,
				repository: required(project).repository,
				number,
				projectId,
				workspaceId,
			}),
		onSuccess: (r) =>
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: r.workspaceId },
			}),
	});
	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<PageHeader contentClassName="gap-2">
				<PullRequestListToggle />
				<ForkProviderIcon provider="bitbucket" />
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
					{project
						? `${project.repository.owner}/${project.repository.name}`
						: "Bitbucket"}{" "}
					<span className="text-foreground">#{number}</span>
				</span>
				{accounts.length > 1 && (
					<select
						aria-label={t({ message: "Account" })}
						value={connectionId}
						onChange={(e) => setAccount(e.target.value)}
						className="h-7 max-w-36 rounded-md border bg-background px-2 text-xs"
					>
						<option value="">{t({ message: "Account" })}</option>
						{accounts.map((c) => (
							<option key={c.id} value={c.id}>
								{c.identity?.login ?? c.label}
							</option>
						))}
					</select>
				)}
				<Button
					size="sm"
					variant="outline"
					disabled={!detail.data || checkout.isPending}
					onClick={() => checkout.mutate()}
				>
					<Trans>Open in workspace</Trans>
				</Button>
			</PageHeader>
			{isForkServiceUnavailable(detail.error) && (
				<div className="border-b p-3">
					<ForkServiceNotice
						provider="bitbucket"
						onRetry={() => void detail.refetch()}
					/>
				</div>
			)}
			{detail.data ? (
				<ForkPullRequestDetail
					key={detail.data.url + connectionId}
					pullRequest={detail.data}
					hostUrl={hostUrl}
				/>
			) : (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
					<ForkProviderIcon
						provider="bitbucket"
						className="size-8 opacity-60"
					/>
					{detail.isError || projects.isError ? (
						<>
							{!isForkServiceUnavailable(detail.error) && (
								<p>
									<Trans>Could not load pull request.</Trans>
								</p>
							)}
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									void projects.refetch();
									void detail.refetch();
								}}
							>
								<Trans>Try again</Trans>
							</Button>
						</>
					) : !projects.isPending && !connectionId ? (
						<>
							<p>
								<Trans>Connect an account in Fork Settings</Trans>
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void navigate({ to: "/settings/fork" })}
							>
								<Trans>Connections</Trans>
							</Button>
						</>
					) : (
						<p>
							<Trans>Loading pull requests…</Trans>
						</p>
					)}
				</div>
			)}
			{checkout.error && (
				<p role="alert" className="border-t p-3 text-xs text-destructive">
					{checkout.error.message}
				</p>
			)}
		</div>
	);
}
