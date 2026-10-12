import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import {
	accountProfileSlug,
	FORK_LOGIN_MARKER,
	finishForkAccountLogin,
	keychainRetargetScript,
	nameForkAccountProfile,
	pendingAccountSelection,
} from "./fork-account-naming";
import { ForkAccountRegistry } from "./fork-account-registry";
import { independentProfile } from "./fork-isolated-accounts";
import { readAccountIdentity } from "./session-account/session-account";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
const id = "34c89ba6-f34e-41d4-b351-76f90b58a0d4";
function fixture(
	agent: "claude" | "codex" = "claude",
	email = "b4b@siapcn.it",
) {
	const home = mkdtempSync(join(tmpdir(), "fork-account-naming-"));
	roots.push(home);
	const source = pendingAccountSelection(home, agent, id);
	mkdirSync(source);
	if (agent === "claude")
		writeFileSync(
			join(source, ".claude.json"),
			JSON.stringify({
				oauthAccount: { accountUuid: "fixture", emailAddress: email },
			}),
		);
	else
		writeFileSync(
			join(source, "auth.json"),
			JSON.stringify({
				tokens: {
					access_token: "fake",
					account_id: "fixture",
					id_token: `x.${Buffer.from(JSON.stringify({ email, sub: "fixture" })).toString("base64url")}.x`,
				},
			}),
		);
	const moves: Array<[string, string]> = [];
	const deps = {
		home,
		registry: new ForkAccountRegistry(join(home, "registry")),
		identity: readAccountIdentity,
		independent: independentProfile,
		keychain: async (from: string, to: string) => {
			moves.push([from, to]);
		},
	};
	const input = { agent, credentialKind: "subscription" as const, loginId: id };
	return {
		home,
		source,
		deps,
		input,
		moves,
		complete: () =>
			writeFileSync(
				join(source, FORK_LOGIN_MARKER),
				`${agent}:superset-login-${id}`,
			),
	};
}

