import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { useEffect } from "react";
import { BRAND_RENAME_NOTICE_ID } from "renderer/hooks/useDesktopNotices/utils/brandRenameNotice";

export function isForkReplacedBrandNotice(
	notice: DesktopNotice | null,
): boolean {
	return (
		notice?.id === BRAND_RENAME_NOTICE_ID &&
		notice.severity === "info" &&
		notice.dismissible
	);
}

export function useForkDesktopNotices<
	T extends {
		current: DesktopNotice | null;
		dismiss: (id: string) => void;
	},
>(notices: T): T {
	const { current, dismiss } = notices;
	const replacedId = isForkReplacedBrandNotice(current)
		? current?.id
		: undefined;
	useEffect(() => {
		if (replacedId) dismiss(replacedId);
	}, [replacedId, dismiss]);
	return replacedId ? { ...notices, current: null } : notices;
}
