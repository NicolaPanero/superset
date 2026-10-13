const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { join } = require("node:path");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const appRequire = createRequire(
	join(process.argv[2], "resources", "app.asar", "package.json"),
);
async function probe() {
	const db = new (appRequire("better-sqlite3"))(":memory:");
	assert.equal(db.prepare("select 42 as value").get().value, 42);
	db.close();
	const ast = appRequire("@ast-grep/napi");
	assert.ok(ast.parse(ast.Lang.JavaScript, "const value = 42;").root());
	const root = mkdtempSync(join(tmpdir(), "fork-native-watcher-"));
	try {
		const watcher = appRequire("@parcel/watcher");
		const snapshot = join(root, "snapshot");
		await watcher.writeSnapshot(root, snapshot);
		assert.ok(Array.isArray(await watcher.getEventsSince(root, snapshot)));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	assert.ok(appRequire("native-keymap").getKeyMap());
	const pty = appRequire("node-pty").spawn(
		process.env.ComSpec || "cmd.exe",
		["/c", "echo fork-native-ok"],
		{ cols: 80, rows: 24 },
	);
	await new Promise((resolve, reject) => {
		let output = "";
		const timer = setTimeout(() => {
			pty.kill();
			reject(new Error("Native PTY did not exit"));
		}, 10000);
		pty.onData((chunk) => (output += chunk));
		pty.onExit(({ exitCode }) => {
			clearTimeout(timer);
			try {
				assert.equal(exitCode, 0);
				assert.match(output, /fork-native-ok/);
				resolve();
			} catch (error) {
				reject(error);
			}
		});
	});
	console.log(
		`Installed Electron native modules OK, ABI ${process.versions.modules}`,
	);
}
probe().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
