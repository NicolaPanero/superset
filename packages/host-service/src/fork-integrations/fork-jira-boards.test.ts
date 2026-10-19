import { expect, test } from "bun:test";
import type { ForkApi } from "./fork-api";
import { ForkJiraBoards } from "./fork-jira-boards";

test("Jira columns preserve order and group status IDs across paginated boards", async () => {
	const paths: string[] = [];
	const api = {
		connection: () => ({ provider: "jira" }),
		request: async (_id: string, path: string) => {
			paths.push(path);
			if (path.endsWith("/configuration"))
				return {
					id: 1406,
					name: "ScrumBTM",
					filter: { id: "15563" },
					columnConfig: {
						columns: [
							{ name: "To Do", statuses: [{ id: "open" }, { id: "ready" }] },
							{
								name: "In Progress",
								statuses: [
									{ id: "progress" },
									{ id: "testing" },
									{ id: "review" },
								],
							},
							{
								name: "Done",
								statuses: [{ id: "resolved" }, { id: "closed" }],
							},
						],
					},
				};
			if (path.includes("/sprint?"))
				return {
					values: [{ id: 1636, name: "BTM September 4", state: "active" }],
					isLast: true,
				};
			if (path.includes("startAt=0"))
				return {
					values: [{ id: 1, name: "First", type: "kanban" }],
					isLast: false,
				};
			return {
				values: [{ id: 1406, name: "ScrumBTM", type: "scrum" }],
				isLast: true,
			};
		},
	} as unknown as ForkApi;
	const result = await new ForkJiraBoards(api).context("jira", 1406);
	expect(
		result.board?.columns.map((column) => [column.name, column.statusIds]),
	).toEqual([
		["To Do", ["open", "ready"]],
		["In Progress", ["progress", "testing", "review"]],
		["Done", ["resolved", "closed"]],
	]);
	expect(result.board?.filterId).toBe("15563");
	expect(result.sprints[0]?.name).toBe("BTM September 4");
	expect(paths.some((path) => path.includes("startAt=1"))).toBe(true);
});

test("Kanban context does not request scrum sprints", async () => {
	const paths: string[] = [];
	const api = {
		connection: () => ({ provider: "jira" }),
		request: async (_id: string, path: string) => {
			paths.push(path);
			return path.includes("configuration")
				? { id: 1, name: "Board", columnConfig: { columns: [] } }
				: { values: [{ id: 1, name: "Board", type: "kanban" }], isLast: true };
		},
	} as unknown as ForkApi;
	expect((await new ForkJiraBoards(api).context("jira", 1)).sprints).toEqual(
		[],
	);
	expect(paths).toHaveLength(2);
});
