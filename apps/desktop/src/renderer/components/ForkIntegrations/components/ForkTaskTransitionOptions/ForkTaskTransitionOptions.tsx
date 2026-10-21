import { Trans } from "@lingui/react/macro";
import type { ForkJiraColumn } from "@superset/shared/fork-integrations";
import { Button } from "@superset/ui/button";
import { LuArrowRight } from "react-icons/lu";
import type { ForkTaskTransition } from "../../hooks/useForkTaskTransition";
import { forkJiraColumnForStatus } from "../../utils/forkJiraColumns";

export function ForkTaskTransitionOptions({
	transitions,
	columns,
	busy,
	onChoose,
}: {
	transitions: ForkTaskTransition[];
	columns: ForkJiraColumn[];
	busy: boolean;
	onChoose: (transition: ForkTaskTransition) => void;
}) {
	const other = transitions.filter(
		(transition) =>
			!transition.to || !forkJiraColumnForStatus(columns, transition.to),
	);
	const groups = [
		...columns.map((column) => ({
			id: column.id,
			name: column.name,
			items: transitions.filter(
				(transition) =>
					transition.to &&
					forkJiraColumnForStatus(columns, transition.to)?.id === column.id,
			),
		})),
		{ id: "unmapped", name: <Trans>Other statuses</Trans>, items: other },
	].filter((group) => group.items.length > 0);
	return (
		<div className="space-y-2">
			{groups.map((group) => (
				<div key={group.id}>
					<div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						{group.name}
					</div>
					{group.items.map((transition) => (
						<Button
							key={transition.id}
							variant="ghost"
							disabled={busy}
							onClick={() => onChoose(transition)}
							className="h-auto w-full justify-start gap-2 rounded-md px-2 py-2 text-left"
						>
							<LuArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="min-w-0">
								<span className="block text-xs font-medium">
									{transition.to?.name ?? transition.name}
								</span>
								{transition.to && transition.name !== transition.to.name && (
									<span className="block text-[11px] font-normal text-muted-foreground">
										{transition.name}
									</span>
								)}
							</span>
						</Button>
					))}
				</div>
			))}
		</div>
	);
}
