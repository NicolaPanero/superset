import { Trans, useLingui } from "@lingui/react/macro";
import { getAgentModelSupport } from "@superset/shared/agent-models";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useRef, useState } from "react";
import { AgentModelSelect } from "renderer/components/AgentModelSelect";
import { AgentSelect } from "renderer/components/AgentSelect";
import { ForkAccountEmptyState } from "renderer/components/ForkAccountEmptyState";
import { ForkAccountPicker } from "renderer/components/ForkAccountPicker";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { useForkCliOptions } from "renderer/stores/fork-cli-options";
import type { CreateNewAgentSession } from "../../hooks/useAgentSessionLauncher";
import { useForkNewAgentAccount } from "./hooks/useForkNewAgentAccount";

export function ForkNewAgentDialog({
	open,
	onOpenChange,
	workspaceId,
	workspaceName,
	onCreateNewAgentSession,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: string;
	workspaceName: string;
	onCreateNewAgentSession: CreateNewAgentSession;
}) {
	const { t } = useLingui();
	const showCliOptions = useForkCliOptions();
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const [configId, setConfigId] = useState<string>();
	const [model, setModel] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const launchLock = useRef(false);
	const configs = useV2AgentConfigs(hostUrl);
	const peers = configs.data ?? [];
	const selected = peers.find(
		(config) => config.id === (configId ?? peers[0]?.id),
	);
	const models = selected
		? (getAgentModelSupport(selected.presetId)?.models ?? [])
		: [];
	const managed =
		selected?.presetId === "claude" || selected?.presetId === "codex";
	const account = useForkNewAgentAccount(
		hostUrl,
		selected?.id,
		selected?.presetId,
		open,
	);
	const accountMissing =
		managed &&
		!showCliOptions &&
		!account.forcedApi &&
		typeof account.selection !== "string";
	const selectConfig = (id: string) => {
		setConfigId(id);
		setModel(null);
	};
	const launchSession = async () => {
		if (!selected || accountMissing || launchLock.current) return;
		launchLock.current = true;
		setBusy(true);
		try {
			const result = await onCreateNewAgentSession({
				configId: selected.id,
				placement: "new-tab",
				prompt: "",

				...(model ? { modelId: model } : {}),
				...(managed && !account.forcedApi && account.selection !== undefined
					? { accountSelection: account.selection }
					: {}),
			});
			if (result) onOpenChange(false);
		} finally {
			launchLock.current = false;
			setBusy(false);
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (!busy) onOpenChange(value);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>New agent</Trans>
					</DialogTitle>
					<DialogDescription>{workspaceName}</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<p className="text-sm">
						<Trans>Agent</Trans>
					</p>
					<AgentSelect
						agents={peers.map((config) => ({
							id: config.id,
							label: config.label,
							iconId: config.iconId ?? config.presetId,
						}))}
						value={selected?.id}
						placeholder={t({ message: "Select agent" })}
						onValueChange={selectConfig}
						disabled={busy}
						onBeforeConfigureAgents={() => onOpenChange(false)}
					/>
				</div>
				{managed && (
					<div className="space-y-2">
						<p className="text-sm">
							<Trans>Account</Trans>
						</p>
						<ForkAccountPicker
							account={account}
							provider={selected?.presetId ?? null}
							model={model ?? undefined}
							disabled={busy}
						/>
						{account.options.isSuccess && accountMissing && selected && (
							<ForkAccountEmptyState
								hostUrl={hostUrl}
								agent={selected.presetId as "claude" | "codex"}
								onAccountAdded={() => {
									void account.options.refetch();
									void account.quota.refresh().catch(() => {});
									void account.refreshDefault();
								}}
							/>
						)}
					</div>
				)}
				{models.length > 0 && (
					<div className="space-y-2">
						<p className="text-sm">
							<Trans>Model</Trans>
						</p>
						<AgentModelSelect
							models={models}
							value={model}
							onValueChange={setModel}
							defaultLabel={t({ message: "CLI default" })}
							disabled={busy}
						/>
					</div>
				)}
				<div className="space-y-2">
					<p className="text-sm">
						<Trans>Workspace</Trans>
					</p>
					<p className="rounded-md border p-2 text-sm">{workspaceName}</p>
				</div>
				<Button
					onClick={() => void launchSession()}
					disabled={
						busy ||
						!selected ||
						accountMissing ||
						(managed && !account.options.isSuccess)
					}
				>
					{busy ? <Trans>Starting…</Trans> : <Trans>Start</Trans>}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
