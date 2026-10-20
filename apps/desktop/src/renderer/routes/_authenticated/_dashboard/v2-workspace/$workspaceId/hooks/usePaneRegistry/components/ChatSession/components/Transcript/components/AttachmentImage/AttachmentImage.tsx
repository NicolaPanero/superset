import { Badge } from "@superset/ui/badge";
import { useCallback, useState } from "react";
import { ImagePreviewOverlay } from "renderer/routes/_authenticated/components/ImagePreviewOverlay";
import { useSaveImageToDownloads } from "renderer/routes/_authenticated/hooks/useSaveImageToDownloads";
import { useChatImageSource } from "../../hooks/useChatImageSource";
import { useChatImageGallery } from "../../providers/ChatImageGalleryProvider";
import { galleryImageId } from "../../utils/galleryImages";
import { LargeImageTile } from "./components/LargeImageTile";
import { PreviewableImage } from "./components/PreviewableImage";

export function AttachmentImage({
	alt,
	owner,
	path,
	type,
	src: inlineSrc,
}: {
	/** Transcript key of the item showing the image; pairs with `path` in the gallery. */
	owner: string;
	path: string;
	type: string;
	alt?: string | undefined;
	/** Image bytes as a data URL, when no file in the worktree holds them. */
	src?: string | undefined;
}) {
	const { open, registerThumbnail } = useChatImageGallery();
	const id = galleryImageId(owner, path);
	const name = path.split("/").pop() ?? path;
	const source = useChatImageSource(
		inlineSrc ? null : { path, mimeType: type },
		{ full: false },
	);
	const saveImageToDownloads = useSaveImageToDownloads();
	const [inlinePreviewOpen, setInlinePreviewOpen] = useState(false);
	const [unrenderable, setUnrenderable] = useState(false);
	const register = useCallback(
		(element: HTMLElement | null) => {
			registerThumbnail(id, element);
			return () => registerThumbnail(id, null);
		},
		[id, registerThumbnail],
	);
	const openPreview = () => open(id);

	if (inlineSrc && !unrenderable)
		return (
			<>
				<PreviewableImage
					alt={alt}
					filename={name}
					onClick={() => setInlinePreviewOpen(true)}
					onError={() => setUnrenderable(true)}
					src={inlineSrc}
				/>
				<ImagePreviewOverlay
					filename={name}
					onClose={() => setInlinePreviewOpen(false)}
					onDownload={() => saveImageToDownloads(inlineSrc, name)}
					open={inlinePreviewOpen}
					src={inlineSrc}
				/>
			</>
		);
	if (source.status === "error" || unrenderable)
		return <Badge variant="secondary">{name}</Badge>;
	if (source.status === "loading")
		return (
			<div className="size-40 animate-pulse rounded-2xl bg-foreground/10" />
		);
	if (source.status === "too-large")
		return (
			<LargeImageTile filename={name} onClick={openPreview} ref={register} />
		);
	return (
		<PreviewableImage
			alt={alt}
			filename={name}
			onClick={openPreview}
			onError={() => setUnrenderable(true)}
			ref={register}
			src={source.src}
		/>
	);
}
