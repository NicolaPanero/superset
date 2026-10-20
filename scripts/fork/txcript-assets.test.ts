import { expect, test } from "bun:test";
import { txcriptAssets } from "./txcript-assets";

test("Windows uses native zipped tools and macOS retains its archive format", () => {
	expect(txcriptAssets("win32", "x64")).toEqual({
		target: "x86_64-pc-windows-msvc",
		extension: "zip",
		executable: ".exe",
	});
	expect(txcriptAssets("darwin", "arm64").extension).toBe("tar.gz");
	expect(() => txcriptAssets("win32", "arm64")).toThrow("Unsupported");
});
