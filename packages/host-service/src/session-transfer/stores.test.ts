import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultNativeStore, peerSessionReference } from "./stores";

describe("native session stores", () => {
	it("keeps selected Claude and Codex stores while refusing unverified peer profiles", () => {
		expect(
			defaultNativeStore("claude", { CLAUDE_CONFIG_DIR: "/profiles/work" }),
		).toBe("/profiles/work/projects");
		expect(defaultNativeStore("codex", { CODEX_HOME: "/profiles/work" })).toBe(
			"/profiles/work/sessions",
		);
		expect(defaultNativeStore("grok", { HOME: homedir() })).toBe(
			join(homedir(), ".grok", "sessions"),
		);
		for (const key of ["GROK_HOME", "XDG_DATA_HOME", "OPENCODE_DB", "HOME"]) {
			expect(() => defaultNativeStore("opencode", { [key]: "/other" })).toThrow(
				"native_profile_unverified",
			);
		}
	});
	it("locates only the bound session in its native cwd and rejects path traversal", () => {
		const cwd = "/repo/Italiano ! (test)";
		expect(peerSessionReference("cursor-agent", "/chats", "session", cwd)).toBe(
			join(
				"/chats",
				createHash("md5").update(cwd).digest("hex"),
				"session",
				"store.db",
			),
		);
		expect(peerSessionReference("grok", "/sessions", "session", cwd)).toBe(
			"/sessions/%2Frepo%2FItaliano%20%21%20%28test%29/session",
		);
		expect(
			peerSessionReference(
				"opencode",
				"/data/opencode.db",
				"ses_example12345",
				cwd,
			),
		).toBe("/data/opencode.db");
		for (const agent of ["grok", "cursor-agent", "opencode"] as const) {
			expect(() =>
				peerSessionReference(agent, "/store", "../../foreign", cwd),
			).toThrow();
		}
	});
});
