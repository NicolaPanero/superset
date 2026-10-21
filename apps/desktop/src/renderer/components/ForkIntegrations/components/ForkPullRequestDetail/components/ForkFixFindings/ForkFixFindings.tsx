import { Trans, useLingui } from "@lingui/react/macro";
import type { ForkPullRequest } from "@superset/shared/fork-integrations";
import { forkRepositoryKey } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuSparkles } from "react-icons/lu";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { PullRequestInfoVariant } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestInfo";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";
import { ForkInfoSection } from "../../../ForkInfoSection";

export function ForkFixFindings({
	pr,
	hostUrl,
	variant,
}: {
	pr: ForkPullRequest;
	hostUrl: string | null;
	variant: PullRequestInfoVariant;
}) {
	const { t } = useLingui();
	const { client, data } = useForkConnections(hostUrl);
	const { data: agents = [] } = useV2AgentConfigs(hostUrl);
	const [agentId, setAgentId] = useState("");
	const navigate = useNavigate();
	const projects = useQuery({
		queryKey: ["fork-integrations", hostUrl, "projects"],
		queryFn: () => required(client).forkScm.projects.query(),
		enabled: !!client && (data?.version ?? 0) >= 4,
		retry: false,
	});
	const project = projects.data?.find(
		(entry) =>
			forkRepositoryKey(entry.repository) === forkRepositoryKey(pr.repository),
	);
	const fix = useMutation({
		retry: false,
		networkMode: "always",
		mutationFn: () =>
			required(client).forkScm.fixFindings.mutate({
				connectionId: pr.connectionId,
				repository: pr.repository,
				number: pr.number,
				projectId: required(project).projectId,
				agent: agentId || required(agents[0]).id,
			}),
		onSuccess: (result) =>
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: result.workspaceId },
			}),
	});
	if ((data?.version ?? 0) < 4) return null;
	return (
		<ForkInfoSection
			variant={variant}
			label={t({ message: "Agent" })}
			icon={<LuSparkles className="size-4" />}
		>
			<div className="flex min-w-0 flex-wrap items-center gap-1.5">
				<select
					aria-label={t({ message: "Agent" })}
					className="h-7 min-w-0 max-w-40 flex-1 rounded-md border border-border/60 bg-background px-2 text-xs"
					value={agentId || agents[0]?.id || ""}
					onChange={(event) => setAgentId(event.target.value)}
				>
					{agents.map((agent) => (
						<option key={agent.id} value={agent.id}>
							{agent.label}
						</option>
					))}
				</select>
				<Button
					size="xs"
					variant="secondary"
					disabled={!project || !agents.length || fix.isPending}
					onClick={() => fix.mutate()}
				>
					<LuSparkles className="size-3.5" />
					{fix.isPending ? (
						<Trans>Handing to agent…</Trans>
					) : (
						<Trans>Fix findings</Trans>
					)}
				</Button>
			</div>
			{(fix.error || projects.error) && (
				<p role="alert" className="text-xs text-destructive">
					{(fix.error ?? projects.error)?.message}
				</p>
			)}
		</ForkInfoSection>
	);
}
