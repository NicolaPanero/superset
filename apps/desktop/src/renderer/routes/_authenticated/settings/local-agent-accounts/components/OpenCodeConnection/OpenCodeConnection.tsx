import { Trans } from "@lingui/react/macro";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useState } from "react";
import { quoteShellToken } from "renderer/lib/argv";
import { CommandTerminal } from "renderer/routes/_authenticated/components/CommandTerminal";
export function OpenCodeConnection({
	config,
	hostUrl,
	onChanged,
	allowLocalLogin,
	Terminal = CommandTerminal,
}: {
	config: HostAgentConfig;
	hostUrl: string | null;
	onChanged: () => Promise<void>;
	allowLocalLogin: boolean;
	Terminal?: typeof CommandTerminal;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="rounded-lg border p-3 space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
				<span>{config.label}</span>
				<Button
					size="sm"
					variant="outline"
					disabled={!hostUrl || !allowLocalLogin}
					onClick={() => setOpen(true)}
				>
					<Trans>Sign in</Trans>
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				<Trans>Quota is shown when the provider supports it.</Trans>
			</p>
			<Dialog
				open={open}
				onOpenChange={(value) => {
					setOpen(value);
					if (!value) void onChanged().catch(() => {});
				}}
			>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>OpenCode</DialogTitle>
						<DialogDescription>
							<Trans>
								Complete the official CLI flow, then close this window to check
								the result.
							</Trans>
						</DialogDescription>
					</DialogHeader>
					{open && (
						<div className="h-72 overflow-hidden rounded-md border">
							<Terminal
								command={`${quoteShellToken(config.command)} auth login`}
								onExit={() => {
									void onChanged().catch(() => {});
								}}
							/>
						</div>
					)}
					<Button
						variant="outline"
						onClick={() => {
							setOpen(false);
							void onChanged().catch(() => {});
						}}
					>
						<Trans>Done</Trans>
					</Button>
				</DialogContent>
			</Dialog>
		</div>
	);
}
