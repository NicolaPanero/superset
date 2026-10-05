import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { TerminalPaneData } from "../../../../types";

export function AcpOverviewSession({
	agent,
	data,
	hostUrl,
	status,
	onOpen,
}: {
	agent: string;
	data: TerminalPaneData;
	hostUrl: string | null;
	status: string;
	onOpen: () => void;
}) {
	const { t } = useLingui();
	const selection = data.acpAccountSelection;
	const options = useQuery({
		queryKey: ["agent-launch-account-options", hostUrl, agent],
		enabled: !!hostUrl && selection !== undefined,
		queryFn: () =>
			hostUrl
				? getHostServiceClientByUrl(hostUrl).agents.accountOptions.query({
						agent,
					})
				: [],
		retry: false,
		staleTime: 30_000,
	});
	const option = options.data?.find((o) => o.selection === selection);
	const accountLabel =
		selection === undefined
			? t({ message: "Managed by the CLI" })
			: (option?.alias ??
				(selection === null
					? t({ message: "System default" })
					: (option?.label ?? t({ message: "Selected account" }))));
	const label =
		status === "closed"
			? t({ message: "Closed" })
			: status === "running"
				? t({ message: "Running" })
				: status === "awaiting_input"
					? t({ message: "Awaiting permission" })
					: status === "dead"
						? t({ message: "Failed" })
						: t({ message: "Idle" });
	return (
		<div
			className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs"
			data-agent-session={data.terminalId}
		>
			<p className="font-medium">
				{label} · <Trans>ACP chat</Trans>
			</p>
			<p className="break-words">
				<Trans>Launch model</Trans>:{" "}
				{data.chatModelId ?? t({ message: "CLI default" })}
			</p>
			<p className="break-words">
				<Trans>Account</Trans>: {accountLabel}
			</p>
			<Button variant="outline" size="sm" onClick={onOpen}>
				<Trans>Open session</Trans>
			</Button>
		</div>
	);
}
