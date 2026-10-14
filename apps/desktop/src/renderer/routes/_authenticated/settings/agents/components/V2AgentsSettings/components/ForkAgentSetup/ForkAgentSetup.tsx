import { Trans, useLingui } from "@lingui/react/macro";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { quoteShellToken } from "renderer/lib/argv";
import { CommandTerminal } from "renderer/routes/_authenticated/components/CommandTerminal";
import { useForkAgentSetup } from "./hooks/useForkAgentSetup";

export function ForkAgentSetup({
	hostUrl,
	config,
	onChanged,
	onAdvanced,
	useSetup = useForkAgentSetup,
	Terminal = CommandTerminal,
}: {
	hostUrl: string | null;
	config: HostAgentConfig;
	onChanged: (config: HostAgentConfig) => void;
	onAdvanced: () => void;
	useSetup?: typeof useForkAgentSetup;
	Terminal?: typeof CommandTerminal;
}) {
	const { t } = useLingui();
	const fieldId = useId();
	const setup = useSetup(hostUrl, config);
	const [expanded, setExpanded] = useState(false);
	const [api, setApi] = useState(false);
	const [key, setKey] = useState("");
	const [model, setModel] = useState("grok-4.7");
	const [command, setCommand] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [failed, setFailed] = useState(false);
	const data = setup.isError ? undefined : setup.data;
	const isGrok = config.presetId === "grok";
	const busy = setup.apply.isPending || setup.isFetching;
	const configured =
		!!data?.command &&
		data.chat &&
		(data.auth === "api" || data.auth === "login");
	const status = !hostUrl
		? t({ message: "Host offline" })
		: setup.isPending
			? t({ message: "Checking…" })
			: setup.isError
				? t({ message: "Guided setup unavailable" })
				: !data?.command
					? t({ message: "CLI not found" })
					: !data.chat
						? t({ message: "CLI installed" })
						: data.auth === "missing"
							? t({ message: "Sign in to continue" })
							: data.auth === "unknown"
								? t({ message: "Check sign-in" })
								: data.auth === "api"
									? t({ message: "API key configured" })
									: t({ message: "Ready" });
	const begin = (nextCommand: string) => {
		setFailed(false);
		setSaved(false);
		setCommand(nextCommand);
	};
	const save = () => {
		setFailed(false);
		setSaved(false);
		const credentials = api
			? { key: key.trim(), model: model.trim() }
			: undefined;
		setKey("");
		setup.apply.mutate(credentials, {
			onSuccess: (updated) => {
				setKey("");
				setSaved(true);
				if (updated) onChanged(updated);
			},
			onError: () => {
				setKey("");
				setFailed(true);
			},
			onSettled: () => setup.apply.reset(),
		});
	};
	const installer = isGrok
		? "curl -fsSL https://x.ai/cli/install.sh | sh"
		: "curl -fsSL https://cursor.com/install | bash";
	return (
		<div className="rounded-lg border px-4 py-3" data-fork-agent-setup>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2 text-sm">
					{busy ? (
						<Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
					) : configured ? (
						<Check className="size-3.5 text-green-500" aria-hidden="true" />
					) : null}
					<span>{status}</span>
					{data?.version && (
						<span className="text-xs text-muted-foreground">
							{data.version}
						</span>
					)}
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setExpanded(!expanded)}
					aria-expanded={expanded}
				>
					<Trans>Configure</Trans>
					<ChevronDown
						className={`size-3.5 ${expanded ? "rotate-180" : ""}`}
						aria-hidden="true"
					/>
				</Button>
			</div>
			{expanded && (
				<div className="mt-3 space-y-3 border-t pt-3 text-sm">
					{setup.isError || !hostUrl ? (
						<p className="text-muted-foreground">
							<Trans>
								Update this host for guided setup, or use advanced
								configuration.
							</Trans>
						</p>
					) : !data?.command ? (
						<>
							<p className="text-muted-foreground">
								<Trans>Install the official CLI, then check again.</Trans>
							</p>
							<Button
								size="sm"
								disabled={busy || !hostUrl}
								onClick={() => begin(installer)}
							>
								<Trans>Install CLI</Trans>
							</Button>
						</>
					) : (
						<>
							<p className="text-xs text-muted-foreground break-all">
								{data.command}
							</p>
							{!data.chat && (
								<p className="text-muted-foreground">
									<Trans>Chat support is checked when you open a chat.</Trans>
								</p>
							)}
							<div className="flex flex-wrap gap-2">
								<Button
									size="sm"
									variant="outline"
									disabled={busy}
									onClick={() =>
										begin(
											`${config.env.GROK_HOME && isGrok ? `GROK_HOME=${quoteShellToken(config.env.GROK_HOME)} ` : ""}${quoteShellToken(data.command as string)} login`,
										)
									}
								>
									<Trans>Sign in</Trans>
								</Button>
								{isGrok && (
									<Button
										size="sm"
										variant="outline"
										disabled={busy}
										onClick={() => {
											setApi(!api);
											setKey("");
											setSaved(false);
											setFailed(false);
										}}
									>
										<Trans>Use an API key</Trans>
									</Button>
								)}
							</div>
							{api && (
								<div className="space-y-2 rounded-md bg-muted/40 p-3">
									<p className="text-xs text-muted-foreground">
										<Trans>
											Uses the xAI API with separate billing. Each person
											supplies their own key.
										</Trans>
									</p>
									{data.modelOverrides ? (
										<p className="text-xs">
											<Trans>
												The CLI already has custom model settings. Edit them in
												advanced configuration.
											</Trans>
										</p>
									) : (
										<>
											<label
												htmlFor={`${fieldId}-key`}
												className="block space-y-1"
											>
												<span>
													<Trans>API key</Trans>
												</span>
												<Input
													id={`${fieldId}-key`}
													type="password"
													autoComplete="off"
													value={key}
													onChange={(event) => setKey(event.target.value)}
												/>
											</label>
											<label
												htmlFor={`${fieldId}-model`}
												className="block space-y-1"
											>
												<span>
													<Trans>Model</Trans>
												</span>
												<Input
													id={`${fieldId}-model`}
													value={model}
													onChange={(event) => setModel(event.target.value)}
												/>
											</label>
										</>
									)}
								</div>
							)}
							<p className="text-xs text-muted-foreground">
								<Trans>
									Recommended settings replace launch commands and arguments.
									Names, hooks and other environment settings are kept. Applies
									to new launches.
								</Trans>
							</p>
							<Button
								size="sm"
								disabled={
									busy ||
									(api &&
										(data.modelOverrides ||
											!key.trim() ||
											!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(model.trim())))
								}
								onClick={save}
							>
								<Trans>Apply recommended settings</Trans>
							</Button>
						</>
					)}
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="ghost"
							disabled={busy || !hostUrl}
							onClick={() => {
								setFailed(false);
								void setup.refetch();
							}}
						>
							<Trans>Check again</Trans>
						</Button>
						<Button size="sm" variant="ghost" onClick={onAdvanced}>
							<Trans>Advanced configuration</Trans>
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						<Trans>
							Checks installation and local sign-in without sending a prompt.
							API keys are not validated with a paid request.
						</Trans>
					</p>
					{saved && (
						<output className="block text-xs">
							<Trans>
								Settings applied. Existing chats keep their configuration.
							</Trans>
						</output>
					)}
					{failed && (
						<p role="alert" className="text-xs text-destructive">
							<Trans>
								Setup could not be applied. Check again or use advanced
								configuration.
							</Trans>
						</p>
					)}
				</div>
			)}
			<Dialog
				open={!!command}
				onOpenChange={(open) => {
					if (!open) {
						setCommand(null);
						void setup.refetch();
					}
				}}
			>
				<DialogContent
					className="sm:max-w-2xl"
					onPointerDownOutside={(event) => event.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>
							<Trans>Agent setup</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>
								Complete the official CLI flow, then close this window to check
								the result.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					{command && (
						<div className="h-72 overflow-hidden rounded-md border bg-background">
							<Terminal
								command={command}
								onExit={() => {
									void setup.refetch();
								}}
							/>
						</div>
					)}
					<Button
						variant="outline"
						onClick={() => {
							setCommand(null);
							void setup.refetch();
						}}
					>
						<Trans>Done</Trans>
					</Button>
				</DialogContent>
			</Dialog>
		</div>
	);
}
