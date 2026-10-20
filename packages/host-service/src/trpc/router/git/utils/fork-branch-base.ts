import { TRPCError } from "@trpc/server";
import type { SimpleGit } from "simple-git";
import { gitConfigWrite } from "./config-write";

export interface ForkBranchBase {
	baseBranch: string | null;
	currentBranch?: string;
	source?: "configured" | "reflog" | "default" | "unknown";
	needsSelection?: boolean;
}

async function configuredBase(git: SimpleGit, branch: string) {
	return (
		await git.raw(["config", `branch.${branch}.base`]).catch(() => "")
	).trim();
}

async function hasRef(git: SimpleGit, ref: string) {
	return git
		.raw(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])
		.then(
			(value) => /^[0-9a-f]{40,64}$/.test(value.trim()),
			() => false,
		);
}

async function branchRef(git: SimpleGit, name: string) {
	if (name === "HEAD" || /[~^:@{}\s]/.test(name)) return null;
	for (const ref of [
		name.startsWith("refs/heads/") || name.startsWith("refs/remotes/")
			? name
			: `refs/heads/${name}`,
		`refs/remotes/${name}`,
		`refs/remotes/origin/${name}`,
	]) {
		if (await hasRef(git, ref)) return ref;
	}
	return null;
}

export async function forkDetectBranchBase(
	git: SimpleGit,
): Promise<ForkBranchBase> {
	const currentBranch = (
		await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
	).trim();
	if (!currentBranch || currentBranch === "HEAD")
		return {
			baseBranch: null,
			currentBranch,
			source: "unknown",
			needsSelection: true,
		};
	const configured = await configuredBase(git, currentBranch);
	if (configured)
		return {
			baseBranch: configured,
			currentBranch,
			source: "configured",
			needsSelection: !(await branchRef(git, configured)),
		};
	const defaultRef = await git
		.raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])
		.catch(() => "");
	if (defaultRef.trim() === `origin/${currentBranch}`)
		return {
			baseBranch: currentBranch,
			currentBranch,
			source: "default",
			needsSelection: false,
		};
	const reflog = await git
		.raw([
			"reflog",
			"show",
			"--format=%H%x09%gs",
			`refs/heads/${currentBranch}`,
		])
		.catch(() => "");
	const created = reflog
		.split("\n")
		.reverse()
		.find((line) => line.includes("\tbranch: Created from "));
	let origin = created?.split("\tbranch: Created from ")[1]?.trim();
	if (origin === "HEAD") {
		const headLog = await git
			.raw(["reflog", "show", "--format=%H%x09%gs", "HEAD"])
			.catch(() => "");
		const prefix = `${created?.split("\t")[0]}\tcheckout: moving from `;
		const suffix = ` to ${currentBranch}`;
		const candidates = new Set(
			headLog
				.split("\n")
				.filter((line) => line.startsWith(prefix) && line.endsWith(suffix))
				.map((line) => line.slice(prefix.length, -suffix.length)),
		);
		origin = candidates.size === 1 ? [...candidates][0] : undefined;
	}
	const ref = origin ? await branchRef(git, origin) : null;
	if (origin && ref && ref !== `refs/heads/${currentBranch}`)
		return {
			baseBranch: ref.replace(/^refs\/(heads|remotes)\//, ""),
			currentBranch,
			source: "reflog",
			needsSelection: false,
		};
	return {
		baseBranch: null,
		currentBranch,
		source: "unknown",
		needsSelection: true,
	};
}

const writes = new Map<string, Promise<unknown>>();

export async function forkSetBranchBase(
	git: SimpleGit,
	input: {
		baseBranch: string | null;
		expectedBranch?: string;
		onlyIfUnset?: boolean;
	},
): Promise<{ baseBranch: string | null }> {
	const commonDir = (
		await git.raw(["rev-parse", "--path-format=absolute", "--git-common-dir"])
	).trim();
	const previous = writes.get(commonDir) ?? Promise.resolve();
	const next = previous
		.catch(() => {})
		.then(async () => {
			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"])
			).trim();
			if (!currentBranch || currentBranch === "HEAD")
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cannot set base branch on detached HEAD",
				});
			if (input.expectedBranch && input.expectedBranch !== currentBranch)
				return { baseBranch: null };
			const saved = await configuredBase(git, currentBranch);
			if (input.onlyIfUnset && saved) return { baseBranch: saved };
			if (input.baseBranch) {
				await gitConfigWrite(git, [
					"config",
					`branch.${currentBranch}.base`,
					input.baseBranch,
				]);
			} else {
				await gitConfigWrite(git, [
					"config",
					"--unset",
					`branch.${currentBranch}.base`,
				]).catch(() => {});
			}
			return { baseBranch: input.baseBranch };
		});
	writes.set(commonDir, next);
	try {
		return await next;
	} finally {
		if (writes.get(commonDir) === next) writes.delete(commonDir);
	}
}

export async function forkExplicitComparisonBase(
	git: SimpleGit,
	branchName: string,
) {
	if (branchName === "HEAD")
		return { branchName, baseRef: "HEAD", fetchTarget: null };
	const remote = branchName.replace(/^refs\/remotes\//, "");
	if (await hasRef(git, `refs/remotes/${remote}`)) {
		const [remoteName, ...path] = remote.split("/");
		return {
			branchName,
			baseRef: `refs/remotes/${remote}`,
			fetchTarget: { remote: remoteName ?? "origin", branch: path.join("/") },
		};
	}
	if (await hasRef(git, `refs/remotes/origin/${branchName}`)) return null;
	const local = branchName.replace(/^refs\/heads\//, "");
	if (await hasRef(git, `refs/heads/${local}`))
		return { branchName, baseRef: `refs/heads/${local}`, fetchTarget: null };
	return null;
}
