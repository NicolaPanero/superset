import { expect, test } from "bun:test";
import {
	FORK_WHATS_NEW_ID,
	FORK_WHATS_NEW_STORAGE_KEY,
	hasSeenForkWhatsNew,
	markForkWhatsNewSeen,
} from "./ForkWhatsNewNotice";

function memoryStorage(initial?: string) {
	const values = new Map<string, string>();
	if (initial) values.set(FORK_WHATS_NEW_STORAGE_KEY, initial);
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	};
}

test("the current highlights show once and replace the previous release id", () => {
	const storage = memoryStorage("older-highlights");
	expect(hasSeenForkWhatsNew(storage)).toBe(false);
	markForkWhatsNewSeen(storage);
	expect(storage.getItem(FORK_WHATS_NEW_STORAGE_KEY)).toBe(FORK_WHATS_NEW_ID);
	expect(hasSeenForkWhatsNew(storage)).toBe(true);
});
