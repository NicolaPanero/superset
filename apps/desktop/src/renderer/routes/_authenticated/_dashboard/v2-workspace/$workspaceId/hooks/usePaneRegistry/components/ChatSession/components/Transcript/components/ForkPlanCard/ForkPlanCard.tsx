import { Trans, useLingui } from "@lingui/react/macro";
import { normalizePlanEntryStatus, type Plan } from "@superset/chat/protocol";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@superset/ui/sheet";
import { ClipboardList, FileText, PanelRightOpen } from "lucide-react";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";
import { MarkdownView } from "../../../MarkdownView";
import { forkPlanMarkdown, forkPlanPath } from "../../utils/forkPlanDocument";
import { ForkPlanSteps } from "./components/ForkPlanSteps";

type PlanDocument = Pick<
	Plan,
	"id" | "title" | "markdown" | "path" | "entries" | "removed"
>;

export function ForkPlanCard({ item }: { item: PlanDocument }) {
	const { t } = useLingui();
	const { openFile } = useChatPaneActions();
	const title = item.title || t({ message: "Plan" });
	const markdown = forkPlanMarkdown(item.markdown ?? "");
	const path = forkPlanPath(item.path);
	const entries =
		item.markdown &&
		item.entries.length === 1 &&
		item.entries[0]?.text === item.markdown
			? []
			: item.entries;
	const total = entries.length;
	const completed = entries.filter(
		(entry) => normalizePlanEntryStatus(entry.status) === "completed",
	).length;
	const progress = total ? (
		<Trans>
			{completed} of {total} completed
		</Trans>
	) : (
		<Trans>Plan</Trans>
	);
	const body = (
		<div className="flex flex-col gap-5">
			{markdown && <MarkdownView text={markdown} final findItemId={item.id} />}
			{total > 0 && <ForkPlanSteps entries={entries} itemId={item.id} />}
			{path && (
				<Button
					className="max-w-full justify-start"
					variant="outline"
					size="sm"
					disabled={!openFile}
					onClick={() => openFile?.(path)}
					title={path}
				>
					<FileText className="size-3.5 shrink-0" />
					<span className="truncate">
						<Trans>Open plan file</Trans>
					</span>
				</Button>
			)}
		</div>
	);
	return (
		<Sheet>
			<section className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-muted/20">
				<div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<ClipboardList className="size-4" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium" title={title}>
							{title}
						</p>
						<p className="text-xs text-muted-foreground">{progress}</p>
					</div>
					<SheetTrigger asChild>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label={t({ message: "Open plan in side panel" })}
							title={t({ message: "Open plan in side panel" })}
						>
							<PanelRightOpen className="size-4" />
						</Button>
					</SheetTrigger>
					{item.removed && (
						<Badge variant="secondary">
							<Trans>Archived</Trans>
						</Badge>
					)}
				</div>
				{total > 0 && (
					<div
						className="h-0.5 bg-muted"
						role="progressbar"
						aria-label={t({ message: "Plan progress" })}
						aria-valuemin={0}
						aria-valuemax={total}
						aria-valuenow={completed}
					>
						<div
							className="h-full bg-emerald-500 transition-[width]"
							style={{ width: `${(completed / total) * 100}%` }}
						/>
					</div>
				)}
				<div className="max-h-72 overflow-auto p-4">{body}</div>
			</section>
			<SheetContent
				className="w-full gap-0 sm:w-[min(640px,85vw)] sm:max-w-none"
				aria-describedby={undefined}
			>
				<SheetHeader className="border-b px-6 pt-12 pb-4">
					<SheetTitle className="pr-6">{title}</SheetTitle>
					<SheetDescription>{progress}</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-auto p-6">{body}</div>
			</SheetContent>
		</Sheet>
	);
}
