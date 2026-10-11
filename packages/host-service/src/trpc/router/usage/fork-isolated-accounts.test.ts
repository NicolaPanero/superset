import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../db";
import { ForkAccountRegistry } from "./fork-account-registry";
import {
	assertIsolatedAccount,
	independentProfile,
	isolatedAccountOptions,
	projectIsolatedQuota,
} from "./fork-isolated-accounts";
import { ensureIsolatedDefault } from "./fork-isolated-default";
import type { UsageAccount } from "./types";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
const identity = (email: string) => ({
	email,
	identity: createHash("sha256").update(email).digest("hex"),
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "fork-isolated-profiles-"));
	roots.push(root);
	const profile = {
		selection: join(root, ".claude-work"),
		credentialKind: "subscription" as const,
	};
	let current: ReturnType<typeof identity> | null = identity(
		"work@example.invalid",
	);
	let profiles = [profile];
	const dependencies = {
		registry: new ForkAccountRegistry(join(root, "accounts")),
		discovered: async () => profiles,
		identity: async () => current,
		independent: async () => true,
	};
	return {
		root,
		profile,
		dependencies,
		signIn: (email: string) => {
			current = identity(email);
		},
		logout: () => {
			current = null;
			profiles = [];
		},
	};
}

describe("isolated account profiles", () => {
	it("remembers only identity metadata, survives restart and does not replace a profile with another login", async () => {
		const f = fixture();
		const before = await isolatedAccountOptions("claude", f.dependencies);
		f.signIn("other@example.invalid");
		const after = await isolatedAccountOptions("claude", {
			...f.dependencies,
			registry: new ForkAccountRegistry(join(f.root, "accounts")),
		});
		if (!before[0]) throw new Error("Expected an isolated profile");
		expect(after).toEqual([{ ...before[0], reconnect: true }]);
		expect(after[0]?.label).toBe("work@example.invalid");
		const files = readdirSync(join(f.root, "accounts"));
		expect(files).toHaveLength(1);
		const saved = JSON.parse(
			readFileSync(join(f.root, "accounts", files[0] as string), "utf8"),
		);
		expect(Object.keys(saved).sort()).toEqual([
			"agent",
			"credentialKind",
			"email",
			"identity",
			"selection",
		]);
	});

	it("keeps a logged-out or missing profile visible until it is explicitly removed", async () => {
		const f = fixture();
		await isolatedAccountOptions("claude", f.dependencies);
		f.logout();
		expect(await isolatedAccountOptions("claude", f.dependencies)).toEqual([
			{
				selection: f.profile.selection,
				label: "work@example.invalid",
				managed: true,
				reconnect: true,
				credentialKind: "subscription",
			},
		]);
		f.dependencies.registry.forget("claude", f.profile.selection);
		expect(await isolatedAccountOptions("claude", f.dependencies)).toEqual([]);
	});

	it("does not adopt a profile with a shared authentication file", async () => {
		const f = fixture();
		mkdirSync(f.profile.selection);
		const external = join(f.root, "external-state.json");
		writeFileSync(
			external,
			JSON.stringify({
				oauthAccount: {
					accountUuid: "work",
					emailAddress: "work@example.invalid",
				},
			}),
		);
		symlinkSync(external, join(f.profile.selection, ".claude.json"));
		expect(
			await isolatedAccountOptions("claude", {
				...f.dependencies,
				independent: independentProfile,
			}),
		).toEqual([]);
		expect(f.dependencies.registry.list()).toEqual([]);
	});

	it("permits the original identity after reconnecting, without losing the saved name", async () => {
		const f = fixture();
		await isolatedAccountOptions("claude", f.dependencies);
		f.signIn("different@example.invalid");
		expect(
			(await isolatedAccountOptions("claude", f.dependencies))[0]?.reconnect,
		).toBe(true);
		f.signIn("work@example.invalid");
		expect(
			(await isolatedAccountOptions("claude", f.dependencies))[0]?.reconnect,
		).toBe(false);
	});

	it("rejects launching a disconnected profile before spawning any agent", async () => {
		const f = fixture();
		await isolatedAccountOptions("claude", f.dependencies);
		const row = {
			agent: "claude",
			selection: f.profile.selection,
			credentialKind: "subscription",
			status: "signed_out",
		} as UsageAccount;
		const deps = {
			options: () => isolatedAccountOptions("claude", f.dependencies),
			quota: async () => [row],
		};
		await expect(
			assertIsolatedAccount("claude", f.profile.selection, deps),
		).rejects.toThrow("Reconnect account");
		row.status = "token_stale";
		await expect(
			assertIsolatedAccount("claude", f.profile.selection, deps),
		).resolves.toBeUndefined();
		f.signIn("different@example.invalid");
		await expect(
			assertIsolatedAccount("claude", f.profile.selection, deps),
		).rejects.toThrow("Reconnect account");
	});

	it("keeps CLI quota separate and never assigns a changed login's quota to the saved profile", async () => {
		const f = fixture();
		await isolatedAccountOptions("claude", f.dependencies);
		f.signIn("other@example.invalid");
		const options = await isolatedAccountOptions("claude", f.dependencies);
		const external = {
			agent: "claude",
			credentialKind: "subscription",
			selection: null,
			email: "other@example.invalid",
			windows: [{ id: "five_hour", usedPercent: 1 }],
		} as UsageAccount;
		const changed = { ...external, selection: f.profile.selection };
		const projected = projectIsolatedQuota(
			[external, changed],
			f.dependencies.registry.list(),
			{ claude: options, codex: [] },
		);
		expect(projected[0]).toBe(external);
		expect(projected[1]).toMatchObject({
			email: "work@example.invalid",
			selection: f.profile.selection,
			status: "signed_out",
			windows: [],
		});
		f.signIn("work@example.invalid");
		const ready = await isolatedAccountOptions("claude", f.dependencies);
		expect(
			projectIsolatedQuota(
				[external, changed],
				f.dependencies.registry.list(),
				{ claude: ready, codex: [] },
			)[1]?.windows,
		).toEqual(changed.windows);
	});

	it("uses an isolated subscription for the initial default and preserves the choice after logout", async () => {
		const f = fixture();
		let selected: string | null = null;
		const deps = {
			defaults: () => ({ claudeConfigDir: selected, codexHome: null }),
			options: () => isolatedAccountOptions("claude", f.dependencies),
			set: (_db: HostDb, _agent: string, value: string | null) => {
				selected = value;
			},
		};
		expect(await ensureIsolatedDefault({} as HostDb, "claude", deps)).toBe(
			f.profile.selection,
		);
		f.logout();
		expect(await ensureIsolatedDefault({} as HostDb, "claude", deps)).toBe(
			f.profile.selection,
		);
		expect(deps.defaults().claudeConfigDir).toBe(f.profile.selection);
	});
});
