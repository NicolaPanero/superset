import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuArrowUp } from "react-icons/lu";

export function ForkCommentComposer({
	onSubmit,
	disabled,
	placeholder,
	compact,
}: {
	onSubmit: (body: string) => Promise<unknown>;
	disabled?: boolean;
	placeholder?: string;
	compact?: boolean;
}) {
	const { t } = useLingui();
	const [body, setBody] = useState("");
	const [sending, setSending] = useState(false);
	const label = placeholder ?? t({ message: "Leave a comment" });
	const text = body.trim();
	const canSubmit = !!text && !disabled && !sending;
	const submit = () => {
		if (!canSubmit) return;
		setSending(true);
		onSubmit(text)
			.then(
				() => setBody(""),
				() => undefined,
			)
			.finally(() => setSending(false));
	};
	return (
		<div className="rounded-xl border border-border/60 bg-background shadow-sm focus-within:border-border">
			<textarea
				rows={Math.max(compact ? 2 : 3, Math.min(8, body.split("\n").length))}
				value={body}
				disabled={sending}
				placeholder={label}
				aria-label={label}
				onChange={(event) => setBody(event.target.value)}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						(event.metaKey || event.ctrlKey) &&
						!event.nativeEvent.isComposing
					) {
						event.preventDefault();
						submit();
					}
				}}
				className={cn(
					"block w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60",
					compact && "pt-2",
				)}
			/>
			<div className="flex items-center justify-end px-2 pb-2">
				<button
					type="button"
					disabled={!canSubmit}
					aria-label={t({ message: "Post comment" })}
					title={t({ message: "Post comment" })}
					onClick={submit}
					className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/60 text-foreground transition-colors hover:bg-muted disabled:opacity-40"
				>
					<LuArrowUp strokeWidth={2.25} className="size-4" />
				</button>
			</div>
		</div>
	);
}
