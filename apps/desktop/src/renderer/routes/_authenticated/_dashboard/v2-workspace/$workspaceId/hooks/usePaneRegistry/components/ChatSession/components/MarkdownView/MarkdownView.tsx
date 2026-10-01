import { cn } from "@superset/ui/utils";
import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { planMarkdown } from "./utils/planMarkdown";

/**
 * Agent prose is dense with identifiers, so the defaults fight it: a padded,
 * filled box around every `code` span makes each line a row of slabs, and a
 * display-sized heading turns a one-line aside into a banner. The CLI reads
 * better because it marks code by typeface rather than by chrome and keeps
 * headings at body size — this follows it, in a palette that has no hue to
 * spare (`--primary` is chroma 0 in both themes).
 */
const PROSE = cn(
	"[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
	// Inline code only: no vertical padding, so it sits on the line instead of
	// straddling it. `pre > code` keeps the block treatment.
	"[&_:not(pre)>code]:bg-foreground/[0.06] [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0",
	"[&_:not(pre)>code]:rounded-[3px] [&_:not(pre)>code]:font-normal [&_:not(pre)>code]:text-[0.92em]",
	"[&_:not(pre)>code]:before:content-none [&_:not(pre)>code]:after:content-none",
	// Headings carry weight, not size: these sit inside a paragraph of chat.
	"[&_h1]:mt-4 [&_h1]:mb-1 [&_h1]:font-semibold [&_h1]:text-[1.05em]",
	"[&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:font-semibold [&_h2]:text-[1em]",
	"[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-[1em]",
	// Markers outside, so a wrapped line hangs under its text rather than
	// running back to the bullet.
	"[&_ul]:my-1 [&_ul]:list-outside [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-outside [&_ol]:pl-5",
	"[&_li]:my-0.5 [&_li]:pl-1",
	"[&_p]:leading-relaxed [&_li]:leading-relaxed",
	// Tables read as data, not as cards.
	"[&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_td]:px-2 [&_td]:py-1",
);

const MarkdownBlock = memo(function MarkdownBlock({
	block,
}: {
	block: string;
}) {
	return (
		<Streamdown
			className={PROSE}
			linkSafety={{ enabled: false }}
			mode="streaming"
		>
			{block}
		</Streamdown>
	);
});

export function MarkdownView({
	className,
	text,
}: {
	text: string;
	className?: string;
}) {
	const plan = useMemo(() => planMarkdown(text), [text]);
	return (
		<div
			className={cn(
				// A measure, not the pane's width: ~110 characters a line is why the
				// same answer reads harder here than in the terminal.
				"flex min-w-0 max-w-[76ch] flex-col gap-1 text-sm",
				className,
			)}
		>
			{plan.stable.map((entry) => (
				<MarkdownBlock block={entry.block} key={entry.key} />
			))}
			{plan.tail !== null &&
				(plan.tailFenceOpen ? (
					<pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs">
						{plan.tail}
					</pre>
				) : (
					<MarkdownBlock block={plan.tail} />
				))}
		</div>
	);
}
