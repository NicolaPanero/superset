import { cn } from "@superset/ui/utils";
import { useId } from "react";
import { FORK_DISPLAY_NAME } from "~/fork-display-name";
import {
	FORK_WORDMARK_PATH,
	FORK_WORDMARK_VIEW_BOX,
} from "./fork-wordmark-geometry";

export function ForkWordmark({
	className,
	gradient = false,
}: {
	className?: string;
	gradient?: boolean;
}) {
	const gradientId = `fork-wordmark-gradient-${useId()}`;

	return (
		<svg
			viewBox={FORK_WORDMARK_VIEW_BOX}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={cn("text-foreground", className)}
			role="img"
			aria-label={FORK_DISPLAY_NAME}
		>
			{gradient && (
				<defs>
					<linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
						<stop offset="45%" stopColor="currentColor" stopOpacity="0.45" />
						<stop offset="50%" stopColor="currentColor" stopOpacity="1" />
						<stop offset="55%" stopColor="currentColor" stopOpacity="0.45" />
						<stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
						<animate
							attributeName="x1"
							values="-100%;100%;100%"
							keyTimes="0;0.55;1"
							dur="1.6s"
							repeatCount="indefinite"
						/>
						<animate
							attributeName="x2"
							values="0%;200%;200%"
							keyTimes="0;0.55;1"
							dur="1.6s"
							repeatCount="indefinite"
						/>
					</linearGradient>
				</defs>
			)}
			<path
				d={FORK_WORDMARK_PATH}
				fill={gradient ? `url(#${gradientId})` : "currentColor"}
			/>
		</svg>
	);
}
