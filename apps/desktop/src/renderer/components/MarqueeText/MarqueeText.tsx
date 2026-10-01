import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

const PIXELS_PER_SECOND = 32;
const MIN_SCROLL_DURATION_S = 0.5;
const MAX_SCROLL_DURATION_S = 6;
const SCROLL_START_DELAY_S = 0.35;
const RESET_DURATION_S = 0.2;
// scrollWidth/clientWidth each round to the nearest device pixel, so two
// elements that are visually flush can still disagree by a pixel — without
// this, that shows up as a 1px "jiggle" on hover under fractional zoom.
const OVERFLOW_EPSILON_PX = 1.5;
const EDGE_FADE_PX = 14;

interface MarqueeTextProps {
	children: ReactNode;
	/** The full text of `children`: the tooltip for a clipped line, and the
	 * key that re-measures the overflow when the content changes. */
	title: string;
	className?: string;
	/** Reveals the text the same way hover does, driven by the row's own
	 * focus state — the row (not this span) is the tabbable element, so a
	 * keyboard-only user needs some other trigger to ever see clipped text. */
	forceActive?: boolean;
}

/**
 * Clipped with a fade at the trailing edge, at rest. On hover (or when
 * `forceActive` is set, for keyboard users tabbing through the row), scrolls
 * the text left just far enough to reveal the cut-off tail at a constant,
 * readable pace, then snaps back to the start when it's no longer active —
 * so text that's been squeezed by a narrow row can still be read without
 * a tooltip popup.
 *
 * Not a plain `truncate`: `text-overflow: ellipsis` only ellipsizes text
 * that's a direct line box of the clipping element, and the scrolled text
 * here has to be an `inline-block` (for the transform to move it
 * predictably), which the ellipsis mechanism doesn't reach inside of — so
 * the trailing fade is a mask-image, not a "…" glyph.
 */
export function MarqueeText({
	children,
	title,
	className,
	forceActive = false,
}: MarqueeTextProps) {
	const containerRef = useRef<HTMLSpanElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const [overflow, setOverflow] = useState(0);
	const [hovered, setHovered] = useState(false);

	const measureOverflow = useCallback(() => {
		const container = containerRef.current;
		const text = textRef.current;
		if (!container || !text) return;
		const next = text.scrollWidth - container.clientWidth;
		setOverflow(next > OVERFLOW_EPSILON_PX ? next : 0);
	}, []);

	useLayoutEffect(() => {
		if (!title) return;
		measureOverflow();
		const container = containerRef.current;
		if (!container || typeof ResizeObserver === "undefined") return;
		// Catches the row being resized (sidebar toggled, a sibling badge
		// appearing) while this text isn't hovered — mouseEnter alone would
		// leave `overflow` stale until the next hover.
		const observer = new ResizeObserver(measureOverflow);
		observer.observe(container);
		return () => observer.disconnect();
	}, [title, measureOverflow]);

	const active = (hovered || forceActive) && overflow > 0;
	const canScroll = overflow > 0;
	const scrollDurationS = Math.min(
		MAX_SCROLL_DURATION_S,
		Math.max(MIN_SCROLL_DURATION_S, overflow / PIXELS_PER_SECOND),
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: decorative hover reveal, not a control — the full text is already in the DOM for assistive tech regardless of the CSS transform.
		<span
			ref={containerRef}
			title={title}
			className={cn("block overflow-hidden whitespace-nowrap", className)}
			style={{
				maskImage:
					!active && canScroll
						? `linear-gradient(to right, black calc(100% - ${EDGE_FADE_PX}px), transparent 100%)`
						: undefined,
				WebkitMaskImage:
					!active && canScroll
						? `linear-gradient(to right, black calc(100% - ${EDGE_FADE_PX}px), transparent 100%)`
						: undefined,
			}}
			onMouseEnter={() => {
				// Re-measure on entry in case the row was resized since the
				// text last rendered (e.g. this row wasn't visible then).
				measureOverflow();
				setHovered(true);
			}}
			onMouseLeave={() => setHovered(false)}
		>
			<span
				ref={textRef}
				className="inline-block whitespace-nowrap"
				style={{
					transform: active ? `translateX(-${overflow}px)` : undefined,
					transition: canScroll
						? active
							? `transform ${scrollDurationS}s linear ${SCROLL_START_DELAY_S}s`
							: `transform ${RESET_DURATION_S}s ease`
						: undefined,
				}}
			>
				{children}
			</span>
		</span>
	);
}
