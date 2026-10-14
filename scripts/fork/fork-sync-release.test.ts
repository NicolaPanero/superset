import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.skipIf(process.platform === "win32")(
	"automatic sync selects only published stable desktop releases, even when newer tags and drafts exist",
	() => {
		const directory = mkdtempSync(join(tmpdir(), "fork-sync-release-"));
		const selected = join(directory, "selected");
		const releases = join(directory, "releases.json");
		writeFileSync(
			releases,
			JSON.stringify([
				{ tag_name: "desktop-v1.40.0", draft: true, prerelease: false },
				{ tag_name: "desktop-v1.39.0", draft: false, prerelease: true },
				{ tag_name: "cli-v1.99.0", draft: false, prerelease: false },
				{ tag_name: "desktop-v1.38.0", draft: false, prerelease: false },
				{ tag_name: "desktop-v1.9.0", draft: false, prerelease: false },
			]),
		);
		writeFileSync(
			join(directory, "gh"),
			`#!/bin/bash
exec jq -r "\${!#}" "$TEST_RELEASES"
`,
			{ mode: 0o700 },
		);
		writeFileSync(
			join(directory, "git"),
			`#!/bin/bash
case "$*" in
 'rev-parse --show-toplevel') pwd ;;
 'symbolic-ref --short HEAD') echo fork/main ;;
 'status --porcelain --untracked-files=no'|'remote get-url upstream'|'fetch '*) exit 0 ;;
 'ls-remote '*) echo 'hash refs/tags/desktop-v1.41.0' ;;
 'merge-base --is-ancestor '*) printf '%s' "$3" > "$TEST_SELECTED" ;;
 *) echo "Unexpected Git mutation: $*" >&2; exit 99 ;;
esac
`,
			{ mode: 0o700 },
		);
		try {
			const result = Bun.spawnSync(
				["bash", resolve(import.meta.dir, "sync-upstream.sh")],
				{
					cwd: directory,
					env: {
						...process.env,
						PATH: `${directory}:${process.env.PATH}`,
						TEST_RELEASES: releases,
						TEST_SELECTED: selected,
					},
				},
			);
			expect(result.exitCode).toBe(0);
			expect(readFileSync(selected, "utf8")).toBe("desktop-v1.38.0");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	},
);
