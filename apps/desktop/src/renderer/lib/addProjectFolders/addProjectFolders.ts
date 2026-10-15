import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { getBaseName } from "renderer/lib/pathBasename/pathBasename";

/**
 * Adds the folders one by one: a folder that cannot be added is reported and
 * the rest still go in. Returns the ids of the folders that were added.
 */
export async function addProjectFolders(
	paths: string[],
	add: (path: string) => Promise<{ id: string }>,
): Promise<string[]> {
	const ids: string[] = [];
	for (const path of paths) {
		try {
			ids.push((await add(path)).id);
		} catch (error) {
			toast.error(`${getBaseName(path)}: ${errorMessage(error)}`);
		}
	}
	return ids;
}
