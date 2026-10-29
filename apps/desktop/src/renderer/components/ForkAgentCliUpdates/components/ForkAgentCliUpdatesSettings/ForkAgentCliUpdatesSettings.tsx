import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useForkAgentCliUpdates } from "../../hooks/useForkAgentCliUpdates";

export function ForkAgentCliUpdatesSettings() {
	const { supported, status, checkNow, setEnabled, update } =
		useForkAgentCliUpdates();
	if (!supported) return null;
	const enabled = status.data?.enabled ?? true;
	const agents = checkNow.data?.agents ?? status.data?.agents ?? [];
	return (
		<div className="divide-y rounded-lg border">
			<div className="flex items-center justify-between gap-6 px-5 py-4">
				<div className="space-y-1">
					<Label htmlFor="fork-agent-cli-updates">
						<Trans>Check for agent updates every day</Trans>
					</Label>
					<p className="text-xs text-muted-foreground">
						<Trans>
							Paradev++ looks for new versions once a day and shows a popup. It
							never updates anything by itself.
						</Trans>
					</p>
				</div>
				<Switch
					id="fork-agent-cli-updates"
					checked={enabled}
					onCheckedChange={(value) => setEnabled.mutate(value)}
				/>
			</div>
			{agents.map((agent) => {
				const { installed, latest } = agent;
				return (
					<div
						key={agent.id}
						className="flex items-center justify-between gap-6 px-5 py-3"
					>
						<div className="min-w-0 space-y-0.5">
							<p className="text-sm font-medium">{agent.label}</p>
							<p className="text-xs text-muted-foreground">
								{agent.installed === null ? (
									<Trans>Not installed on this computer.</Trans>
								) : agent.newer ? (
									<Trans>
										Version {installed}, {latest} is available.
									</Trans>
								) : (
									<Trans>Version {installed}, up to date.</Trans>
								)}
							</p>
							{agent.newer && agent.command && (
								<p className="truncate font-mono text-[11px] text-muted-foreground">
									{agent.command}
								</p>
							)}
							{agent.newer && !agent.command && (
								<p className="text-xs text-muted-foreground">
									<Trans>
										Update it with the same tool you used to install it.
									</Trans>
								</p>
							)}
						</div>
						{agent.newer && agent.command && (
							<Button
								size="sm"
								disabled={update.isPending}
								onClick={() =>
									update.mutate(agent.id as "claude" | "codex", {
										onError: (error) => toast.error(errorMessage(error)),
									})
								}
							>
								{update.isPending && update.variables === agent.id ? (
									<Trans>Updating…</Trans>
								) : (
									<Trans>Update</Trans>
								)}
							</Button>
						)}
					</div>
				);
			})}
			<div className="flex items-center justify-between gap-6 px-5 py-3">
				<p className="text-xs text-muted-foreground">
					{checkNow.error ? errorMessage(checkNow.error) : null}
				</p>
				<Button
					size="sm"
					variant="outline"
					disabled={checkNow.isPending}
					onClick={() => checkNow.mutate()}
				>
					{checkNow.isPending ? (
						<Trans>Checking…</Trans>
					) : (
						<Trans>Check now</Trans>
					)}
				</Button>
			</div>
		</div>
	);
}
