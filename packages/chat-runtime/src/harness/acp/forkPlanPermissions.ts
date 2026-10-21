import { fullAccessAllowOption } from "./forkFullAccess";
import type { AcpRequestPermissionParams } from "./wire";

export function forkPlanAllowOption(
	request: AcpRequestPermissionParams,
	toolName?: string,
): string | undefined {
	const call = request.toolCall;
	const names = [
		call?.name,
		call?._meta?.claudeCode?.toolName,
		toolName,
		call?.title,
	];
	if (
		call?.kind === "switch_mode" ||
		names.some(
			(name) =>
				name &&
				/exit.?plan|enter.?plan|ask.?user|request.?user.?input|approve.?plan/i.test(
					name,
				),
		)
	)
		return undefined;
	return fullAccessAllowOption(request.options);
}
