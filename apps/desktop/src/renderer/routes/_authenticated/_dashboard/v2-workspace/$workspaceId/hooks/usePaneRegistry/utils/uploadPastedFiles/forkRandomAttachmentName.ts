export function forkRandomAttachmentName(base: string): string {
	const suffix = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return `${base}-${suffix}`;
	return `${base.slice(0, dot)}-${suffix}${base.slice(dot)}`;
}
