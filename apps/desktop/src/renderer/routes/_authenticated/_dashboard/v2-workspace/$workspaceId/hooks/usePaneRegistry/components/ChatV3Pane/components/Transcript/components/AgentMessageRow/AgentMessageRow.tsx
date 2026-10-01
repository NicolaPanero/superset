import { useLingui } from "@lingui/react/macro";
import type { SessionSnapshot } from "@superset/chat/core";
import { displayText } from "@superset/chat/core";
import type { AgentMessage } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MarkdownView } from "../../../MarkdownView";

function clockLabel(item: AgentMessage): string {
	const at = item.completedAtMs ?? item.startedAtMs;
	return new Date(at).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function AgentMessageRow({
	item,
	snapshot,
}: {
	item: AgentMessage;
	snapshot: SessionSnapshot;
}) {
	const { t } = useLingui();
	const text = displayText(snapshot, item.id);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(timer);
	}, [copied]);

	const copy = useCallback(() => {
		void navigator.clipboard
			.writeText(text)
			.then(() => setCopied(true))
			.catch((error: unknown) => {
				console.error("[chat] copy failed", error);
			});
	}, [text]);

	return (
		// Actions stay out of the way until the message is pointed at, and stay
		// reachable by keyboard regardless.
		<div className="group/message flex flex-col gap-1">
			<MarkdownView text={text} />
			<div className="flex items-center gap-2 text-muted-foreground/60 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
				<button
					aria-label={t({ message: "Copy message" })}
					className={cn(
						"rounded p-1 transition-colors hover:bg-secondary hover:text-foreground",
						copied && "text-foreground",
					)}
					onClick={copy}
					type="button"
				>
					{copied ? (
						<Check className="size-3.5" />
					) : (
						<Copy className="size-3.5" />
					)}
				</button>
				<span className="text-[11px] tabular-nums">{clockLabel(item)}</span>
			</div>
		</div>
	);
}
