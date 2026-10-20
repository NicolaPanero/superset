import type { HarnessFactory } from "@superset/chat-runtime";
import type { HostDb } from "../db";
import { listWorkspaceFolders } from "../project-folders";

export function projectFolderPaths(db: HostDb, workspaceId: string): string[] {
	return listWorkspaceFolders(db, workspaceId)
		.filter((folder) => folder.exists)
		.map((folder) => folder.path);
}

/**
 * Starts every session of the workspace with the project's extra folders as
 * additional directories. A proxy keeps the adapter's optional methods as they
 * are, so steering and forking stay available only where the harness has them.
 */
export function withProjectFolders(
	db: HostDb,
	factory: HarnessFactory,
): HarnessFactory {
	return (options) => {
		const adapter = factory(options);
		return new Proxy(adapter, {
			get(target, property) {
				if (property === "start") {
					return (startOptions: Parameters<typeof target.start>[0]) => {
						const additionalDirectories = projectFolderPaths(
							db,
							options.scopeId,
						);
						return target.start(
							additionalDirectories.length > 0
								? { ...startOptions, additionalDirectories }
								: startOptions,
						);
					};
				}
				const value = Reflect.get(target, property, target);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	};
}
