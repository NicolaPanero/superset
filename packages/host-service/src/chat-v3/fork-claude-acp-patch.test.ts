import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// patches/README.md: a version bump drops the patch without failing the build.
test("the Claude ACP adapter keeps the context usage request", () => {
	const require = createRequire(import.meta.url);
	const pkg = require.resolve(
		"@agentclientprotocol/claude-agent-acp/package.json",
	);
	const source = readFileSync(join(dirname(pkg), "dist/acp-agent.js"), "utf8");
	expect(source).toContain('"_superset/context_usage"');
	expect(source).toContain("async supersetContextUsage(params)");
});
