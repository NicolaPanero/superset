import type { ApprovalRequest, Decision } from "@superset/chat/protocol";
import { z } from "zod";

const questionSchema = z.object({
	id: z.string().min(1),
	prompt: z.string(),
	options: z
		.array(z.object({ id: z.string().min(1), label: z.string() }))
		.min(1)
		.max(64),
	allowMultiple: z.boolean().optional(),
});
const askSchema = z.object({
	toolCallId: z.string().min(1),
	title: z.string().optional(),
	questions: z.array(questionSchema).min(1).max(32),
});
const planSchema = z.object({
	toolCallId: z.string().min(1),
	name: z.string().optional(),
	overview: z.string().optional(),
	plan: z.string().max(1024 * 1024),
});
export function cursorApproval(
	method: string,
	params: unknown,
): {
	item: Pick<
		ApprovalRequest,
		"kind" | "targetItemId" | "title" | "status" | "detail" | "questions"
	>;
	respond: (decision: Decision) => unknown;
} | null {
	if (method === "cursor/ask_question") {
		const p = askSchema.parse(params);
		if (new Set(p.questions.map((q) => q.id)).size !== p.questions.length)
			throw new Error("Duplicate question ids");
		return {
			item: {
				kind: "approval_request",
				targetItemId: p.toolCallId,
				title: p.title ?? "Questions",
				status: "pending",
				questions: p.questions,
			},
			respond: (decision) => {
				if (decision.type === "cancel")
					return { outcome: { outcome: "cancelled" } };
				if (decision.type !== "option" || !decision.answers)
					return { outcome: { outcome: "skipped" } };
				const answers = decision.answers;
				if (
					answers.length !== p.questions.length ||
					new Set(answers.map((a) => a.questionId)).size !== answers.length
				)
					throw new Error("Incomplete answers");
				for (const q of p.questions) {
					const a = answers.find((a) => a.questionId === q.id);
					if (
						!a ||
						a.selectedOptionIds.length === 0 ||
						(!q.allowMultiple && a.selectedOptionIds.length !== 1) ||
						new Set(a.selectedOptionIds).size !== a.selectedOptionIds.length ||
						a.selectedOptionIds.some(
							(id) => !q.options.some((o) => o.id === id),
						)
					)
						throw new Error("Invalid question answer");
				}
				return { outcome: { outcome: "answered", answers } };
			},
		};
	}
	if (method === "cursor/create_plan") {
		const p = planSchema.parse(params);
		return {
			item: {
				kind: "approval_request",
				targetItemId: p.toolCallId,
				title: p.name ?? "Plan",
				status: "pending",
				detail: [{ type: "text", text: p.plan }],
			},
			respond: (decision) => ({
				outcome: {
					outcome:
						decision.type === "cancel"
							? "cancelled"
							: decision.type === "accept" ||
									decision.type === "accept_for_session"
								? "accepted"
								: "rejected",
				},
			}),
		};
	}
	return null;
}
