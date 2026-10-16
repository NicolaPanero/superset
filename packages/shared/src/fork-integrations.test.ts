import { expect, test } from "bun:test";
import {
	forkRepositoryKey,
	forkTaskBranch,
	parseForkRemote,
} from "./fork-integrations";

test("SSH and HTTPS remotes identify the same repository without mixing providers", () => {
	const github = parseForkRemote("git@github.com:Org/Repo.git")!;
	expect(forkRepositoryKey(github)).toBe(
		forkRepositoryKey(parseForkRemote("https://github.com/org/repo")!),
	);
	expect(forkRepositoryKey(github)).not.toBe(
		forkRepositoryKey(parseForkRemote("ssh://git@bitbucket.org/org/repo.git")!),
	);
	expect(
		parseForkRemote("https://github.com.attacker.example/org/repo"),
	).toBeNull();
	expect(parseForkRemote("file:///org/repo")).toBeNull();
});
test("Jira branch names preserve the issue key and remove unsafe title characters", () => {
	expect(forkTaskBranch("APP-12", "Fix à / issue: one")).toBe(
		"feature/APP-12-fix-a-issue-one",
	);
});
