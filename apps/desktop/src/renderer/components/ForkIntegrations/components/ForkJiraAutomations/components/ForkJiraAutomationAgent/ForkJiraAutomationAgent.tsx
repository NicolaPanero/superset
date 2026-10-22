import { Trans, useLingui } from "@lingui/react/macro";
import {
	getAgentModelSupport,
	resolveAgentLaunchPresetId,
} from "@superset/shared/agent-models";
import { Label } from "@superset/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { useForkConnections } from "../../../../hooks/useForkConnections";
import { required } from "../../../../utils/required";

export interface ForkJiraAgentChoice {
	agent: string;
	surface: "terminal" | "chat";
	model?: string;
	accountSelection?: string;
}

export function ForkJiraAutomationAgent({
	value,
	onChange,
	supported,
}: {
	value: ForkJiraAgentChoice;
	onChange: (value: ForkJiraAgentChoice) => void;
	supported: boolean;
}) {
	const { t } = useLingui();
	const { client, hostUrl } = useForkConnections();
	const agents = useV2AgentConfigs(hostUrl);
	const config = agents.data?.find((a) => a.id === value.agent);
	const preset = config
		? resolveAgentLaunchPresetId(config.presetId, config.command)
		: null;
	const models = preset ? (getAgentModelSupport(preset)?.models ?? []) : [];
	const hasAccounts = preset === "claude" || preset === "codex";
	const accounts = useQuery({
		queryKey: ["fork-account-options", hostUrl, preset],
		queryFn: () =>
			required(client).agents.accountOptions.query({
				agent: required(preset),
				isolated: true,
			}),
		enabled: supported && hasAccounts && !!client,
		retry: false,
	});
	const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";
	return (
		<div className="grid grid-cols-2 gap-3">
			<div className="space-y-1.5">
				<Label htmlFor="jira-rule-agent">
					<Trans>Agent</Trans>
				</Label>
				<select
					id="jira-rule-agent"
					required
					className={selectClass}
					value={value.agent}
					onChange={(e) =>
						onChange({ agent: e.target.value, surface: value.surface })
					}
				>
					<option value="" />
					{agents.data?.map((a) => (
						<option key={a.id} value={a.id}>
							{a.label}
						</option>
					))}
				</select>
			</div>
			{supported && (
				<>
					<div className="space-y-1.5">
						<Label htmlFor="jira-rule-surface">
							<Trans>Open in</Trans>
						</Label>
						<select
							id="jira-rule-surface"
							className={selectClass}
							value={value.surface}
							onChange={(e) =>
								onChange({
									...value,
									surface: e.target.value as "terminal" | "chat",
								})
							}
						>
							<option value="chat">{t({ message: "ACP chat" })}</option>
							<option value="terminal">{t({ message: "Terminal" })}</option>
						</select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="jira-rule-model">
							<Trans>Model</Trans>
						</Label>
						<select
							id="jira-rule-model"
							className={selectClass}
							value={value.model ?? ""}
							disabled={!models.length}
							onChange={(e) =>
								onChange({ ...value, model: e.target.value || undefined })
							}
						>
							<option value="">{t({ message: "Default model" })}</option>
							{models.map((m) => (
								<option key={m.id} value={m.id}>
									{m.label}
								</option>
							))}
						</select>
					</div>
					{hasAccounts && (
						<div className="space-y-1.5">
							<Label htmlFor="jira-rule-account">
								<Trans>Account</Trans>
							</Label>
							<select
								id="jira-rule-account"
								className={selectClass}
								value={value.accountSelection ?? ""}
								disabled={accounts.isPending || accounts.isError}
								onChange={(e) =>
									onChange({
										...value,
										accountSelection: e.target.value || undefined,
									})
								}
							>
								<option value="">{t({ message: "Default account" })}</option>
								{accounts.data
									?.filter((a) => a.selection)
									.map((a) => (
										<option key={a.selection} value={a.selection ?? ""}>
											{a.label}
										</option>
									))}
							</select>
						</div>
					)}
				</>
			)}
			{(agents.error || accounts.error) && (
				<p role="alert" className="col-span-2 text-xs text-destructive">
					{(agents.error ?? accounts.error)?.message}
				</p>
			)}
		</div>
	);
}
