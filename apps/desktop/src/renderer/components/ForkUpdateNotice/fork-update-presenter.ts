import type { ForkUpdateNotice } from "shared/fork-updates";

interface NoticePresenter {
	focused: () => boolean;
	show: (notice: ForkUpdateNotice) => void;
	hide: () => void;
}
export function createForkUpdatePresenter(options: NoticePresenter) {
	let current: ForkUpdateNotice | null = null;
	let shown: string | undefined;
	const foreground = () => {
		if (!current || !options.focused() || shown === current.tag) return;
		shown = current.tag;
		options.show(current);
	};
	return {
		update(notice: ForkUpdateNotice | null) {
			if (notice?.tag !== current?.tag) options.hide();
			current = notice;
			foreground();
		},
		foreground,
		dispose: options.hide,
	};
}
