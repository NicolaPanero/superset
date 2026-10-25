import { expect, test } from "bun:test";
import { forkBaseBranchChoice } from "./forkBaseBranchChoice";

test("picking the repository default saves it instead of clearing the base", () => {
	expect(forkBaseBranchChoice(null, "main")).toBe("main");
	expect(forkBaseBranchChoice("develop", "main")).toBe("develop");
	expect(forkBaseBranchChoice(null, undefined)).toBeNull();
});
