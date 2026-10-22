import { expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearShellEnvCache, execWithShellEnv } from "./shell-env";

test.skipIf(process.platform !== "darwin" || !existsSync("/bin/zsh"))(
	"a missing tool does not hide a tool found on the login-shell PATH checked at the same time",
	async () => {
		const home = mkdtempSync(join(realpathSync(tmpdir()), "fork-shell-race-"));
		const tools = join(home, "tools");
		mkdirSync(tools);
		const brew = join(tools, "fork-brew-probe");
		writeFileSync(brew, "#!/bin/sh\necho Homebrew 4.6.0\n");
		chmodSync(brew, 0o755);
		writeFileSync(join(home, ".zshrc"), `export PATH="${tools}:$PATH"\n`);
		const saved = {
			PATH: process.env.PATH,
			SHELL: process.env.SHELL,
			ZDOTDIR: process.env.ZDOTDIR,
		};
		process.env.PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
		process.env.SHELL = "/bin/zsh";
		process.env.ZDOTDIR = home;
		clearShellEnvCache();
		try {
			const [gh, found] = await Promise.allSettled([
				execWithShellEnv("fork-gh-not-installed", ["--version"]),
				execWithShellEnv("fork-brew-probe", ["--version"]),
			]);
			expect(gh.status).toBe("rejected");
			expect(found).toMatchObject({
				status: "fulfilled",
				value: { stdout: "Homebrew 4.6.0\n" },
			});
		} finally {
			for (const [key, value] of Object.entries(saved)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			clearShellEnvCache();
			rmSync(home, { recursive: true, force: true });
		}
	},
);
