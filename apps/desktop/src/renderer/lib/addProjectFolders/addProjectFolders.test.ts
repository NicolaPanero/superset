import { describe, expect, it } from "bun:test";
import { addProjectFolders } from "./addProjectFolders";

describe("addProjectFolders", () => {
	it("keeps adding after a folder fails", async () => {
		const tried: string[] = [];

		const ids = await addProjectFolders(["/a", "/b", "/c"], async (path) => {
			tried.push(path);
			if (path === "/b") throw new Error("already added");
			return { id: `id${path}` };
		});

		expect(tried).toEqual(["/a", "/b", "/c"]);
		expect(ids).toEqual(["id/a", "id/c"]);
	});
});
