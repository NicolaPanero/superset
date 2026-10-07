import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { type ReactNode, useState } from "react";
import { useAgentAccountAliases } from "renderer/hooks/host-service/useAgentAccountAliases";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { isManagedAgent } from "../../utils/visibleQuotaAgents";

/** Local display names for Claude and Codex accounts, and the dialog that edits them. */
export function useAccountRename(hostUrl: string | null): {
	aliasFor: (account: UsageAccount) => string | undefined;
	onRename: (account: UsageAccount) => (() => void) | undefined;
	dialog: ReactNode;
} {
	const { t } = useLingui();
	const aliases = useAgentAccountAliases(hostUrl);
	const [target, setTarget] = useState<UsageAccount | null>(null);
	const [label, setLabel] = useState("");
	const aliasFor = (account: UsageAccount) =>
		aliases.data?.find(
			(alias) =>
				alias.agent === account.agent && alias.selection === account.selection,
		)?.label;

	const dialog = (
		<Dialog
			open={target !== null}
			onOpenChange={(open) => {
				if (!open && !aliases.rename.isPending) setTarget(null);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						<Trans>Rename account</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Saved on this host. Leave empty to use the original name.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (
							!target ||
							!isManagedAgent(target.agent) ||
							aliases.rename.isPending
						)
							return;
						aliases.rename.mutate(
							{
								agent: target.agent,
								selection: target.selection,
								label: label || null,
							},
							{
								onSuccess: () => setTarget(null),
								onError: () =>
									toast.error(t({ message: "Could not rename this account." })),
							},
						);
					}}
					className="space-y-4"
				>
					<Input
						aria-label={t({ message: "Account name" })}
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						maxLength={64}
						disabled={aliases.rename.isPending}
					/>
					<Button type="submit" disabled={aliases.rename.isPending}>
						<Trans>Save</Trans>
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);

	return {
		aliasFor,
		onRename: (account) =>
			isManagedAgent(account.agent) && aliases.isSuccess
				? () => {
						setTarget(account);
						setLabel(aliasFor(account) ?? "");
					}
				: undefined,
		dialog,
	};
}
