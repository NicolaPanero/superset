import { CLIError } from "@superset/cli-framework";
import type { RouterOutputs } from "@superset/trpc";
import type { CliContext } from "../../lib/command";

type LinearWorkspace = RouterOutputs["integration"]["linear"]["workspace"];
type LinearTeam = LinearWorkspace["teams"][number];
type LinearIssue =
	RouterOutputs["integration"]["linear"]["issues"]["issues"][number];

export function linearWorkspace(ctx: CliContext, organizationId: string) {
	return ctx.api.integration.linear.workspace.query({ organizationId });
}

/** By key, id or name; the only team when there is one. */
export function linearTeam(
	workspace: LinearWorkspace,
	value: string | undefined,
): LinearTeam {
	if (value) {
		const needle = value.trim().toLowerCase();
		const team = workspace.teams.find(
			(t) =>
				t.key.toLowerCase() === needle ||
				t.id === value ||
				t.name.toLowerCase() === needle,
		);
		if (!team) {
			throw new CLIError(
				`Linear team not found: ${value}`,
				`Teams: ${workspace.teams.map((t) => t.key).join(", ")}`,
			);
		}
		return team;
	}
	const [only, ...rest] = workspace.teams;
	if (!only) throw new CLIError("Your Linear workspace has no teams");
	if (rest.length > 0) {
		throw new CLIError(
			"Pick a Linear team with --team",
			`Teams: ${workspace.teams.map((t) => t.key).join(", ")}`,
		);
	}
	return only;
}

/** By id or name, within the issue's team. */
export function linearStateId(team: LinearTeam, value: string): string {
	const needle = value.trim().toLowerCase();
	const state = team.states.find(
		(s) => s.id === value || s.name.toLowerCase() === needle,
	);
	if (!state) {
		throw new CLIError(
			`Status not found in ${team.key}: ${value}`,
			`Statuses: ${team.states.map((s) => s.name).join(", ")}`,
		);
	}
	return state.id;
}

const LINEAR_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** By Linear user id or email. An id passes through: the workspace lists only the first 250 users. */
export function linearUserId(
	workspace: LinearWorkspace,
	value: string,
): string {
	if (LINEAR_ID.test(value.trim())) return value.trim();
	const needle = value.trim().toLowerCase();
	const user = workspace.users.find(
		(u) => u.id === value || u.email?.toLowerCase() === needle,
	);
	if (!user) {
		throw new CLIError(
			`Linear user not found: ${value}`,
			"Pass a Linear user id or the email on their Linear account",
		);
	}
	return user.id;
}

export function rejectUnsupported(options: Record<string, unknown>) {
	const passed = Object.entries(options)
		.filter(([, value]) => value != null && value !== false)
		.map(
			([name]) => `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
		);
	if (passed.length > 0) {
		throw new CLIError(
			`Not supported for Linear issues: ${passed.join(", ")}`,
			"Pass --tracker superset to work on Superset tasks",
		);
	}
}

export function linearIssueRow(issue: LinearIssue) {
	return {
		id: issue.id,
		slug: issue.identifier,
		title: issue.title,
		status: issue.state.name,
		priority: issue.priority,
		assignee: issue.assignee?.displayName ?? "—",
		project: issue.project?.name ?? "—",
		team: issue.team.key,
		url: issue.url,
		branch: issue.branchName,
	};
}
