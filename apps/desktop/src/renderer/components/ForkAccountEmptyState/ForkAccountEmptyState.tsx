import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { AddAccountDialog } from "renderer/routes/_authenticated/settings/usage/components/UsageView/components/AddAccountDialog";

export function ForkAccountEmptyState({
	hostUrl,
	agent,
	onAccountAdded,
}: {
	hostUrl: string | null;
	agent: "claude" | "codex";
	onAccountAdded: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="space-y-2 text-xs text-muted-foreground">
			<p>
				<Trans>Add an account to start chatting.</Trans>
			</p>
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={!hostUrl}
				onClick={() => setOpen(true)}
			>
				<Trans>Add account</Trans>
			</Button>
			{open && (
				<AddAccountDialog
					open
					hostUrl={hostUrl}
					agent={agent}
					onOpenChange={setOpen}
					onAccountAdded={onAccountAdded}
					onDefaultSwitched={onAccountAdded}
				/>
			)}
		</div>
	);
}
