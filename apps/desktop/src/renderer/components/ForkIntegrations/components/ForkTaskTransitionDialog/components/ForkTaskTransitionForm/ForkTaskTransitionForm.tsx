import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useState } from "react";
import type {
	ForkTaskTransition,
	useForkTaskTransition,
} from "../../../../hooks/useForkTaskTransition";
import { ForkTransitionFields } from "../../../ForkTransitionFields/ForkTransitionFields";

export function ForkTaskTransitionForm({
	change,
	transition,
	onCancel,
}: {
	change: ReturnType<typeof useForkTaskTransition>;
	transition: ForkTaskTransition;
	onCancel: () => void;
}) {
	const [values, setValues] = useState<Record<string, unknown>>({});
	const missing = transition.fields.some((field) => {
		if (!field.required) return false;
		const value = values[field.id];
		return (
			value === undefined ||
			value === null ||
			(typeof value === "string" && !value.trim()) ||
			(Array.isArray(value) && value.length === 0)
		);
	});
	return (
		<form
			className="space-y-5"
			onSubmit={(e) => {
				e.preventDefault();
				if (!missing && !change.mutation.isPending)
					change.mutation.mutate({ transition, fields: values });
			}}
		>
			<fieldset disabled={change.mutation.isPending} className="min-w-0">
				<ForkTransitionFields
					fields={transition.fields}
					values={values}
					onChange={setValues}
					task={change.task}
				/>
			</fieldset>
			{change.mutation.error && (
				<p
					role="alert"
					className="whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
				>
					{errorMessage(change.mutation.error)}
				</p>
			)}
			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
				{change.task && (
					<Button asChild type="button" size="sm" variant="ghost">
						<a href={change.task.url} target="_blank" rel="noreferrer">
							<Trans>Open in Jira</Trans>
							<ArrowUpRight className="size-3.5" aria-hidden />
						</a>
					</Button>
				)}
				<div className="ml-auto flex gap-2">
					<Button
						type="button"
						variant="ghost"
						disabled={change.mutation.isPending}
						onClick={onCancel}
					>
						<Trans>Cancel</Trans>
					</Button>
					<Button type="submit" disabled={change.mutation.isPending || missing}>
						{change.mutation.isPending && (
							<Loader2 className="size-3.5 animate-spin" aria-hidden />
						)}
						<Trans>Save</Trans>
					</Button>
				</div>
			</div>
		</form>
	);
}
