import { expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnCodexTransport } from "@superset/chat-runtime/fork-quota-rpc";
import { withCodexResetRpc } from "./fork-account-resets";

async function setup() {
	const root = await realpath(await mkdtemp(join(tmpdir(), "fork-reset-rpc-")));
	const bin = join(root, "bin"),
		profile = join(root, "profile"),
		probes = join(root, "probes");
	await mkdir(bin);
	await mkdir(profile);
	await writeFile(
		join(bin, "codex"),
		`#!${process.execPath}\nimport {createInterface} from "node:readline";\nimport {appendFileSync,writeFileSync} from "node:fs";\nconst root=${JSON.stringify(root)};\nwriteFileSync(root+"/options.json",JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),profile:process.env.CODEX_HOME,keys:["OPENAI_API_KEY","CODEX_API_KEY","ANTHROPIC_API_KEY","SUPERSET_HOOKS_DIR"].filter(k=>process.env[k])}));\ncreateInterface({input:process.stdin}).on("line",line=>{const frame=JSON.parse(line);appendFileSync(root+"/requests.jsonl",JSON.stringify(frame)+"\\n");if(frame.id===undefined)return;const result=frame.method==="initialize"?{userAgent:"codex-cli 0.159.2"}:frame.method==="account/read"?{account:{type:"chatgpt",email:"work@example.invalid"}}:frame.method==="account/rateLimits/read"?{rateLimitResetCredits:{availableCount:1,credits:null}}:{outcome:"reset"};console.log(JSON.stringify({id:frame.id,result}));});\n`,
		{ mode: 0o755 },
	);
	const settings = {
		baseEnv: async () => ({
			PATH: bin,
			OPENAI_API_KEY: "fake-unused",
			CODEX_API_KEY: "fake-unused",
			ANTHROPIC_API_KEY: "fake-unused",
			SUPERSET_HOOKS_DIR: "fake-unused",
		}),
		root: () => probes,
		spawn: spawnCodexTransport,
	};
	return { root, profile, probes, settings };
}

test("the reset RPC uses a dedicated directory and profile without model turns, API keys, hooks or MCP", async () => {
	const f = await setup();
	try {
		await withCodexResetRpc(
			f.profile,
			async (rpc) => {
				await rpc.request("account/read", { refreshToken: true });
				await rpc.request("account/rateLimits/read");
				return rpc.request("account/rateLimitResetCredit/consume", {
					idempotencyKey: "5c55a376-5263-41c5-a86c-3994ee645b48",
					creditId: "fake-credit",
				});
			},
			1000,
			f.settings,
		);
		const options = JSON.parse(
			await readFile(join(f.root, "options.json"), "utf8"),
		);
		expect(options.profile).toBe(f.profile);
		expect(options.keys).toEqual([]);
		expect(options.cwd.startsWith(f.probes)).toBe(true);
		expect(options.args).toContain("mcp_servers={}");
		expect(options.args).toContain("notify=[]");
		expect(options.args).toContain("features.hooks=false");
		const requests = (await readFile(join(f.root, "requests.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(requests.map((row) => row.method)).toEqual([
			"initialize",
			"initialized",
			"account/read",
			"account/rateLimits/read",
			"account/rateLimitResetCredit/consume",
		]);
		expect(await readdir(f.probes)).toEqual([]);
	} finally {
		await rm(f.root, { recursive: true, force: true });
	}
});

test("a short injected timeout closes the RPC and removes its temporary directory", async () => {
	const f = await setup();
	let closed = false;
	try {
		await expect(
			withCodexResetRpc(f.profile, async () => null, 5, {
				...f.settings,
				spawn: () => ({
					send: () => {},
					close: async () => {
						closed = true;
					},
				}),
			}),
		).rejects.toThrow("reset_timeout");
		expect(closed).toBe(true);
		expect(await readdir(f.probes)).toEqual([]);
	} finally {
		await rm(f.root, { recursive: true, force: true });
	}
});
