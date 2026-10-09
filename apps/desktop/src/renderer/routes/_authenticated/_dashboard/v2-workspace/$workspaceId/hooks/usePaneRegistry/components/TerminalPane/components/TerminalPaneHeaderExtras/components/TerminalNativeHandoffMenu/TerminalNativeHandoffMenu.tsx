import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { Bot, PanelRight, SquareStack } from "lucide-react";
import { useRef, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import type { CreateNewAgentSession } from "../../../../../../../useAgentSessionLauncher/useAgentSessionLauncher";

type Placement = "split-pane" | "new-tab";

/**
 * Native handoff of a terminal agent session with txcript. Context handoff
 * and forks stay in upstream's
 * TerminalSessionHandoffMenu.
 */
export function TerminalNativeHandoffMenu({
	workspaceId,
	terminalId,
	onCreateNewAgentSession,
}: {
	workspaceId: string;
	terminalId: string;
	onCreateNewAgentSession: CreateNewAgentSession;
}) {
	const { t } = useLingui();
	const [sourceTerminalId, setSourceTerminalId] = useState(terminalId);
	const binding = useTerminalAgentBinding(workspaceId, sourceTerminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const { data: workspace } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{ enabled: Boolean(binding) },
	);
	const [open, setOpen] = useState(false);
	const [targetConfigId, setTargetConfigId] = useState("");
	const [placement, setPlacement] = useState<Placement>("split-pane");
	const [transferId, setTransferId] = useState(() => crypto.randomUUID());
	const [stage, setStage] = useState<"converting" | "launching" | null>(null);
	const [failed, setFailed] = useState(false);
	const runSequence = useRef(0);
	const prepareNative = workspaceTrpc.sessionTransfer.prepare.useMutation();
	const cancelNative = workspaceTrpc.sessionTransfer.cancel.useMutation();
	const { data: capabilities } =
		workspaceTrpc.sessionTransfer.capabilities.useQuery(undefined, {
			enabled: Boolean(workspaceId),
			retry: false,
			staleTime: 60_000,
		});

	const verified = (preset: string | undefined) =>
		Boolean(
			preset &&
				capabilities?.adapters.find((adapter) => adapter.agent === preset)
					?.verified,
		);
	const sourceConfig = configs.find(
		(config) =>
			config.id === (binding?.definitionId ?? binding?.agentId) ||
			config.presetId === binding?.agentId,
	);
	const targets = configs.filter(
		(config) =>
			config.presetId !== binding?.agentId &&
			config.resumeArgs?.length &&
			verified(config.presetId),
	);
	const target = targets.find((config) => config.id === targetConfigId);
	const available = Boolean(
		capabilities?.nativeAvailable &&
			binding?.agentSessionId &&
			verified(binding?.agentId),
	);

	const openFor = (id: string) => {
		setSourceTerminalId(id);
		setTargetConfigId("");
		setTransferId(crypto.randomUUID());
		setFailed(false);
		setStage(null);
		setOpen(true);
	};

	if (!binding && !open) return null;

	const start = async () => {
		if (!target || !binding) return;
		const run = ++runSequence.current;
		setFailed(false);
		setStage("converting");
		try {
			const transfer = await prepareNative.mutateAsync({
				workspaceId,
				terminalId: sourceTerminalId,
				targetConfigId: target.id,
				transferId,
			});
			if (run !== runSequence.current) return;
			setStage("launching");
			const result = await onCreateNewAgentSession({
				configId: target.id,
				placement,
				prompt: "",
				nativeTransferId: transfer.transferId,
			});
			if (!result) {
				setFailed(true);
				return;
			}
			setOpen(false);
			toast.success(t({ message: "Native handoff complete" }), {
				duration: 15_000,
				description: (
					<div className="flex flex-col gap-1">
						<span>
							{sourceConfig?.label ?? binding.agentId} → {target.label}
						</span>
						<code className="break-all text-xs">
							{transfer.targetSessionId}
						</code>
						{transfer.warnings.length > 1 && (
							<span>
								{t({
									message:
										"Some agent-specific metadata could not be transferred.",
								})}
							</span>
						)}
					</div>
				),
			});
		} catch {
			if (run === runSequence.current) setFailed(true);
		} finally {
			if (run === runSequence.current) {
				setStage(null);
				setTransferId(crypto.randomUUID());
			}
		}
	};

	return (
		<>
			{binding && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Continue with another agent" })}
							onClick={() => {
								setPlacement("split-pane");
								openFor(terminalId);
							}}
							className="hidden rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground @min-[200px]/pane-header:block"
						>
							<Bot className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Continue with another agent</Trans>
					</TooltipContent>
				</Tooltip>
			)}
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next && stage !== "launching") setOpen(false);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							<Trans>Continue with another agent</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Create a resumable session with the conversation history.
								Permissions and credentials stay with the target agent.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4 py-1">
						{!available && (
							<p className="text-muted-foreground text-xs">
								<Trans>
									Native handoff is unavailable for this agent pair or host.
								</Trans>
							</p>
						)}
						{failed && (
							<p role="alert" className="text-destructive text-sm">
								<Trans>Native handoff failed. You can retry.</Trans>
							</p>
						)}
						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Target agent</Trans>
							</Label>
							<AgentSelect
								agents={targets.map((config) => ({
									id: config.id,
									label: config.label,
									iconId: config.presetId,
									presetId: config.presetId,
								}))}
								value={targetConfigId}
								placeholder={t({ message: "Select an agent" })}
								onValueChange={(id) => {
									setTargetConfigId(id);
									setTransferId(crypto.randomUUID());
									setFailed(false);
								}}
								disabled={stage !== null || targets.length === 0}
								triggerClassName="w-full"
								onBeforeConfigureAgents={() => setOpen(false)}
							/>
						</div>
						<dl className="rounded-md border bg-muted/30 p-3 text-xs">
							<dt className="text-muted-foreground">
								<Trans>Source</Trans>
							</dt>
							<dd>{sourceConfig?.label ?? binding?.agentId ?? "—"}</dd>
							<dt className="mt-2 text-muted-foreground">
								<Trans>Session</Trans>
							</dt>
							<dd className="break-all font-mono">
								{binding?.agentSessionId ?? "—"}
							</dd>
							{workspace?.worktreePath && (
								<>
									<dt className="mt-2 text-muted-foreground">
										<Trans>Workspace</Trans>
									</dt>
									<dd className="break-all font-mono">
										{workspace.worktreePath}
									</dd>
								</>
							)}
						</dl>
						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Open session in</Trans>
							</Label>
							<div className="grid grid-cols-2 gap-2" role="radiogroup">
								<Button
									type="button"
									variant={placement === "split-pane" ? "secondary" : "outline"}
									onClick={() => setPlacement("split-pane")}
									aria-pressed={placement === "split-pane"}
									disabled={stage !== null}
								>
									<PanelRight />
									<Trans>Split pane</Trans>
								</Button>
								<Button
									type="button"
									variant={placement === "new-tab" ? "secondary" : "outline"}
									onClick={() => setPlacement("new-tab")}
									aria-pressed={placement === "new-tab"}
									disabled={stage !== null}
								>
									<SquareStack />
									<Trans>New tab</Trans>
								</Button>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							disabled={stage === "launching"}
							onClick={() => {
								if (stage === "converting") {
									++runSequence.current;
									cancelNative.mutate({ transferId });
									setStage(null);
									setTransferId(crypto.randomUUID());
								}
								setOpen(false);
							}}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							onClick={start}
							disabled={stage !== null || !available || !target}
						>
							{stage === "converting" ? (
								<Trans>Converting…</Trans>
							) : stage === "launching" ? (
								<Trans>Launching…</Trans>
							) : (
								<Trans>Continue</Trans>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
