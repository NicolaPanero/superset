import { EventEmitter } from "node:events";
import type { ForkUpdateNotice } from "shared/fork-updates";

export function createForkUpdateNotices() {
	const emitter = new EventEmitter();
	let current: ForkUpdateNotice | null = null;
	return {
		get: () => current,
		publish(notice: ForkUpdateNotice) {
			current = notice;
			emitter.emit("notice", current);
		},
		dismiss(tag: string) {
			if (current?.tag !== tag) return;
			current = null;
			emitter.emit("notice", current);
		},
		subscribe(listener: (notice: ForkUpdateNotice | null) => void) {
			emitter.on("notice", listener);
			listener(current);
			return () => {
				emitter.off("notice", listener);
			};
		},
	};
}
export const forkUpdateNotices = createForkUpdateNotices();
