import { Trans } from "@lingui/react/macro";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import type { useForkTaskTransition } from "../../hooks/useForkTaskTransition";
import { ForkTaskTransitionForm } from "./components/ForkTaskTransitionForm/ForkTaskTransitionForm";

export function ForkTaskTransitionDialog({
	change,
	onCancel,
}: {
	change: ReturnType<typeof useForkTaskTransition>;
	onCancel?: () => void;
}) {
	const transition = change.requiredTransition;
	const cancel = () => {
		change.setRequiredTransition(null);
		change.mutation.reset();
		onCancel?.();
	};
	return (
		<Dialog
			open={!!transition}
			onOpenChange={(open) => {
				if (!open && !change.mutation.isPending) cancel();
			}}
		>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>{transition?.to?.name ?? transition?.name}</DialogTitle>
					<DialogDescription>
						<Trans>
							Complete the transition fields, then confirm the status change.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				{transition && (
					<ForkTaskTransitionForm
						key={`${change.task?.key}:${transition.id}`}
						change={change}
						transition={transition}
						onCancel={cancel}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
