import type { HostServiceContext } from "../types";
import { ForkApi } from "./fork-api";
import { ForkGitCredentialProvider } from "./fork-credentials";
import { ForkJiraProvider } from "./fork-jira";
import { ForkScmProvider } from "./fork-scm";
import { ForkConnectionStore } from "./fork-store";

export function forkServices(ctx: HostServiceContext) {
	const store = new ForkConnectionStore(ctx.db, ctx.organizationId);
	const credentials =
		ctx.credentials instanceof ForkGitCredentialProvider
			? ctx.credentials.fallback
			: ctx.credentials;
	const api = new ForkApi(store, credentials);
	return {
		store,
		api,
		scm: new ForkScmProvider(api),
		jira: new ForkJiraProvider(api),
	};
}
