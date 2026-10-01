import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const open = mock(async (_input: unknown) => ({ paneIds: ["pane-1"] }));
const resolveFilesTarget = mock(async () => ({
	workspaceId: "ws-1",
	hostId: "host-1",
	client: { files: { open: { mutate: open } } },
}));
mock.module("./utils/resolveFilesTarget", () => ({ resolveFilesTarget }));
const { default: command } = await import("./command");

let tempDir: string;
// After chdir, process.cwd() is the real path (macOS keeps /var under /private).
let cwd: string;
const originalCwd = process.cwd();

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "files-open-"));
	process.chdir(tempDir);
	cwd = process.cwd();
	open.mockClear();
	resolveFilesTarget.mockClear();
});

afterEach(() => {
	process.chdir(originalCwd);
	rmSync(tempDir, { recursive: true, force: true });
});

async function invoke(
	paths: string[],
	options: Partial<{
		workspace: string;
		host: string;
		local: boolean;
		line: number;
		newTab: boolean;
	}> = {},
): Promise<{ data: unknown; message: string }> {
	const result = await command.run({
		ctx: {} as never,
		args: { paths } as never,
		options: options as never,
		signal: new AbortController().signal,
	});
	return result as { data: unknown; message: string };
}

describe("files open", () => {
	test("resolves paths against the cwd and splits beside the active pane by default", async () => {
		const result = await invoke(["src/a.ts", "/abs/b.ts"]);
		expect(open).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			paths: [join(cwd, "src/a.ts"), "/abs/b.ts"],
			line: undefined,
			target: "current-tab",
		});
		expect(result.data).toEqual({
			workspaceId: "ws-1",
			paths: [join(cwd, "src/a.ts"), "/abs/b.ts"],
			paneIds: ["pane-1"],
		});
		expect(resolveFilesTarget).toHaveBeenLastCalledWith(
			{},
			{ workspace: undefined, host: undefined, local: undefined },
			cwd,
		);
	});

	test("forwards --line, --new-tab, and the workspace flags", async () => {
		await invoke(["a.ts"], {
			workspace: "ws-9",
			host: "host-9",
			local: true,
			line: 42,
			newTab: true,
		});
		expect(open).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			paths: [join(cwd, "a.ts")],
			line: 42,
			target: "new-tab",
		});
		expect(resolveFilesTarget).toHaveBeenLastCalledWith(
			{},
			{ workspace: "ws-9", host: "host-9", local: true },
			cwd,
		);
	});

	test("refuses --line with several files before resolving a workspace", async () => {
		await expect(invoke(["a.ts", "b.ts"], { line: 3 })).rejects.toThrow(
			"--line applies to a single file",
		);
		expect(resolveFilesTarget).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
	});

	test("prints one pane line per opened file", async () => {
		open.mockResolvedValueOnce({ paneIds: ["pane-1", "pane-2"] });
		const result = await invoke(["a.ts", "b.ts"]);
		expect(result.message).toBe(
			"Opened 2 files in workspace ws-1\npane: pane-1\npane: pane-2",
		);
	});
});
