import { describe, expect, it } from "bun:test";
import { cursorApproval } from "./cursorExtensions";

describe("Cursor ACP blocking extensions", () => {
	const params = {
		toolCallId: "t1",
		questions: [
			{
				id: "q1",
				prompt: "Pick one",
				options: [
					{ id: "a", label: "A" },
					{ id: "b", label: "B" },
				],
			},
			{
				id: "q2",
				prompt: "Pick several",
				allowMultiple: true,
				options: [
					{ id: "x", label: "X" },
					{ id: "y", label: "Y" },
				],
			},
		],
	};
	it("returns the documented nested response for complete single and multiple answers", () => {
		const approval = cursorApproval("cursor/ask_question", params);
		if (!approval) throw new Error("Missing question approval");
		const answers = [
			{ questionId: "q1", selectedOptionIds: ["a"] },
			{ questionId: "q2", selectedOptionIds: ["x", "y"] },
		];
		expect(
			approval.respond({ type: "option", optionId: "cursor-answers", answers }),
		).toEqual({ outcome: { outcome: "answered", answers } });
		expect(approval.respond({ type: "decline" })).toEqual({
			outcome: { outcome: "skipped" },
		});
		expect(approval.respond({ type: "cancel" })).toEqual({
			outcome: { outcome: "cancelled" },
		});
	});
	it("rejects incomplete, duplicate or invented answers and multiple selections for a single question", () => {
		const a = cursorApproval("cursor/ask_question", params);
		if (!a) throw new Error("Missing question approval");
		for (const answers of [
			[],
			[
				{ questionId: "q1", selectedOptionIds: ["a"] },
				{ questionId: "q1", selectedOptionIds: ["b"] },
			],
			[
				{ questionId: "q1", selectedOptionIds: ["a", "b"] },
				{ questionId: "q2", selectedOptionIds: ["x"] },
			],
			[
				{ questionId: "q1", selectedOptionIds: ["a"] },
				{ questionId: "q2", selectedOptionIds: ["invented"] },
			],
		])
			expect(() =>
				a.respond({ type: "option", optionId: "cursor-answers", answers }),
			).toThrow();
	});
	it("shows the plan and translates explicit approval, rejection and cancellation", () => {
		const a = cursorApproval("cursor/create_plan", {
			toolCallId: "p1",
			name: "Review changes",
			plan: "Read files first",
		});
		if (!a) throw new Error("Missing plan approval");
		expect(a.item.detail).toEqual([{ type: "text", text: "Read files first" }]);
		expect(a.respond({ type: "accept" })).toEqual({
			outcome: { outcome: "accepted" },
		});
		expect(a.respond({ type: "decline" })).toEqual({
			outcome: { outcome: "rejected" },
		});
		expect(a.respond({ type: "cancel" })).toEqual({
			outcome: { outcome: "cancelled" },
		});
	});
});
