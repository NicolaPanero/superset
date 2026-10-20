import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { ArrowUpCircle, X } from "lucide-react";
import { useState } from "react";

export function ForkUpdateToast({
	tag,
	onInstall,
	onLater,
}: {
	tag: string;
	onInstall: () => Promise<boolean>;
	onLater: () => void;
}) {
	const { t } = useLingui();
	const [busy, setBusy] = useState(false);
	const install = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await onInstall();
		} catch (error) {
			toast.error(errorMessage(error));
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
						<Trans>A Superset++ update is available.</Trans>
					</p>
					<p
						className="mt-1 truncate text-xs text-muted-foreground"
						title={tag}
					>
						{tag.replace(/^desktop-v/, "")}
					</p>
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
				<Button
					type="button"
					size="sm"
					disabled={busy}
					onClick={() => void install()}
				>
					<Trans>Install and restart</Trans>
				</Button>
			</div>
		</div>
	);
}
