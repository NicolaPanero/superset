import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";

export function ForkAccountStopConfirm({
	accountName,
	switching,
	onConfirm,
	onCancel,
}: {
	accountName: string | null;
	switching: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<AlertDialog
			open={accountName !== null}
			onOpenChange={(open) => {
				if (!open && !switching) onCancel();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Stop the agent and switch to {accountName}?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							The current turn stops. The chat reopens on the new account with
							its full history.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button variant="outline" disabled={switching} onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
					<Button disabled={switching} onClick={onConfirm}>
						{switching ? (
							<Trans>Switching account…</Trans>
						) : (
							<Trans>Stop and switch account</Trans>
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
