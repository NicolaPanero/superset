import { Trans, useLingui } from "@lingui/react/macro";
import {
	FORK_PROVIDERS,
	type ForkProviderId,
} from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { ForkConnectionCard } from "./components/ForkConnectionCard/ForkConnectionCard";
import { ForkServiceNotices } from "./components/ForkServiceNotices";
import { useForkConnections } from "./hooks/useForkConnections";
import { required } from "./utils/required";

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
	const [oauthOpen, setOauthOpen] = useState(false);
	const oauthInput = useRef<HTMLInputElement>(null);
	const setupOAuth = () => {
		setOauthOpen(true);
		setTimeout(() => {
			oauthInput.current?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
			oauthInput.current?.focus({ preventScroll: true });
		}, 50);
	};
	const discovery = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: () =>
			required(client).forkConnections.setBrokerUrl.mutate({ url: brokerUrl }),
		onSuccess: () => void refresh(),
	});
	const start = useMutation({
		networkMode: "always",
		retry: false,
		mutationFn: ({
			providers,
			connectionId,
		}: {
			providers: ForkProviderId[];
			connectionId?: string;
		}) =>
			required(client).forkConnections.startOAuth.mutate({
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
		refetchOnReconnect: true,
		networkMode: "always",
		retry: false,
		queryKey: ["fork-integrations", "oauth", attemptId],
		queryFn: () =>
			required(client).forkConnections.oauthStatus.query({
				attemptId: required(attemptId),
			}),
		enabled: !!client && !!attemptId,
		refetchInterval: (q) =>
			q.state.data?.status === "pending" ||
			q.state.data?.status === "exchanging" ||
			!q.state.data
				? 1500
				: false,
	});
	useEffect(() => {
		if (pending.data?.status !== "complete") return;
		const ids = pending.data.connectionIds;
		setAttemptId(null);
		void Promise.all(
			ids.map((id) => required(client).forkConnections.verify.mutate({ id })),
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
	const oauthFailed =
		discovery.error || start.error || pending.data?.status === "error";
	return (
		<section className="space-y-3" data-testid="fork-integrations">
			<ForkServiceNotices sidebar={false} />
			<div>
				<h3 className="text-base font-semibold">
					<Trans>Connections</Trans>
				</h3>
				<p className="mt-0.5 text-xs text-muted-foreground">
					<Trans>Connect your repositories and tasks on this computer.</Trans>
				</p>
			</div>
			<div className="divide-y rounded-lg border">
				{FORK_PROVIDERS.map((provider) => (
					<ForkConnectionCard
						key={provider}
						provider={provider}
						brokerUrl={brokerUrl}
						onOAuth={(providers, connectionId) =>
							start.mutate({ providers, connectionId })
						}
						onSetupOAuth={setupOAuth}
					/>
				))}
			</div>
			<Collapsible
				open={oauthOpen || !!attemptId || !!oauthFailed}
				onOpenChange={setOauthOpen}
				className="rounded-lg border"
			>
				<CollapsibleTrigger className="group flex w-full items-center gap-3 px-5 py-3 text-left">
					<HiChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium">
							<Trans>OAuth service</Trans>
						</p>
						<p className="mt-0.5 truncate text-xs text-muted-foreground">
							{brokerUrl || (
								<Trans>One service can connect both Jira and Bitbucket.</Trans>
							)}
						</p>
					</div>
					<span className="text-xs text-muted-foreground">
						<Trans>Advanced</Trans>
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent className="space-y-3 border-t px-5 py-4">
					<Label htmlFor="fork-oauth-url">
						<Trans>Service URL</Trans>
					</Label>
					<div className="flex flex-wrap gap-2">
						<Input
							ref={oauthInput}
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
						<output className="block text-sm">
							<Trans>Complete authorization in your browser.</Trans>
						</output>
					)}
					{oauthFailed && (
						<p role="alert" className="text-xs text-destructive">
							{discovery.error?.message ??
								start.error?.message ??
								t({ message: "Authorization failed" })}
						</p>
					)}
				</CollapsibleContent>
			</Collapsible>
		</section>
	);
}
