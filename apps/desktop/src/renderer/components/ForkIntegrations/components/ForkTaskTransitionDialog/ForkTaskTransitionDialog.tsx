import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { useState } from "react";
import type { useForkTaskTransition } from "../../hooks/useForkTaskTransition";
import { ForkTransitionFields } from "../ForkTransitionFields/ForkTransitionFields";

export function ForkTaskTransitionDialog({
	change,
	onCancel,
}: {
	change: ReturnType<typeof useForkTaskTransition>;
	onCancel?: () => void;
}) {
	const [values, setValues] = useState<Record<string, unknown>>({});
	const transition = change.requiredTransition;
	const cancel = () => {
		change.setRequiredTransition(null);
		setValues({});
		onCancel?.();
	};
	return (
		<Dialog
			open={!!transition}
			onOpenChange={(open) => {
				if (!open && !change.mutation.isPending) {
					cancel();
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{transition?.to?.name ?? transition?.name}</DialogTitle>
					<DialogDescription>
						<Trans>Complete the required fields to change status.</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (transition)
							change.mutation.mutate({ transition, fields: values });
					}}
				>
					<ForkTransitionFields
						fields={transition?.fields ?? []}
						values={values}
						onChange={setValues}
					/>
					{change.mutation.error && (
						<p role="alert" className="text-xs text-destructive">
							{errorMessage(change.mutation.error)}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							disabled={change.mutation.isPending}
							onClick={() => {
								cancel();
							}}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" disabled={change.mutation.isPending}>
							<Trans>Save</Trans>
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
