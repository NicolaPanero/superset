import type {
	ForkComment,
	ForkPullRequest,
	ForkRepository,
	ForkRepositoryRef,
	ForkTask,
} from "@superset/shared/fork-integrations";
import type { ForkPage } from "./fork-scm";

export interface ForkSourceControlProvider {
	repositories(
		connectionId: string,
		cursor?: string,
	): Promise<ForkPage<ForkRepository>>;
	list(
		connectionId: string,
		repository: ForkRepositoryRef,
		state?: string,
		cursor?: string,
	): Promise<ForkPage<ForkPullRequest>>;
	get(
		connectionId: string,
		repository: ForkRepositoryRef,
		number: number,
	): Promise<ForkPullRequest>;
	diff(
		connectionId: string,
		repository: ForkRepositoryRef,
		number: number,
	): Promise<string>;
	comments(
		connectionId: string,
		repository: ForkRepositoryRef,
		number: number,
		cursor?: string,
	): Promise<ForkPage<ForkComment>>;
}
export interface ForkTaskProvider {
	list(
		connectionId: string,
		query: string,
		cursor?: string,
	): Promise<ForkPage<ForkTask>>;
	get(connectionId: string, key: string): Promise<ForkTask>;
	edit(
		connectionId: string,
		key: string,
		fields: {
			title?: string;
			description?: string;
			assigneeId?: string | null;
			priorityId?: string;
			labels?: string[];
		},
	): Promise<ForkTask>;
	transition(
		connectionId: string,
		key: string,
		transitionId: string,
		fields: Record<string, unknown>,
	): Promise<ForkTask>;
}
