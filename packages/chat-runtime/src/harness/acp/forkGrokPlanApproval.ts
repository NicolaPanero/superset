import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { z } from "zod";

const requestSchema = z.object({
	sessionId: z.string().min(1),
	toolCallId: z.string().min(1),
	planContent: z
		.string()
		.max(1024 * 1024)
		.nullish(),
});

export function forkGrokPlanApproval(params: unknown) {
	const request = requestSchema.parse(params);
	const item: Pick<
		ApprovalRequest,
		"kind" | "targetItemId" | "title" | "status" | "detail" | "presentation"
	> = {
		kind: "approval_request",
		targetItemId: request.toolCallId,
		title: "Plan",
		status: "pending",
		presentation: "plan",
		detail: request.planContent
			? [{ type: "text", text: request.planContent }]
			: [],
	};
	return {
		sessionId: request.sessionId,
		item,
		respond: (decision: Decision) => ({
			outcome:
				decision.type === "accept" || decision.type === "accept_for_session"
					? "approved"
					: decision.type === "cancel"
						? "cancelled"
						: "abandoned",
		}),
	};
}
