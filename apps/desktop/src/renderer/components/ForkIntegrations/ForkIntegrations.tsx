import { Trans, useLingui } from "@lingui/react/macro";
import {
	FORK_PROVIDERS,
	type ForkProviderId,
} from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ForkConnectionCard } from "./components/ForkConnectionCard/ForkConnectionCard";
import { useForkConnections } from "./hooks/useForkConnections";

export function ForkIntegrations() {
	const { t } = useLingui();
	const { client, connections, data, isError, isPending, refresh } =
		useForkConnections();
	const [url, setUrl] = useState<string | null>(null);
	const brokerUrl =
		url ??
		data?.brokerUrl ??
		connections.find((c) => c.brokerUrl)?.brokerUrl ??
		"";
	const [attemptId, setAttemptId] = useState<string | null>(null);
	const discovery = useMutation({
		mutationFn: () =>
			client!.forkConnections.setBrokerUrl.mutate({ url: brokerUrl }),
		onSuccess: () => void refresh(),
	});
	const start = useMutation({
		mutationFn: ({
			providers,
			connectionId,
		}: {
			providers: ForkProviderId[];
			connectionId?: string;
		}) =>
			client!.forkConnections.startOAuth.mutate({
				url: brokerUrl,
				providers,
				connectionId,
			}),
		onSuccess: (result) => {
			setAttemptId(result.attemptId);
			window.open(result.url, "_blank", "noopener,noreferrer");
		},
	});
	const pending = useQuery({
		queryKey: ["fork-integrations", "oauth", attemptId],
		queryFn: () =>
			client!.forkConnections.oauthStatus.query({ attemptId: attemptId! }),
		enabled: !!client && !!attemptId,
		refetchInterval: (q) =>
			q.state.data?.status === "pending" ||
			q.state.data?.status === "exchanging" ||
			!q.state.data
				? 1500
				: false,
		retry: false,
	});
	useEffect(() => {
		if (pending.data?.status !== "complete") return;
		const ids = pending.data.connectionIds;
		setAttemptId(null);
		void Promise.all(
			ids.map((id) => client!.forkConnections.verify.mutate({ id })),
		).finally(() => void refresh());
	}, [pending.data, client, refresh]);
	if (isError || !client)
		return (
			<div className="rounded-lg border p-4 text-sm text-muted-foreground">
				<Trans>Update this host to configure integrations.</Trans>
			</div>
		);
	if (isPending)
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>Loading...</Trans>
			</p>
		);
	return (
		<div className="space-y-5" data-testid="fork-integrations">
			<div>
				<h2 className="text-lg font-semibold">
					<Trans>Connections</Trans>
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					<Trans>Connect your repositories and tasks on this computer.</Trans>
				</p>
			</div>
			<div className="grid items-start gap-4 lg:grid-cols-3">
				{FORK_PROVIDERS.map((provider) => (
					<ForkConnectionCard
						key={provider}
						provider={provider}
						brokerUrl={brokerUrl}
						onOAuth={(providers, connectionId) =>
							start.mutate({ providers, connectionId })
						}
					/>
				))}
			</div>
			<section className="space-y-3 rounded-xl border bg-muted/20 p-5">
				<div>
					<h3 className="text-sm font-medium">
						<Trans>OAuth service</Trans>
					</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						<Trans>One service can connect both Jira and Bitbucket.</Trans>
					</p>
				</div>
				<Label htmlFor="fork-oauth-url">
					<Trans>Service URL</Trans>
				</Label>
				<div className="flex flex-wrap gap-2">
					<Input
						id="fork-oauth-url"
						className="min-w-48 flex-1"
						type="url"
						value={brokerUrl}
						placeholder="https://auth.example.com"
						onChange={(e) => {
							setUrl(e.target.value);
							discovery.reset();
						}}
					/>
					<Button
						variant="outline"
						disabled={!client || !brokerUrl || discovery.isPending}
						onClick={() => discovery.mutate()}
					>
						<Trans>Verify</Trans>
					</Button>
				</div>
				{discovery.data && (
					<div className="flex flex-wrap items-center gap-3 text-sm">
						<span>
							{discovery.data.providers
								.map((p) =>
									p === "jira"
										? "Jira"
										: p === "bitbucket"
											? "Bitbucket"
											: "GitHub",
								)
								.join(" · ")}
						</span>
						{discovery.data.providers.includes("jira") &&
							discovery.data.providers.includes("bitbucket") && (
								<Button
									size="sm"
									disabled={start.isPending}
									onClick={() =>
										start.mutate({ providers: ["jira", "bitbucket"] })
									}
								>
									<Trans>Connect Jira and Bitbucket</Trans>
								</Button>
							)}
					</div>
				)}
				{attemptId && (
					<output className="text-sm">
						<Trans>Complete authorization in your browser.</Trans>
					</output>
				)}
				{(discovery.error ||
					start.error ||
					pending.data?.status === "error") && (
					<p role="alert" className="text-xs text-destructive">
						{discovery.error?.message ??
							start.error?.message ??
							t({ message: "Authorization failed" })}
					</p>
				)}
			</section>
		</div>
	);
}
