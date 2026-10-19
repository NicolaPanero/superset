import { AsyncLocalStorage } from "node:async_hooks";
import type { HostDb } from "../db";
import type {
	ExecGh,
	ExecGhOptions,
} from "../trpc/router/workspace-creation/utils/exec-gh";
import type { HostServiceContext } from "../types";
import { ForkGitCredentialProvider } from "./fork-credentials";

const requests = new AsyncLocalStorage<
	{ execGh: ExecGh; cache: string } | undefined
>();
const databases = new WeakMap<HostDb, number>();
let nextDatabase = 0;

export function forkWithRequestScope<T>(
	ctx: HostServiceContext,
	action: () => T,
): T {
	if (!(ctx.credentials instanceof ForkGitCredentialProvider)) return action();
	let database = databases.get(ctx.db);
	if (database === undefined) {
		database = ++nextDatabase;
		databases.set(ctx.db, database);
	}
	const cache = JSON.stringify([
		database,
		ctx.organizationId,
		ctx.credentials.preferredProvider,
		ctx.credentials.preferredId,
		ctx.credentials.store
			.list()
			.filter((c) => c.provider === "github")
			.map((c) => [c.id, c.revision, c.enabled, c.isDefault, c.mode])
			.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
	]);
	return requests.run({ execGh: ctx.execGh, cache }, action);
}

export function forkScopedExecGh(args: string[], options?: ExecGhOptions) {
	const request = requests.getStore();
	return request
		? requests.run(undefined, () => request.execGh(args, options))
		: undefined;
}

export function forkRequestCacheKey(key: string): string {
	const request = requests.getStore();
	return request ? `${request.cache}:${key}` : key;
}
