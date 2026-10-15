import { describe, expect, it } from "bun:test";
import { pickFolderForPath } from "./pickFolderForPath";

const folders = [{ path: "/code/api" }, { path: "/code/api/vendor" }];

describe("pickFolderForPath", () => {
	it("picks the deepest folder holding the path", () => {
		expect(pickFolderForPath(folders, "/code/api/vendor/a.ts")).toBe(
			folders[1],
		);
		expect(pickFolderForPath(folders, "/code/api/src/a.ts")).toBe(folders[0]);
	});

	it("returns null for paths outside every folder", () => {
		expect(pickFolderForPath(folders, "/code/apiary/a.ts")).toBeNull();
	});
});
