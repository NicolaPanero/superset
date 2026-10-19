import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type HostCall = { ok: true; data: unknown } | { ok: false; message: string };
type Host = {
	call: (
		kind: "query" | "mutation",
		path: string,
		input: unknown,
	) => Promise<HostCall>;
	stop: () => Promise<void>;
};

const [executable, appRoot, resources] = process.argv
	.slice(2)
	.map((path) => resolve(path));
if (!executable || !appRoot || !resources)
	throw new Error(
		"Expected the Electron executable, the app root (app.asar or apps/desktop) and the resources directory",
	);

function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() =>
				typeof address === "object" && address
					? resolve(address.port)
					: reject(new Error("No free port")),
			);
		});
		server.on("error", reject);
	});
}

async function git(cwd: string, args: string[]) {
	const child = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [code, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);
	assert.equal(code, 0, `git ${args.join(" ")}: ${stderr}`);
}

const root = await mkdtemp(join(tmpdir(), "fork-import-"));
const projects = join(root, "Progetti à test");
const logs: string[] = [];

async function startHost(name: string, path?: string): Promise<Host> {
	const home = join(root, `home à ${name}`);
	await mkdir(home, { recursive: true });
	const secret = randomBytes(24).toString("hex");
	const port = await freePort();
	const endpoint = `http://127.0.0.1:${port}`;
	const log = join(root, `host-${name}.log`);
	logs.push(log, `${log}.err`);
	const environment: Record<string, string | undefined> = {
		...process.env,
		ELECTRON_RUN_AS_NODE: "1",
		NODE_ENV: "production",
		AUTH_TOKEN: "smoke-token",
		SUPERSET_API_URL: "http://127.0.0.1:9",
		HOST_DB_PATH: join(home, "host.db"),
		HOST_MIGRATIONS_FOLDER: join(resources, "host-migrations"),
		SUPERSET_CHAT_V3_MIGRATIONS: join(resources, "chat-migrations"),
		HOST_SERVICE_SECRET: secret,
		HOST_SERVICE_PORT: String(port),
		HOST_MANIFEST_DIR: home,
		ORGANIZATION_ID: randomUUID(),
		DESKTOP_VITE_PORT: "5927",
		SUPERSET_HOME_DIR: home,
		HOME: home,
		USERPROFILE: home,
	};
	if (path !== undefined)
		for (const key of Object.keys(environment))
			if (key.toLowerCase() === "path") environment[key] = path;
	const child = Bun.spawn(
		[executable, join(appRoot, "dist", "main", "host-service.js")],
		{
			cwd: root,
			env: environment,
			stdout: Bun.file(log),
			stderr: Bun.file(`${log}.err`),
		},
	);
	const call: Host["call"] = async (kind, procedure, input) => {
		const body = JSON.stringify({ json: input });
		const response = await fetch(
			kind === "query"
				? `${endpoint}/trpc/${procedure}?input=${encodeURIComponent(body)}`
				: `${endpoint}/trpc/${procedure}`,
			{
				method: kind === "query" ? "GET" : "POST",
				headers: {
					authorization: `Bearer ${secret}`,
					"content-type": "application/json",
				},
				body: kind === "mutation" ? body : undefined,
			},
		);
		const payload = (await response.json()) as {
			result?: { data?: { json?: unknown } };
			error?: { json?: { message?: string } };
		};
		if (payload.error)
			return { ok: false, message: payload.error.json?.message ?? "unknown" };
		return { ok: true, data: payload.result?.data?.json };
	};
	const stop = async () => {
		child.kill();
		await child.exited;
	};
	for (let attempt = 0; attempt < 300; attempt++) {
		if (child.exitCode !== null)
			throw new Error(`Host service exited with ${child.exitCode}`);
		try {
			if ((await call("query", "health.check", undefined)).ok)
				return { call, stop };
		} catch {}
		await Bun.sleep(200);
	}
	await stop();
	throw new Error("Host service did not become healthy within 60 seconds");
}

async function importFolder(host: Host, repoPath: string) {
	const found = await host.call("query", "project.findByPath", { repoPath });
	if (!found.ok) return found;
	const needsGitInit =
		typeof found.data === "object" &&
		found.data !== null &&
		"needsGitInit" in found.data;
	return host.call("mutation", "project.create", {
		name: repoPath.split(/[\\/]/).pop(),
		mode: { kind: "importLocal", repoPath, initIfNeeded: needsGitInit },
	});
}

const hosts: Host[] = [];
try {
	const gitRepo = join(projects, "repo con spazi");
	const plainFolder = join(projects, "cartella senza git");
	const nested = join(gitRepo, "sotto cartella");
	const noGitBin = join(root, "no-git-bin");
	await mkdir(nested, { recursive: true });
	await mkdir(plainFolder, { recursive: true });
	await mkdir(noGitBin);
	await writeFile(join(gitRepo, "README.md"), "fixture\n");
	await writeFile(join(plainFolder, "notes.txt"), "fixture\n");
	await git(gitRepo, ["init", "--initial-branch=main"]);
	await git(gitRepo, ["add", "."]);
	await git(gitRepo, [
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.com",
		"commit",
		"-m",
		"fixture",
	]);

	const failures: string[] = [];
	const withoutGit = await startHost("senza git", noGitBin);
	hosts.push(withoutGit);
	const missing = await importFolder(withoutGit, gitRepo);
	console.log(`git not installed: ${JSON.stringify(missing)}`);
	if (missing.ok || !missing.message.startsWith("Git is not installed"))
		failures.push(`git not installed: ${JSON.stringify(missing)}`);
	await withoutGit.stop();

	const host = await startHost("utente");
	hosts.push(host);
	for (const [label, folder] of [
		["git repository", gitRepo],
		["subfolder of a git repository", nested],
		["folder without git, no git identity", plainFolder],
	] as const) {
		const result = await importFolder(host, folder);
		console.log(`${label}: ${JSON.stringify(result)}`);
		if (!result.ok) failures.push(`${label}: ${result.message}`);
	}
	const listed = await host.call("query", "project.list", undefined);
	console.log(`project.list: ${JSON.stringify(listed)}`);
	assert.deepEqual(failures, [], failures.join("\n"));
	console.log("Project import verified against the installed host service");
} catch (error) {
	for (const file of logs)
		if (existsSync(file))
			console.error(`--- ${file}\n${await readFile(file, "utf8")}`);
	throw error;
} finally {
	for (const host of hosts) await host.stop().catch(() => {});
	await rm(root, { recursive: true, force: true }).catch(() => {});
}
