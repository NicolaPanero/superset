const ID_FONT_SIZE_REM = 0.75;
const PADDING_PX = 8;

let measuringContext: CanvasRenderingContext2D | null | undefined;

export function getSlugColumnWidth(slugs: string[]): string {
	if (slugs.length === 0) return "5rem";

	measuringContext ??= document.createElement("canvas").getContext("2d");
	if (!measuringContext) return "6rem";

	const rootFontSize = Number.parseFloat(
		getComputedStyle(document.documentElement).fontSize,
	);
	measuringContext.font = `${ID_FONT_SIZE_REM * rootFontSize}px ${getComputedStyle(document.body).fontFamily}`;

	const widest = slugs.reduce(
		(max, slug) =>
			Math.max(max, measuringContext?.measureText(slug).width ?? 0),
		0,
	);
	return `${Math.ceil(widest + PADDING_PX)}px`;
}
