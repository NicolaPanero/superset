import { timingSafeEqual } from "node:crypto";
import type { RealtimeDiffStats } from "@superset/shared/realtime";
import { nudge } from "../realtime";
import { sandboxHostSecretFor } from "./access";

/**
 * Never written to Postgres: the organization's realtime hub keeps the latest
 * counts. The organization is the box's own word; a box naming another one
 * only files its own workspace there, which no client of that org lists.
 */
export async function reportSandboxDiffStats(args: {
	workspaceId: string;
	organizationId: string;
	presentedSecret: string;
	diffStats: RealtimeDiffStats;
}): Promise<"ok" | "unauthorized"> {
	const expected = Buffer.from(await sandboxHostSecretFor(args.workspaceId));
	const presented = Buffer.from(args.presentedSecret);
	if (
		expected.length !== presented.length ||
		!timingSafeEqual(expected, presented)
	) {
		return "unauthorized";
	}
	nudge(args.organizationId, "cloud_workspaces", {
		kind: "cloud_workspaces",
		workspaceId: args.workspaceId,
		diffStats: args.diffStats,
	});
	return "ok";
}
