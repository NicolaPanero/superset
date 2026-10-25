import { Trans } from "@lingui/react/macro";
import { transcriptItemKey } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { Badge } from "@superset/ui/badge";
import type { EarlierUserMessage } from "../../../../../../utils/earlierHistory";
import { AttachmentImage } from "../../../AttachmentImage";

export function forkEarlierImages(item: UserMessage) {
	return (item as EarlierUserMessage).earlierImages ?? [];
}

/** Images of a message read from the chat a converted one came from. */
export function ForkEarlierImages({ item }: { item: UserMessage }) {
	return forkEarlierImages(item).map((image, index) =>
		image.data ? (
			<AttachmentImage
				// biome-ignore lint/suspicious/noArrayIndexKey: an earlier turn's images never reorder
				key={index}
				owner={transcriptItemKey(item)}
				path={`image-${index + 1}.${image.mediaType.split("/")[1] ?? "png"}`}
				src={`data:${image.mediaType};base64,${image.data}`}
				type={image.mediaType}
			/>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: an earlier turn's images never reorder
			<Badge key={index} variant="secondary">
				<Trans>Image too large to show</Trans>
			</Badge>
		),
	);
}
