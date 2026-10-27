import { TRPCError } from "@trpc/server";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";

const FALLBACK_IDENTITY = {
	"user.name": "Superset++",
	"user.email": "superset-plus-plus@users.noreply.github.com",
};

export const GIT_MISSING_MESSAGE =
	"Git is not installed or Paradev++ cannot find it. Install Git (on Windows: https://git-scm.com/download/win), then restart Paradev++.";

export function isGitMissing(error: unknown): boolean {
	if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return true;
	const message = error instanceof Error ? error.message : String(error);
	return /spawn git(\.exe)? ENOENT/i.test(message);
}

export function throwIfGitMissing(error: unknown): void {
	if (!isGitMissing(error)) return;
	throw new TRPCError({
		code: "PRECONDITION_FAILED",
		message: GIT_MISSING_MESSAGE,
		cause: error,
	});
}

/** Fills only the identity keys git has no value for, so the user's own config always wins. */
export async function scaffoldIdentityArgs(
	repoPath: string,
): Promise<string[]> {
	const git = createUserSimpleGit(repoPath);
	const args: string[] = [];
	for (const [key, value] of Object.entries(FALLBACK_IDENTITY)) {
		const configured = await git
			.raw(["config", "--get", key])
			.then((output) => output.trim())
			.catch(() => "");
		if (!configured) args.push("-c", `${key}=${value}`);
	}
	return args;
}
