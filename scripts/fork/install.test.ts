import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
function fixture(mode = "ok") {
	const root = mkdtempSync(join(tmpdir(), "fork-installer-"));
	roots.push(root);
	const bin = join(root, "bin"),
		destination = join(root, "Applications with spaces"),
		app = join(destination, "Superset++.app"),
		status = join(root, "status"),
		opened = join(root, "opened"),
		payload = join(root, "archive.zip");
	mkdirSync(bin);
	mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
	writeFileSync(
		join(app, "Contents/Info.plist"),
		mode === "official" ? "com.superset.desktop" : "com.superset.desktop.fork",
	);
	writeFileSync(join(app, "Contents/MacOS/Superset++"), "old app");
	writeFileSync(payload, "synthetic archive");
	const digest = createHash("sha256")
		.update(readFileSync(payload))
		.digest("hex");
	const command = (name: string, text: string) =>
		writeFileSync(join(bin, name), `#!/bin/sh\nset -eu\n${text}\n`, {
			mode: 0o755,
		});
	command("uname", 'if [ "$1" = -s ]; then echo Darwin; else echo arm64; fi');
	command(
		"curl",
		mode === "download"
			? "exit 22"
			: `while [ $# -gt 0 ]; do if [ "$1" = -o ]; then /bin/cp ${quote(payload)} "$2"; exit; fi; shift; done; exit 1`,
	);
	command(
		"ditto",
		`mkdir -p "$4/Superset++.app/Contents/MacOS"; printf '%s' ${quote(mode === "bundle" ? "com.superset.desktop" : "com.superset.desktop.fork")} > "$4/Superset++.app/Contents/Info.plist"; printf 'new app' > "$4/Superset++.app/Contents/MacOS/Superset++"; chmod +x "$4/Superset++.app/Contents/MacOS/Superset++"`,
	);
	command("plutil", 'for last; do :; done; cat "$last"');
	command("xattr", "exit 0");
	command(
		"shasum",
		`[ "$*" = "-a 256 -c -" ]; exec ${quote(process.execPath)} -e ${quote("const fs = require('node:fs'); const crypto = require('node:crypto'); const line = fs.readFileSync(0, 'utf8').trimEnd(); const match = /^([a-f0-9]{64})  (.+)$/.exec(line); process.exit(match && crypto.createHash('sha256').update(fs.readFileSync(match[2])).digest('hex') === match[1] ? 0 : 1);")}`,
	);
	command("pgrep", mode === "active" ? "exit 0" : "exit 1");
	command("open", `printf '%s' "$1" > ${quote(opened)}`);
	if (mode === "swap")
		command(
			"mv",
			'case "$1" in */.superset-update.*/Superset++.app) exit 1 ;; esac; /bin/mv "$@"',
		);
	const args = [
		"--app-path",
		app,
		"--download-url",
		"https://github.com/NicolaPanero/superset/releases/download/desktop-v1.37.0-fork.fixture/Superset-fork-arm64.zip",
		"--sha256",
		mode === "checksum" ? "0".repeat(64) : digest,
		"--status-file",
		status,
		"--relaunch",
	];
	const script = resolve(import.meta.dir, "install.sh");
	const stuck = mode === "quit";
	const result = spawnSync(
		"/bin/sh",
		stuck
			? [
					"-c",
					'script=$1; shift; kill() { return 0; }; sleep() { :; }; . "$script"',
					"fixture",
					script,
					...args,
					"--wait-pid",
					"999999",
				]
			: [script, ...args],
		{
			env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
			encoding: "utf8",
		},
	);
	return { root, app, status, opened, destination, result };
}
test("successful installation replaces only the chosen fork bundle and relaunches its exact path", () => {
	const f = fixture();
	expect(f.result.status).toBe(0);
	expect(readFileSync(f.status, "utf8").trim()).toBe("installed");
	expect(readFileSync(join(f.app, "Contents/MacOS/Superset++"), "utf8")).toBe(
		"new app",
	);
	expect(readFileSync(f.opened, "utf8")).toBe(f.app);
	expect(readdirSync(f.destination)).toEqual(["Superset++.app"]);
});
test.each([
	"download",
	"checksum",
	"bundle",
	"official",
	"swap",
	"active",
	"quit",
])("%s failure preserves the installed bundle without relaunching", (mode) => {
	const f = fixture(mode);
	expect(f.result.status).not.toBe(0);
	expect(readFileSync(f.status, "utf8").trim()).toBe("failed");
	expect(readFileSync(join(f.app, "Contents/MacOS/Superset++"), "utf8")).toBe(
		"old app",
	);
	expect(readdirSync(f.root)).not.toContain("opened");
	expect(readdirSync(f.destination)).toEqual(["Superset++.app"]);
});
