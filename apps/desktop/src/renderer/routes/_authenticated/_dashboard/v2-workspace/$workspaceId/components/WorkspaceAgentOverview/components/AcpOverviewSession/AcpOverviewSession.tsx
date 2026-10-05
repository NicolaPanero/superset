import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { TerminalPaneData } from "../../../../types";

export function AcpOverviewSession({
	data,
	status,
	onOpen,
}: {
	data: TerminalPaneData;
	status: string;
	onOpen: () => void;
}) {
	const { t } = useLingui();
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
				<Trans>Account</Trans>:{" "}
				{data.acpAccountSelection === null
					? t({ message: "System default" })
					: data.acpAccountSelection
						? t({ message: "Selected account" })
						: t({ message: "Managed by the CLI" })}
			</p>
			<Button variant="outline" size="sm" onClick={onOpen}>
				<Trans>Open session</Trans>
			</Button>
		</div>
	);
}
