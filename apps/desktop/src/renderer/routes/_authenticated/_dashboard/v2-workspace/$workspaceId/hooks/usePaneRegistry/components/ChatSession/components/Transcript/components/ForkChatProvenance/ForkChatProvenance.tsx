import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Info, Undo2 } from "lucide-react";
import { useForkChatProvenance } from "../../../../providers/ForkChatProvenanceProvider";

/** Opens a handed-over chat with where it came from, as Zed does. */
export function ForkChatProvenance({ className }: { className?: string }) {
	const provenance = useForkChatProvenance();
	if (!provenance) return null;
	const source = provenance.email
		? `${provenance.label} · ${provenance.email}`
		: provenance.label;
	const label = provenance.label;
	return (
		<div className={cn("pt-4", className)}>
			<div className="flex items-start gap-2.5 border-b border-border/60 pb-3 text-xs">
				<Info className="mt-px size-3.5 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					<p className="truncate text-foreground">
						<Trans>Continued from {source}</Trans>
					</p>
					<p className="mt-0.5 text-muted-foreground">
						{provenance.summaryOnly ? (
							<Trans>This agent received the messages so far.</Trans>
						) : (
							<Trans>This agent received the whole conversation so far.</Trans>
						)}
					</p>
				</div>
				{provenance.onReturn && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 shrink-0 gap-1.5 text-xs"
						onClick={provenance.onReturn}
					>
						<Undo2 className="size-3.5" />
						<Trans>Back to {label}</Trans>
					</Button>
				)}
			</div>
		</div>
	);
}
