import { Trans, useLingui } from "@lingui/react/macro";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@superset/ui/sheet";
import { PanelRightOpen } from "lucide-react";
import { MarkdownView } from "../../../../../MarkdownView";

export function ForkMessagePreview({ text }: { text: string }) {
	const { t } = useLingui();
	return (
		<Sheet>
			<SheetTrigger asChild>
				<button
					type="button"
					className="rounded p-1 transition-colors hover:bg-secondary hover:text-foreground"
					aria-label={t({ message: "Open message in side panel" })}
					title={t({ message: "Open message in side panel" })}
				>
					<PanelRightOpen className="size-3.5" />
				</button>
			</SheetTrigger>
			<SheetContent
				className="w-full gap-0 sm:w-[min(640px,85vw)] sm:max-w-none"
				aria-describedby={undefined}
			>
				<SheetHeader className="border-b px-6 pt-12 pb-4">
					<SheetTitle>
						<Trans>Message</Trans>
					</SheetTitle>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-auto p-6">
					<MarkdownView text={text} final />
				</div>
			</SheetContent>
		</Sheet>
	);
}
