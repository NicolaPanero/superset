import { expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { forkFetch } from "./fork-http";
import {
	forkJiraTransitionError,
	forkJiraTransitionFields,
} from "./fork-jira-transition-fields";

test("transition text areas use ADF while multiselect options stay intact", () => {
	const fields = [
		{
			id: "customfield_1",
			name: "Closing reason",
			schema: { custom: "jira:textarea" },
		},
	];
	const values = forkJiraTransitionFields(
		{
			customfield_1: "Completed",
			customfield_2: [{ id: "v1" }],
			summary: "Plain",
		},
		fields,
	);
	expect(values.customfield_1).toEqual({
		type: "doc",
		version: 1,
		content: [
			{ type: "paragraph", content: [{ type: "text", text: "Completed" }] },
		],
	});
	expect(values.customfield_2).toEqual([{ id: "v1" }]);
	expect(values.summary).toBe("Plain");
});

test("Jira validation details survive HTTP 400 and name the transition field", async () => {
	let error: unknown;
	try {
		await forkFetch(
			"https://jira.test/transition",
			{ method: "POST" },
			(async () =>
				Response.json(
					{ errorMessages: [], errors: { customfield_1: "Choose a version" } },
					{ status: 400 },
				)) as unknown as typeof fetch,
		);
	} catch (e) {
		error = e;
	}
	const named = forkJiraTransitionError(error, [
		{ id: "customfield_1", name: "Version" },
	]);
	expect(named).toBeInstanceOf(TRPCError);
	expect((named as TRPCError).code).toBe("BAD_REQUEST");
	expect((named as TRPCError).message).toBe("Version: Choose a version");
});
