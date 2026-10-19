import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitCredentialProvider } from "../runtime/git";
import { getToolEnvironment } from "../terminal/clean-shell-env";
import type { ExecGh } from "../trpc/router/workspace-creation/utils/exec-gh";
import { ForkGitCredentialProvider } from "./fork-credentials";
import type { ForkConnectionStore } from "./fork-store";

const exec = promisify(execFile);
export function forkExecGh(
	fallback: ExecGh,
	credentials: GitCredentialProvider,
	store: ForkConnectionStore,
): ExecGh {
	return async (args, options) => {
		if (!store.list().some((c) => c.provider === "github"))
			return fallback(args, options);
		const selected =
			credentials instanceof ForkGitCredentialProvider && options?.cwd
				? credentials.forPath(options.cwd)
				: credentials;
		const token = await selected.getToken("github.com");
		if (!token) throw new Error("Connect GitHub in Fork Settings");
		const env = {
			...(await getToolEnvironment()),
			GH_TOKEN: token,
			GITHUB_TOKEN: token,
		};
		const child = exec("gh", args, {
			encoding: "utf8",
			env,
			cwd: options?.cwd,
			timeout: options?.timeout ?? 10_000,
			maxBuffer: options?.maxBuffer ?? 10 * 1024 * 1024,
		});
		if (options?.input !== undefined) child.child.stdin?.end(options.input);
		const { stdout } = await child;
		const result = stdout.trim();
		if (!result) return {};
		try {
			return JSON.parse(result);
		} catch {
			return result;
		}
	};
}
