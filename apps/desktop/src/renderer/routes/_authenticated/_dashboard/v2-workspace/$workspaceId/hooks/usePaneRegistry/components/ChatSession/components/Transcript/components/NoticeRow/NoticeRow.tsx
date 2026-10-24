import type { Notice } from "@superset/chat/protocol";
import { cn } from "@superset/ui/utils";
import { ForkProviderFailure } from "../ForkProviderFailure";

export function NoticeRow({ item }: { item: Notice }) {
	return (
		<div
			className={cn(
				"text-xs",
				item.noticeKind === "error"
					? "text-destructive"
					: "text-muted-foreground",
			)}
		>
			{item.text ?? item.noticeKind}
			{item.noticeKind === "error" && <ForkProviderFailure text={item.text} />}
		</div>
	);
}
