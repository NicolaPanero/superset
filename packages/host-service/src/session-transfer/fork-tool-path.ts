import { homedir } from "node:os";
import { posix, win32 } from "node:path";
export function forkToolPath(
	tool: "txcript-transfer" | "txcript-cli",
	execPath: string,
	exists: (path: string) => boolean,
	platform: NodeJS.Platform = process.platform,
) {
	const path = platform === "win32" ? win32 : posix;
	const name = `${tool}${platform === "win32" ? ".exe" : ""}`;
	const bundled =
		platform === "darwin"
			? path.join(
					path.dirname(execPath),
					"..",
					"Resources",
					"resources",
					"bin",
					name,
				)
			: path.join(
					path.dirname(execPath),
					"resources",
					"resources",
					"bin",
					name,
				);
	if (exists(bundled)) return bundled;
	return path.join(
		process.env.SUPERSET_HOME_DIR || path.join(homedir(), ".superset"),
		"bin",
		name,
	);
}
