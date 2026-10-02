import { describe, expect, test } from "bun:test";
import { buildStartHookEnv } from "./buildStartHookEnv";

const hostEnv = {
	HOME: "/home/ubuntu",
	PATH: "/usr/bin",
	NODE_EXTRA_CA_CERTS: "/etc/ssl/firewall.pem",
	PORT: "4879",
	NODE_ENV: "production",
	AUTH_TOKEN: "secret",
	HOST_SERVICE_SECRET: "secret",
	HOST_DB_PATH: "/var/lib/superset/host.db",
	ORGANIZATION_ID: "org-1",
	SUPERSET_API_URL: "https://api.example.com",
	SUPERSET_RUN_DIR: "/run/superset",
	SUPERSET_HOST_RUN_MODE: "sandbox",
	SUPERSET_SANDBOX_AGENT_PROMPT: "fix the avatar",
	SUPERSET_SANDBOX_WORKSPACE_ID: "ws-1",
};

describe("buildStartHookEnv", () => {
	test("drops host-service runtime keys", () => {
		const env = buildStartHookEnv(hostEnv, {});
		for (const key of [
			"PORT",
			"NODE_ENV",
			"AUTH_TOKEN",
			"HOST_SERVICE_SECRET",
			"HOST_DB_PATH",
			"ORGANIZATION_ID",
			"SUPERSET_API_URL",
			"SUPERSET_RUN_DIR",
			"SUPERSET_HOST_RUN_MODE",
			"SUPERSET_SANDBOX_AGENT_PROMPT",
		]) {
			expect(env[key]).toBeUndefined();
		}
	});

	test("keeps the shell env, the workspace id and the firewall CA", () => {
		const env = buildStartHookEnv(hostEnv, {});
		expect(env.HOME).toBe("/home/ubuntu");
		expect(env.PATH).toBe("/usr/bin");
		expect(env.NODE_EXTRA_CA_CERTS).toBe("/etc/ssl/firewall.pem");
		expect(env.SUPERSET_SANDBOX_WORKSPACE_ID).toBe("ws-1");
		expect(env.IS_SANDBOX).toBe("1");
	});

	test("adds the managed env on top", () => {
		const env = buildStartHookEnv(hostEnv, { NEON_PROJECT_ID: "neon-1" });
		expect(env.NEON_PROJECT_ID).toBe("neon-1");
	});
});
