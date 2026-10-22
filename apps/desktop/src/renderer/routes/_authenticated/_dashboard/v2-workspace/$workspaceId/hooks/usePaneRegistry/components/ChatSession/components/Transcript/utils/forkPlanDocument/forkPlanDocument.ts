import type { ApprovalRequest, Item, ToolCall } from "@superset/chat/protocol";

export function forkToolPlan(item?: Item) {
	if (item?.kind !== "tool_call") return null;
	const tool = item as ToolCall;
	const input =
		tool.rawInput && typeof tool.rawInput === "object" ? tool.rawInput : {};
	const name =
		"_toolName" in input && typeof input._toolName === "string"
			? input._toolName
			: tool.toolName;
	if (
		!/^(createplan|exitplanmode)$/i.test(name.replace(/[_-]/g, "")) &&
		!/^Create Plan(?::|$)/i.test(tool.title)
	)
		return null;
	const output = tool.rawOutput;
	const ready =
		output && typeof output === "object" && "PlanReady" in output
			? output.PlanReady
			: undefined;
	const markdown =
		"plan" in input && typeof input.plan === "string"
			? input.plan
			: ready &&
					typeof ready === "object" &&
					"plan_content" in ready &&
					typeof ready.plan_content === "string"
				? ready.plan_content
				: undefined;
	if (!markdown?.trim()) return null;
	return {
		id: tool.id,
		title:
			"name" in input && typeof input.name === "string"
				? input.name
				: tool.title,
		markdown,
		entries: [],
	};
}

export function forkApprovalPlan(item: ApprovalRequest, target?: Item) {
	const tool = target?.kind === "tool_call" ? (target as ToolCall) : undefined;
	const planTool =
		tool &&
		(/^(createplan|exitplanmode)$/i.test(tool.toolName.replace(/[_-]/g, "")) ||
			/^Create Plan:/i.test(tool.title));
	if (item.presentation !== "plan" && !planTool) return null;
	const detail = item.detail
		?.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n\n");
	const input = tool?.rawInput;
	const inputPlan =
		input &&
		typeof input === "object" &&
		"plan" in input &&
		typeof input.plan === "string"
			? input.plan
			: undefined;
	const markdown = detail || inputPlan;
	return markdown
		? { id: item.id, title: item.title, markdown, entries: [] }
		: null;
}

export function forkPlanMarkdown(markdown: string): string {
	return markdown
		.replace(/^(?:<!--[\s\S]*?-->\s*)?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
		.trim();
}

export function forkPlanPath(path?: string): string | null {
	if (!path) return null;
	if (path.startsWith("file:")) {
		try {
			const url = new URL(path);
			return url.hostname && url.hostname !== "localhost"
				? null
				: decodeURIComponent(url.pathname);
		} catch {
			return null;
		}
	}
	return /^[a-z][a-z0-9+.-]*:/i.test(path) ? null : path;
}
