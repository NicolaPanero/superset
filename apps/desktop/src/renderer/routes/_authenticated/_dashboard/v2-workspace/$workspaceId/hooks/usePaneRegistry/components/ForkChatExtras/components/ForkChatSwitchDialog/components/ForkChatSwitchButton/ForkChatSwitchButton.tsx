import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";

interface ForkChatSwitchButtonProps {
	busy: boolean;
	sameAgent: boolean;
	canStop: boolean;
	switching: boolean;
	stage: "converting" | "launching" | null;
	blocked: boolean;
	onSwitch: () => void;
}

export function ForkChatSwitchButton({
	busy,
	sameAgent,
	canStop,
	switching,
	stage,
	blocked,
	onSwitch,
}: ForkChatSwitchButtonProps) {
	return (
		<Button
			onClick={onSwitch}
			disabled={
				stage !== null ||
				switching ||
				(busy && (!sameAgent || !canStop)) ||
				blocked
			}
		>
			{switching ? (
				<Trans>Switching account…</Trans>
			) : stage === "converting" ? (
				<Trans>Converting…</Trans>
			) : stage === "launching" ? (
				<Trans>Launching…</Trans>
			) : busy && sameAgent && canStop ? (
				<Trans>Stop and switch account</Trans>
			) : (
				<Trans>Switch</Trans>
			)}
		</Button>
	);
}
