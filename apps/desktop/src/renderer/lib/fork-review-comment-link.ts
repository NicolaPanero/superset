import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

export function forkReviewCommentUrl(prUrl: string, id: number) {
	return `${prUrl}#${prUrl.startsWith("https://bitbucket.org/") ? "comment-" : "discussion_r"}${id}`;
}

export function forkReviewLinkLabel(url?: string) {
	return url?.startsWith("https://bitbucket.org/")
		? i18n._(msg({ message: "View on Bitbucket" }))
		: i18n._(msg({ message: "Open on GitHub" }));
}