describe("automatic account profile naming", () => {
	it("names a completed Claude profile from its own email and keeps state and permissions", async () => {
		const f = fixture();
		f.complete();
		writeFileSync(
			join(f.source, "settings.json"),
			'{"permissions":{"allow":[]}}',
		);
		const result = await finishForkAccountLogin(f.input, f.deps);
		const target = join(f.home, ".claude-b4b-siapcn-it");
		expect(result).toEqual({
			selection: target,
			label: "b4b@siapcn.it",
			credentialKind: "subscription",
		});
		expect(existsSync(f.source)).toBe(false);
		expect(readFileSync(join(target, "settings.json"), "utf8")).toBe(
			'{"permissions":{"allow":[]}}',
		);
		expect(f.moves).toEqual([[f.source, target]]);
		expect(f.deps.registry.list()[0]).toMatchObject({
			email: "b4b@siapcn.it",
			selection: target,
		});
	});

	it("waits for successful CLI completion instead of renaming a login in progress", async () => {
		const f = fixture();
		expect(await finishForkAccountLogin(f.input, f.deps)).toBeNull();
		expect(f.moves).toHaveLength(0);
		expect(existsSync(f.source)).toBe(true);
		expect(f.deps.registry.list()).toEqual([]);
	});

	it("coalesces simultaneous polls and returns the same profile after a response is lost", async () => {
		const f = fixture();
		f.complete();
		const [a, b] = await Promise.all([
			finishForkAccountLogin(f.input, f.deps),
			finishForkAccountLogin(f.input, f.deps),
		]);
		expect(a).toEqual(b);
		expect(await finishForkAccountLogin(f.input, f.deps)).toEqual(a);
		expect(f.moves).toHaveLength(1);
		expect(f.deps.registry.list()).toHaveLength(1);
	});

	it("keeps its receipt if another account scan adopts the renamed directory first", async () => {
		const f = fixture();
		f.complete();
		const deps = {
			...f.deps,
			identity: async (agent: "claude" | "codex", directory: string) => {
				const identity = await readAccountIdentity(agent, directory);
				if (directory !== f.source && identity)
					f.deps.registry.remember({
						agent,
						selection: directory,
						credentialKind: "subscription",
						...identity,
					});
				return identity;
			},
		};
		const result = await finishForkAccountLogin(f.input, deps);
		expect(await finishForkAccountLogin(f.input, deps)).toEqual(result);
		expect(f.deps.registry.list()).toHaveLength(1);
		expect(f.moves).toHaveLength(1);
	});

	it("does not overwrite an existing folder, even when it is empty", async () => {
		const f = fixture();
		f.complete();
		const occupied = join(f.home, ".claude-b4b-siapcn-it");
		mkdirSync(occupied);
		expect((await finishForkAccountLogin(f.input, f.deps))?.selection).toBe(
			`${occupied}-2`,
		);
		expect(existsSync(occupied)).toBe(true);
	});

	it("reserves names belonging to disconnected profiles whose folder is missing", async () => {
		const f = fixture();
		f.complete();
		const occupied = join(f.home, ".claude-b4b-siapcn-it");
		f.deps.registry.remember({
			agent: "claude",
			selection: occupied,
			credentialKind: "subscription",
			email: "b4b@siapcn.it",
			identity: createHash("sha256").update("other identity").digest("hex"),
		});
		expect((await finishForkAccountLogin(f.input, f.deps))?.selection).toBe(
			`${occupied}-2`,
		);
	});

	it("names Codex profiles from their verified identity without touching the Claude Keychain", async () => {
		const f = fixture("codex", "Another.User@example.invalid");
		f.complete();
		expect((await finishForkAccountLogin(f.input, f.deps))?.selection).toBe(
			join(f.home, ".codex-another-user-example-invalid"),
		);
		expect(f.moves).toHaveLength(0);
	});

	it("gives an API profile without an email a unique name without reading its key", async () => {
		const f = fixture("codex");
		f.complete();
		writeFileSync(join(f.source, ".superset-api-billing"), "codex");
		writeFileSync(
			join(f.source, "auth.json"),
			"not JSON; the secret must not be read",
		);
		const result = await finishForkAccountLogin(
			{ ...f.input, credentialKind: "api_key" },
			f.deps,
		);
		expect(result?.selection).toBe(join(f.home, ".codex-api-34c89ba6"));
		expect(f.deps.registry.list()[0]?.identity).toBeNull();
	});

	it("preserves the original profile and releases the reserved name after a Keychain error", async () => {
		const f = fixture();
		f.complete();
		await expect(
			finishForkAccountLogin(f.input, {
				...f.deps,
				keychain: async () => {
					throw new Error("keychain denied");
				},
			}),
		).rejects.toThrow("keychain denied");
		expect(existsSync(f.source)).toBe(true);
		expect(existsSync(join(f.home, ".claude-b4b-siapcn-it"))).toBe(false);
		expect(f.deps.registry.list()).toEqual([]);
	});

	it("rolls back the folder and scoped login if registry persistence fails", async () => {
		const f = fixture();
		f.complete();
		for (let i = 0; i < 128; i++)
			f.deps.registry.remember({
				agent: "claude",
				selection: join(f.home, `reserved-${i}`),
				credentialKind: "api_key",
				email: null,
				identity: null,
			});
		await expect(finishForkAccountLogin(f.input, f.deps)).rejects.toThrow(
			"account_registry_limit",
		);
		expect(existsSync(f.source)).toBe(true);
		expect(f.moves).toEqual([
			[f.source, join(f.home, ".claude-b4b-siapcn-it")],
			[join(f.home, ".claude-b4b-siapcn-it"), f.source],
		]);
	});

	it("rejects a changed identity on a completed receipt rather than borrowing its name", async () => {
		const f = fixture();
		f.complete();
		const result = await finishForkAccountLogin(f.input, f.deps);
		if (!result) throw new Error("expected profile");
		writeFileSync(
			join(result.selection, ".claude.json"),
			JSON.stringify({
				oauthAccount: {
					accountUuid: "different",
					emailAddress: "changed@example.invalid",
				},
			}),
		);
		await expect(finishForkAccountLogin(f.input, f.deps)).rejects.toThrow(
			"account_login_identity_changed",
		);
	});

	it("rejects arbitrary paths, symlinks and linked authentication files", async () => {
		const f = fixture();
		f.complete();
		expect(() =>
			pendingAccountSelection(f.home, "claude", "../../.claude"),
		).toThrow("account_login_invalid");
		const link = join(f.home, ".claude-link");
		symlinkSync(f.source, link);
		await expect(
			nameForkAccountProfile({ ...f.input, selection: link }, f.deps),
		).rejects.toThrow("account_login_invalid");
		const original = join(f.home, "identity.json");
		writeFileSync(original, readFileSync(join(f.source, ".claude.json")));
		rmSync(join(f.source, ".claude.json"));
		symlinkSync(original, join(f.source, ".claude.json"));
		await expect(finishForkAccountLogin(f.input, f.deps)).rejects.toThrow(
			"account_login_invalid",
		);
	});

	it("sanitizes emails as bounded folder names instead of shell or path syntax", () => {
		expect(accountProfileSlug(" B4B@siapcn.it ")).toBe("b4b-siapcn-it");
		expect(accountProfileSlug("../../$(echo example);@email.invalid")).toBe(
			"echo-example-email-invalid",
		);
		expect(accountProfileSlug("a".repeat(320))).toHaveLength(100);
	});
});

