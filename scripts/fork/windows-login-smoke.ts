import assert from "node:assert/strict";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
	encodeWindowsCommand,
	windowsLoginCommand,
	windowsLoginScript,
} from "../../apps/desktop/src/renderer/routes/_authenticated/settings/usage/components/UsageView/utils/forkWindowsLogin/forkWindowsLogin";
import { getCommandShellArgs } from "../../packages/agent-setup/src/shell-wrappers";

if (process.platform !== "win32")
	throw new Error("Use the Windows runner for login smoke tests");
const root = await mkdtemp(join(tmpdir(), "fork-logins-")),
	bin = join(root, "bin"),
	home = join(root, "home à ' test");
const childEnvironment = { ...process.env };
const originalPath =
	Object.entries(process.env).find(
		([key]) => key.toLowerCase() === "path",
	)?.[1] || "";
for (const key of Object.keys(childEnvironment))
	if (
		["path", "userprofile", "fork_fake_login_fail"].includes(key.toLowerCase())
	)
		delete childEnvironment[key];
childEnvironment.Path = `${bin}${delimiter}${originalPath}`;
childEnvironment.USERPROFILE = home;
async function run(command: string, args: string[]) {
	const child = Bun.spawn([command, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		env: childEnvironment,
	});
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { code, stdout, stderr };
}
try {
	await mkdir(bin);
	await mkdir(home);
	const source = join(root, "Login.cs");
	await writeFile(
		source,
		`using System;using System.IO;using System.Diagnostics;
class Login {static int Main(string[] args) {
 string agent=Path.GetFileNameWithoutExtension(Process.GetCurrentProcess().MainModule.FileName);
 string profile=Environment.GetEnvironmentVariable(agent=="claude"?"CLAUDE_CONFIG_DIR":"CODEX_HOME");
 if(Environment.GetEnvironmentVariable("FORK_FAKE_LOGIN_FAIL")=="1") return 23;
 Directory.CreateDirectory(profile);File.WriteAllText(Path.Combine(profile,"fixture-profile"),profile);
 if(Array.IndexOf(args,"--with-api-key")>=0) File.WriteAllText(Path.Combine(profile,"fixture-key"),Console.In.ReadLine());
 return 0;
}}`,
	);
	const compiler = join(
		process.env.SystemRoot || "C:\\Windows",
		"Microsoft.NET",
		"Framework64",
		"v4.0.30319",
		"csc.exe",
	);
	const compiled = await run(compiler, [
		"/nologo",
		"/target:exe",
		`/out:${join(bin, "claude.exe")}`,
		source,
	]);
	assert.equal(compiled.code, 0, compiled.stderr + compiled.stdout);
	await copyFile(join(bin, "claude.exe"), join(bin, "codex.exe"));
	const powershell = join(
		process.env.SystemRoot || "C:\\Windows",
		"System32",
		"WindowsPowerShell",
		"v1.0",
		"powershell.exe",
	);
	const cmd =
		process.env.ComSpec ||
		join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
	for (const shell of [cmd, powershell])
		for (const agent of ["claude", "codex"] as const) {
			const slug = `${shell === cmd ? "cmd" : "ps"}-${agent}`,
				profile = join(home, `.${agent}-${slug}`);
			delete childEnvironment.FORK_FAKE_LOGIN_FAIL;
			const successful = await run(
				shell,
				getCommandShellArgs(
					shell,
					windowsLoginCommand({
						agent,
						credentialKind: "subscription",
						slug,
						markCompleted: true,
					}),
				),
			);
			assert.equal(successful.code, 0, successful.stderr + successful.stdout);
			assert.equal(
				(
					await readFile(join(profile, ".superset-login-complete"), "utf8")
				).trim(),
				`${agent}:${slug}`,
			);
			assert.equal(
				await readFile(join(profile, "fixture-profile"), "utf8"),
				profile,
			);
			childEnvironment.FORK_FAKE_LOGIN_FAIL = "1";
			const failed = await run(
				shell,
				getCommandShellArgs(
					shell,
					windowsLoginCommand({
						agent,
						credentialKind: "subscription",
						slug: `${slug}-failed`,
						markCompleted: true,
					}),
				),
			);
			assert.notEqual(failed.code, 0);
			await assert.rejects(
				readFile(
					join(home, `.${agent}-${slug}-failed`, ".superset-login-complete"),
				),
			);
		}
	delete childEnvironment.FORK_FAKE_LOGIN_FAIL;
	const readSecret =
		"function Read-Host { param([string]$Prompt,[switch]$AsSecureString) ConvertTo-SecureString 'fixture-key' -AsPlainText -Force }\n";
	const api = await run(
		cmd,
		getCommandShellArgs(
			cmd,
			encodeWindowsCommand(
				readSecret +
					windowsLoginScript({
						agent: "codex",
						credentialKind: "api_key",
						slug: "api",
						markCompleted: true,
					}),
			),
		),
	);
	assert.equal(api.code, 0, api.stderr + api.stdout);
	assert.equal(
		await readFile(join(home, ".codex-api", "fixture-key"), "utf8"),
		"fixture-key",
	);
	assert.equal(
		(
			await readFile(join(home, ".codex-api", ".superset-api-billing"), "utf8")
		).trim(),
		"codex",
	);
	assert.equal(
		(
			await readFile(
				join(home, ".codex-api", ".superset-login-complete"),
				"utf8",
			)
		).trim(),
		"codex:api",
	);
	console.log(
		"Windows CMD and PowerShell isolated logins, failure markers and API stdin verified with fake CLIs",
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
