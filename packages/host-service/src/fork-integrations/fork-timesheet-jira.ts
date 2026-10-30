import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { forkTimesheetSettings } from "../db/fork-schema";
import type { HostServiceContext } from "../types";
import type { ForkJiraProvider } from "./fork-jira";
import {
	type ForkTimesheetProposal,
	type ForkTimesheetSettings,
	forkDefaultTimesheetSettings,
} from "./fork-timesheet";

type Ctx = Pick<HostServiceContext, "db" | "organizationId">;

export function forkTimesheetSettingsFor(
	ctx: Ctx,
	connectionId: string,
): ForkTimesheetSettings {
	const row = ctx.db
		.select()
		.from(forkTimesheetSettings)
		.where(
			and(
				eq(forkTimesheetSettings.scope, ctx.organizationId),
				eq(forkTimesheetSettings.connectionId, connectionId),
			),
		)
		.get();
	return {
		...forkDefaultTimesheetSettings(),
		...(row?.settings ?? {}),
		enabled: false,
	};
}

export function forkSaveTimesheetSettings(
	ctx: Ctx,
	connectionId: string,
	settings: ForkTimesheetSettings,
): void {
	ctx.db
		.insert(forkTimesheetSettings)
		.values({
			scope: ctx.organizationId,
			connectionId,
			settings: { ...settings, enabled: false },
		})
		.onConflictDoUpdate({
			target: [forkTimesheetSettings.scope, forkTimesheetSettings.connectionId],
			set: { settings: { ...settings, enabled: false } },
		})
		.run();
}

function retired(): never {
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message:
			"Timesheet proposals are no longer available. Log time from a task.",
	});
}
export async function forkTimesheetPropose(
	_ctx: Ctx,
	_jira: ForkJiraProvider,
	_input: {
		connectionId: string;
		from?: string;
		to?: string;
		modules?: string[];
		extraVacations?: { from: string; to: string }[];
		now?: number;
	},
): Promise<{ id: string; from: string; to: string } & ForkTimesheetProposal> {
	return retired();
}
export async function forkTimesheetPost(
	_ctx: Ctx,
	_jira: ForkJiraProvider,
	_input: {
		proposalId: string;
		entries: {
			id: string;
			key: string;
			date: string;
			time: string;
			seconds: number;
		}[];
	},
): Promise<{ id: string; ok: boolean; error?: string }[]> {
	return retired();
}
