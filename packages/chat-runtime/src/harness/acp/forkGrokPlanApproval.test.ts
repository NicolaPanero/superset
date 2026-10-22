import { describe, expect, it } from "bun:test";
import { forkGrokPlanApproval } from "./forkGrokPlanApproval";

describe("Grok plan approval", () => {
	it("keeps the full document and responds with Grok outcomes", () => {
		const approval = forkGrokPlanApproval({
			sessionId: "s1",
			toolCallId: "p1",
			planContent: "# Plan\n\n1. Review\n2. Implement",
		});
		expect(approval.item).toMatchObject({
			presentation: "plan",
			targetItemId: "p1",
			detail: [{ type: "text", text: "# Plan\n\n1. Review\n2. Implement" }],
		});
		expect(approval.respond({ type: "accept" })).toEqual({
			outcome: "approved",
		});
		expect(approval.respond({ type: "accept_for_session" })).toEqual({
			outcome: "approved",
		});
		expect(approval.respond({ type: "decline" })).toEqual({
			outcome: "abandoned",
		});
		expect(approval.respond({ type: "cancel" })).toEqual({
			outcome: "cancelled",
		});
	});
	it("rejects requests without an owning session or tool", () => {
		expect(() => forkGrokPlanApproval({ toolCallId: "p1" })).toThrow();
		expect(() =>
			forkGrokPlanApproval({ sessionId: "s1", toolCallId: "" }),
		).toThrow();
	});
});
