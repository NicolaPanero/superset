import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { ArrowUpCircle, X } from "lucide-react";
import { useState } from "react";

export interface ForkAgentCliUpdateRow {
	id: string;
	label: string;
	installed: string | null;
	latest: string | null;
	command: string | null;
}

export function ForkAgentCliUpdateToast({
	rows,
	onUpdate,
	onLater,
}: {
	rows: ForkAgentCliUpdateRow[];
	onUpdate: () => Promise<void>;
	onLater: () => void;
}) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const canUpdate = rows.some((row) => row.command);
	const update = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await onUpdate();
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="w-[356px] max-w-[calc(100vw-32px)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg">
			<div className="flex items-start gap-2.5">
				<ArrowUpCircle
					className="mt-0.5 size-4 shrink-0 text-muted-foreground"
					aria-hidden
				/>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">
						<Trans>Updates are available for your agent tools.</Trans>
					</p>
					<ul className="mt-1 space-y-0.5">
						{rows.map((row) => {
							const { label, installed, latest } = row;
							return (
								<li
									key={row.id}
									className="truncate text-xs text-muted-foreground"
								>
									<Trans>
										{label} {installed} to {latest}
									</Trans>
								</li>
							);
						})}
					</ul>
				</div>
				<button
					type="button"
					onClick={onLater}
					disabled={busy}
					aria-label={t({ message: "Dismiss" })}
					className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
				>
					<X className="size-3.5" aria-hidden />
				</button>
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={onLater}
				>
					<Trans>Later</Trans>
				</Button>
				{canUpdate && (
					<Button
						type="button"
						size="sm"
						disabled={busy}
						onClick={() => void update()}
					>
						{busy ? <Trans>Updating…</Trans> : <Trans>Update</Trans>}
					</Button>
				)}
			</div>
		</div>
	);
}
