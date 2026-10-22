import type { LocatedPath } from "../../../../../ChatPane/hooks/useOpenChatLink/utils/locatePath";
import { parseFileHref } from "../../../../../ChatPane/hooks/useOpenChatLink/utils/parseFileHref";

export async function forkRevealChatLink(
	href: string,
	deps: {
		locate: (path: string) => Promise<LocatedPath | null>;
		reveal: (path: string, options: { isDirectory: boolean }) => void;
		notFound: (path: string) => void;
		failed: () => void;
	},
): Promise<void> {
	const file = parseFileHref(href);
	if (!file) return;
	let located: LocatedPath | null;
	try {
		located = await deps.locate(file.path);
	} catch {
		deps.failed();
		return;
	}
	if (!located) {
		deps.notFound(file.path);
		return;
	}
	deps.reveal(located.resolvedPath, { isDirectory: located.isDirectory });
}
