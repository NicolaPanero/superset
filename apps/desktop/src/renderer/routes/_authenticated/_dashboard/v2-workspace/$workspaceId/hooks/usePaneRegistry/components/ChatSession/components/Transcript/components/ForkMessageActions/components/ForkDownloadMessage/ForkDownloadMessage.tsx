import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Download } from "lucide-react";

export function ForkDownloadMessage({ text }: { text: string }) {
	const { t } = useLingui();
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Download Markdown" })}
					className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground"
					onClick={() => {
						const url = URL.createObjectURL(
							new Blob([text], { type: "text/markdown;charset=utf-8" }),
						);
						const link = document.createElement("a");
						link.href = url;
						link.download = "response.md";
						document.body.append(link);
						try {
							link.click();
						} finally {
							link.remove();
							setTimeout(() => URL.revokeObjectURL(url), 60_000);
						}
					}}
				>
					<Download className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent>
				<Trans>Download Markdown</Trans>
			</TooltipContent>
		</Tooltip>
	);
}
