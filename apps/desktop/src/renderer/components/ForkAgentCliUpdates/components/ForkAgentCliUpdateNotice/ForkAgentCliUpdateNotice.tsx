import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useEffect, useRef } from "react";
import { useForkAgentCliUpdates } from "../../hooks/useForkAgentCliUpdates";
import { ForkAgentCliUpdateToast } from "../ForkAgentCliUpdateToast";

const TOAST_ID = "fork-agent-cli-updates";

/** A popup at the bottom right, like a Paradev++ update; at most one per set of new versions. */
export function ForkAgentCliUpdateNotice() {
	const { t } = useLingui();
	const { status, snooze, update } = useForkAgentCliUpdates();
	const shown = useRef("");
	const actions = useRef({ snooze, update, t });
	actions.current = { snooze, update, t };
	const agents = status.data?.agents;
	useEffect(() => {
		const due = (agents ?? []).filter((agent) => agent.newer && !agent.snoozed);
		const key = due.map((agent) => `${agent.id}@${agent.latest}`).join(",");
		if (!key) {
			if (shown.current) toast.dismiss(TOAST_ID);
			shown.current = "";
			return;
		}
		if (key === shown.current) return;
		shown.current = key;
		toast.custom(
			() => (
				<ForkAgentCliUpdateToast
					rows={due}
					onLater={() => actions.current.snooze.mutate()}
					onUpdate={async () => {
						for (const agent of due) {
							if (!agent.command) continue;
							try {
								const result = await actions.current.update.mutateAsync(
									agent.id as "claude" | "codex",
								);
								const { label, installed } = result;
								toast.success(
									actions.current.t({
										message: `${label} is now ${installed}`,
									}),
								);
							} catch (error) {
								toast.error(errorMessage(error));
							}
						}
					}}
				/>
			),
			{
				id: TOAST_ID,
				duration: Number.POSITIVE_INFINITY,
				position: "bottom-right",
				dismissible: false,
				closeButton: false,
			},
		);
	}, [agents]);
	useEffect(() => () => void toast.dismiss(TOAST_ID), []);
	return null;
}
