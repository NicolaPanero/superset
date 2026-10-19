import type { ForkJiraBoardContext } from "@superset/shared/fork-integrations";
import { TRPCError } from "@trpc/server";
import type { ForkApi } from "./fork-api";

interface JiraPage<T> {
	values: T[];
	isLast?: boolean;
	total?: number;
}

export class ForkJiraBoards {
	constructor(private readonly api: ForkApi) {}

	private async pages<T>(connectionId: string, path: string): Promise<T[]> {
		const values: T[] = [];
		for (let startAt = 0; startAt < 1000; ) {
			const page = await this.api.request<JiraPage<T>>(
				connectionId,
				`${path}${path.includes("?") ? "&" : "?"}maxResults=100&startAt=${startAt}`,
			);
			values.push(...page.values);
			startAt += page.values.length;
			if (
				page.isLast === true ||
				page.values.length === 0 ||
				(page.total !== undefined && startAt >= page.total)
			)
				return values;
		}
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Too many Jira boards or sprints. Select a project to narrow the results.",
		});
	}

	async context(
		connectionId: string,
		boardId?: number,
		project?: string,
	): Promise<ForkJiraBoardContext> {
		if (this.api.connection(connectionId).provider !== "jira")
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "This connection is not Jira",
			});
		const boards = await this.pages<{ id: number; name: string; type: string }>(
			connectionId,
			`/rest/agile/1.0/board${project ? `?projectKeyOrId=${encodeURIComponent(project)}` : ""}`,
		);
		const board = boards.find((entry) => entry.id === boardId);
		if (boardId && !board)
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Jira board not found or inaccessible",
			});
		if (!boardId || !board)
			return {
				boards: boards.map(({ id, name, type }) => ({ id, name, type })),
				board: null,
				sprints: [],
			};
		const [configuration, sprints] = await Promise.all([
			this.api.request<{
				id: number;
				name: string;
				filter?: { id: string | number };
				columnConfig: {
					columns: { name: string; statuses: { id: string }[] }[];
				};
			}>(connectionId, `/rest/agile/1.0/board/${boardId}/configuration`),
			board.type === "scrum"
				? this.pages<{ id: number; name: string; state: string }>(
						connectionId,
						`/rest/agile/1.0/board/${boardId}/sprint?state=active,future`,
					)
				: Promise.resolve([]),
		]);
		return {
			boards: boards.map(({ id, name, type }) => ({ id, name, type })),
			board: {
				id: configuration.id,
				name: configuration.name,
				filterId: configuration.filter ? String(configuration.filter.id) : null,
				columns: configuration.columnConfig.columns.map((column, index) => ({
					id: `${boardId}:${index}`,
					name: column.name,
					statusIds: column.statuses.map((status) => status.id),
				})),
			},
			sprints: sprints.map(({ id, name, state }) => ({ id, name, state })),
		};
	}
}