describe("native Keychain rename", () => {
	function simulate(
		pairs: Array<readonly [string, string]>,
		entries: Map<string, unknown>,
		deny?: string,
	) {
		const bridge = Object.assign((value: unknown) => value, {
			SecItemUpdate: (
				query: { svce: string },
				attributes: { svce: string },
			) => {
				if (query.svce === deny) return -25293;
				if (!entries.has(query.svce)) return -25300;
				if (entries.has(attributes.svce)) return -25299;
				entries.set(attributes.svce, entries.get(query.svce));
				entries.delete(query.svce);
				return 0;
			},
		});
		return JSON.parse(
			runInNewContext(keychainRetargetScript(pairs), {
				ObjC: { import: () => {} },
				$: bridge,
			}),
		) as { ok: boolean; rollback: boolean; changed: number };
	}
	it("preserves password and access permissions when changing only the service", () => {
		const record = {
			secret: "fake fixture",
			trustedApplication: "provider CLI",
		};
		const entries = new Map([["old", record]]);
		expect(simulate([["old", "new"]], entries)).toEqual({
			ok: true,
			rollback: true,
			changed: 1,
		});
		expect(entries.get("new")).toBe(record);
		expect(entries.has("old")).toBe(false);
	});
	it("does not manufacture credentials when the login is stored in a file", () => {
		const entries = new Map<string, unknown>();
		expect(simulate([["absent", "new"]], entries)).toEqual({
			ok: true,
			rollback: true,
			changed: 0,
		});
		expect(entries.size).toBe(0);
	});
	it("rolls back earlier service changes instead of overwriting another account", () => {
		const entries = new Map([
			["old1", "first"],
			["old2", "second"],
			["occupied", "existing account"],
		]);
		expect(
			simulate(
				[
					["old1", "new1"],
					["old2", "occupied"],
				],
				entries,
			),
		).toEqual({ ok: false, rollback: true, changed: 0 });
		expect(entries).toEqual(
			new Map([
				["old1", "first"],
				["old2", "second"],
				["occupied", "existing account"],
			]),
		);
	});
	it("reports a permissions error without altering the original login", () => {
		const entries = new Map([["old", "existing account"]]);
		expect(simulate([["old", "new"]], entries, "old")).toEqual({
			ok: false,
			rollback: true,
			changed: 0,
		});
		expect(entries.get("old")).toBe("existing account");
	});
});
