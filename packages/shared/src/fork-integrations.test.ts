import { expect, test } from "bun:test";
import {
	forkRepositoryKey,
	forkTaskBranch,
	parseForkRemote,
} from "./fork-integrations";

test("SSH and HTTPS remotes identify the same repository without mixing providers", () => {
	const key = (remote: string) => {
		const ref = parseForkRemote(remote);
		if (!ref) throw new Error(`unparsed remote ${remote}`);
		return forkRepositoryKey(ref);
	};
	const github = key("git@github.com:Org/Repo.git");
	expect(github).toBe(key("https://github.com/org/repo"));
	expect(github).not.toBe(key("ssh://git@bitbucket.org/org/repo.git"));
	expect(
		parseForkRemote("https://github.com.attacker.example/org/repo"),
	).toBeNull();
	expect(parseForkRemote("file:///org/repo")).toBeNull();
});
test("Jira branch names preserve the issue key and remove unsafe title characters", () => {
	expect(forkTaskBranch("APP-12", "Fix à / issue: one")).toBe(
		"APP-12-fix-a-issue-one",
	);
});
