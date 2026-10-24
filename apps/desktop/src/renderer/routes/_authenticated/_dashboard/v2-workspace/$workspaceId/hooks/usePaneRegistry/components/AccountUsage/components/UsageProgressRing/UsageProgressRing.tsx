interface UsageProgressRingProps {
	usedPercent?: number;
	unavailable?: boolean;
	lastKnown?: boolean;
}

export function UsageProgressRing({
	usedPercent = 0,
	unavailable = false,
	lastKnown = false,
}: UsageProgressRingProps) {
	const percent = Number.isFinite(usedPercent)
		? Math.min(100, Math.max(0, usedPercent))
		: 0;
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
			<circle
				cx="12"
				cy="12"
				r="10.5"
				stroke="currentColor"
				strokeWidth="1.5"
				opacity={unavailable ? 1 : 0.25}
				strokeDasharray={unavailable || lastKnown ? "2 2" : undefined}
			/>
			{!unavailable && percent > 0 && (
				<circle
					cx="12"
					cy="12"
					r="10.5"
					stroke="currentColor"
					strokeWidth="1.5"
					opacity={lastKnown ? 0.65 : undefined}
					pathLength="100"
					strokeDasharray={`${percent} 100`}
					transform="rotate(-90 12 12)"
				/>
			)}
		</svg>
	);
}
