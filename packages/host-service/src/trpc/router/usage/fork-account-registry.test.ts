import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ForkAccountRegistry,
	type IsolatedAccount,
} from "./fork-account-registry";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "fork-registry-test-"));
	roots.push(root);
	return { root, registry: new ForkAccountRegistry(root) };
}
function recordName(root: string) {
	const name = readdirSync(root)[0];
	if (!name) throw new Error("Missing registry fixture record");
	return name;
}
function account(patch: Partial<IsolatedAccount> = {}): IsolatedAccount {
	return {
		agent: "claude",
		selection: "/profiles/work",
		credentialKind: "subscription",
		identity: createHash("sha256").update("work").digest("hex"),
		email: "work@example.invalid",
		...patch,
	};
}
test("the same directory can have distinct provider identities", () => {
	const f = fixture();
	f.registry.remember(account());
	f.registry.remember(
		account({ agent: "codex", email: "codex@example.invalid" }),
	);
	expect(
		new ForkAccountRegistry(f.root)
			.list()
			.map((row) => row.agent)
			.sort(),
	).toEqual(["claude", "codex"]);
	f.registry.forget("claude", "/profiles/work");
	expect(f.registry.list()).toMatchObject([{ agent: "codex" }]);
	f.registry.forget("claude", "/profiles/work");
	expect(f.registry.list()).toHaveLength(1);
});
test("a second registration cannot overwrite the captured login", () => {
	const f = fixture(),
		original = account();
	f.registry.remember(original);
	expect(
		f.registry.remember(
			account({
				identity: createHash("sha256").update("changed").digest("hex"),
				email: "changed@example.invalid",
			}),
		),
	).toEqual(original);
	expect(f.registry.list()).toEqual([original]);
});
test("registry files contain identity metadata and are private to the user", () => {
	const f = fixture(),
		original = account();
	f.registry.remember(original);
	const path = join(f.root, recordName(f.root));
	expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(original);
	expect(statSync(path).mode & 0o777).toBe(0o600);
	expect(readdirSync(f.root).filter((name) => name.endsWith(".tmp"))).toEqual(
		[],
	);
});
test.each([
	"json",
	"provider",
	"directory",
	"fingerprint",
	"email",
])("invalid persisted %s fails closed", (kind) => {
	const f = fixture();
	f.registry.remember(account());
	const path = join(f.root, recordName(f.root));
	const invalid =
		kind === "provider"
			? { agent: "unknown" }
			: kind === "directory"
				? { selection: "relative" }
				: kind === "fingerprint"
					? { identity: "not-a-fingerprint" }
					: { email: "x".repeat(321) };
	writeFileSync(
		path,
		kind === "json" ? "not json" : JSON.stringify({ ...account(), ...invalid }),
	);
	expect(() => f.registry.list()).toThrow();
});
test("a renamed record cannot claim another profile, and oversized records are rejected", () => {
	const f = fixture();
	f.registry.remember(account());
	const path = join(f.root, recordName(f.root));
	const other = join(f.root, `${"0".repeat(64)}.json`);
	renameSync(path, other);
	expect(() => f.registry.list()).toThrow("account_registry_invalid");
	renameSync(other, path);
	writeFileSync(path, " ".repeat(8193));
	expect(() => f.registry.list()).toThrow("account_registry_invalid");
});
test("bounded retention rejects a 129th profile and permits replacement only after explicit removal", () => {
	const f = fixture();
	for (let index = 0; index < 128; index++)
		f.registry.remember(account({ selection: `/profiles/${index}` }));
	expect(() =>
		f.registry.remember(account({ selection: "/profiles/extra" })),
	).toThrow("account_registry_limit");
	f.registry.forget("claude", "/profiles/0");
	f.registry.remember(account({ selection: "/profiles/extra" }));
	expect(f.registry.list()).toHaveLength(128);
});
