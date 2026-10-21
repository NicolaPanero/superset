import { expect, test } from "bun:test";
import type { ApprovalRequest, ToolCall } from "@superset/chat/protocol";
import {
	forkApprovalPlan,
	forkPlanMarkdown,
	forkPlanPath,
	forkToolPlan,
} from "./forkPlanDocument";

const approval: ApprovalRequest = {
	id: "approval:1",
	kind: "approval_request",
	title: "Migration plan",
	targetItemId: "tool:1",
	status: "answered",
	decision: { type: "accept" },
	startedAtMs: 1,
	detail: [{ type: "text", text: "# Migration\n\nRead before editing." }],
};
const tool: ToolCall = {
	id: "tool:1",
	kind: "tool_call",
	title: "Create Plan: Migration plan",
	toolName: "create_plan",
	toolKind: "other",
	status: "completed",
	content: [],
	startedAtMs: 1,
};

test("keeps the document available after approval, including historical Cursor plans", () => {
	expect(forkApprovalPlan(approval, tool)?.markdown).toBe(
		"# Migration\n\nRead before editing.",
	);
	expect(
		forkApprovalPlan({ ...approval, presentation: "plan" })?.markdown,
	).toBe("# Migration\n\nRead before editing.");
	expect(forkApprovalPlan(approval)).toBeNull();
});

test("reads a plan from another agent's explicit plan approval input", () => {
	expect(
		forkApprovalPlan(
			{ ...approval, detail: undefined },
			{
				...tool,
				title: "Exit plan mode",
				toolName: "ExitPlanMode",
				rawInput: { plan: "# Implementation" },
			},
		)?.markdown,
	).toBe("# Implementation");
});

test("hides Cursor file metadata while retaining Markdown and diagrams", () => {
	expect(
		forkPlanMarkdown(
			"<!-- plan-id -->\n---\ntodos: []\n---\n# Title\n\n```mermaid\ngraph LR\nA --> B\n```",
		),
	).toBe("# Title\n\n```mermaid\ngraph LR\nA --> B\n```");
	expect(forkPlanMarkdown("# Title\n\n---\nBody")).toBe("# Title\n\n---\nBody");
});

test("decodes local plan files and rejects remote or invalid URIs", () => {
	expect(forkPlanPath("file:///Users/me/.cursor/plans/My%20plan.md")).toBe(
		"/Users/me/.cursor/plans/My plan.md",
	);
	expect(forkPlanPath("plans/local.md")).toBe("plans/local.md");
	expect(forkPlanPath("file://remote/plan.md")).toBeNull();
	expect(forkPlanPath("https://example.com/plan.md")).toBeNull();
	expect(forkPlanPath("file:///%XX")).toBeNull();
});

test("recovers the plan from Cursor's session replay without an approval event", () => {
	const plan = forkToolPlan({
		...tool,
		id: "replay-0-7",
		toolName: "other",
		rawInput: {
			_toolName: "createPlan",
			name: "Migration plan",
			plan: "# Replay document",
		},
	});
	expect(plan).toMatchObject({
		title: "Migration plan",
		markdown: "# Replay document",
	});
	expect(
		forkToolPlan({
			...tool,
			title: "Search",
			toolName: "search",
			rawInput: { plan: "ordinary tool input" },
		}),
	).toBeNull();
});

test("recovers Claude and Grok native plan documents from replay", () => {
	expect(
		forkToolPlan({
			...tool,
			toolName: "ExitPlanMode",
			rawInput: { plan: "# Claude plan" },
		})?.markdown,
	).toBe("# Claude plan");
	expect(
		forkToolPlan({
			...tool,
			title: "Exit plan mode",
			toolName: "exit_plan_mode",
			rawInput: {},
			rawOutput: {
				PlanReady: {
					message: "Ready",
					plan_content: "# Grok plan",
					plan_file_path: "/tmp/plan.md",
				},
			},
		})?.markdown,
	).toBe("# Grok plan");
});
