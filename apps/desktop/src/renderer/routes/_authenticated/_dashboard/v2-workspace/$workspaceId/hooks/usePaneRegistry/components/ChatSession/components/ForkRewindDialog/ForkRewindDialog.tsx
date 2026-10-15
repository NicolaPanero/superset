import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";

export function ForkRewindDialog({
	open,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Rewind conversation?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							Return to before this message and put its text back in the draft.
							The original conversation is kept in history. Files stay unchanged
							because this agent does not expose file restore over ACP.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						<Trans>Rewind chat only</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
