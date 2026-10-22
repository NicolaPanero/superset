import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	forkJiraAutomationLaunches,
	forkJiraAutomationRuns,
	forkJiraAutomations,
} from "../../../db/fork-schema";
import { projects } from "../../../db/schema";
import {
	forkJiraLaunchSchema,
	prepareForkJiraLaunch,
} from "../../../fork-integrations/fork-jira-launch";
import { forkServices } from "../../../fork-integrations/fork-services";
import { machineOnlyProcedure } from "../../index";

const local = machineOnlyProcedure.use(({ ctx, next }) => {
	if (ctx.isLocalCaller === false)
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Manage Jira automations on the host computer",
		});
	return next({ ctx });
});
const id = z.object({ id: z.string().uuid() });
export const forkJiraAutomationProcedures = {
	automationList: local
		.input(z.object({ connectionId: z.string() }))
		.query(({ ctx, input }) =>
			ctx.db
				.select()
				.from(forkJiraAutomations)
				.where(
					and(
						eq(forkJiraAutomations.scope, ctx.organizationId),
						eq(forkJiraAutomations.connectionId, input.connectionId),
					),
				)
				.all()
				.map((rule) => ({
					...rule,
					launch:
						ctx.db
							.select()
							.from(forkJiraAutomationLaunches)
							.where(eq(forkJiraAutomationLaunches.ruleId, rule.id))
							.get() ?? null,
				})),
		),
	automationCreate: local
		.input(
			z.object({
				connectionId: z.string(),
				projectId: z.string().uuid(),
				name: z.string().trim().min(1).max(200),
				jql: z.string().trim().min(1).max(4000),
				agent: z.string().min(1).max(200),
				prompt: z.string().trim().min(1).max(20000),
				launch: forkJiraLaunchSchema.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			forkServices(ctx).jira.assert(input.connectionId);
			if (
				!ctx.db
					.select({ id: projects.id })
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get()
			)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found",
				});
			const rules = ctx.db
				.select({ id: forkJiraAutomations.id })
				.from(forkJiraAutomations)
				.where(eq(forkJiraAutomations.scope, ctx.organizationId))
				.all();
			if (rules.length >= 100)
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "At most 100 Jira automations per host",
				});
			await forkServices(ctx).jira.list(input.connectionId, input.jql);
			if (input.launch)
				await prepareForkJiraLaunch(ctx, input.agent, input.launch);
			const { launch, ...fields } = input;
			const rule = {
				...fields,
				id: randomUUID(),
				scope: ctx.organizationId,
				enabled: false,
				initialized: false,
			};
			ctx.db.transaction((tx) => {
				tx.insert(forkJiraAutomations).values(rule).run();
				if (launch)
					tx.insert(forkJiraAutomationLaunches)
						.values({ ruleId: rule.id, ...launch })
						.run();
			});
			return { id: rule.id };
		}),
	automationEnable: local
		.input(id.extend({ enabled: z.boolean() }))
		.mutation(({ ctx, input }) => {
			ctx.db
				.update(forkJiraAutomations)
				.set({ enabled: input.enabled })
				.where(
					and(
						eq(forkJiraAutomations.scope, ctx.organizationId),
						eq(forkJiraAutomations.id, input.id),
					),
				)
				.run();
			return { ok: true };
		}),
	automationDelete: local.input(id).mutation(({ ctx, input }) => {
		ctx.db
			.delete(forkJiraAutomations)
			.where(
				and(
					eq(forkJiraAutomations.scope, ctx.organizationId),
					eq(forkJiraAutomations.id, input.id),
				),
			)
			.run();
		return { ok: true };
	}),
	automationRuns: local.input(id).query(({ ctx, input }) =>
		ctx.db
			.select({
				taskKey: forkJiraAutomationRuns.taskKey,
				workspaceId: forkJiraAutomationRuns.workspaceId,
				error: forkJiraAutomationRuns.error,
				createdAt: forkJiraAutomationRuns.createdAt,
			})
			.from(forkJiraAutomationRuns)
			.innerJoin(
				forkJiraAutomations,
				eq(forkJiraAutomations.id, forkJiraAutomationRuns.ruleId),
			)
			.where(
				and(
					eq(forkJiraAutomations.scope, ctx.organizationId),
					eq(forkJiraAutomations.id, input.id),
				),
			)
			.orderBy(desc(forkJiraAutomationRuns.createdAt))
			.limit(20)
			.all(),
	),
};
