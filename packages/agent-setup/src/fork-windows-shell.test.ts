import { expect, test } from "bun:test";
import { getCommandShellArgs } from "./shell-wrappers";

test("Windows command shells execute commands with native flags and no POSIX prelude", () => {
	const command = "powershell.exe -EncodedCommand QQ==";
	expect(
		getCommandShellArgs("C:\\Windows\\System32\\CMD.EXE", command),
	).toEqual(["/d", "/s", "/c", command]);
	for (const shell of [
		"powershell.exe",
		"C:\\Program Files\\PowerShell\\7\\pwsh.exe",
	])
		expect(getCommandShellArgs(shell, command)).toEqual([
			"-NoProfile",
			"-Command",
			command,
		]);
});
