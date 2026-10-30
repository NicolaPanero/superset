export async function forkReadValidationErrors(response: Response) {
	if (![400, 422].includes(response.status) || !response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			size += next.value.length;
			if (size > 65_536) {
				await reader.cancel();
				return null;
			}
			chunks.push(next.value);
		}
		const bytes = new Uint8Array(size);
		let at = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, at);
			at += chunk.length;
		}
		const data = JSON.parse(new TextDecoder().decode(bytes));
		const errors: Record<string, string> = {};
		if (
			data.errors &&
			typeof data.errors === "object" &&
			!Array.isArray(data.errors)
		)
			for (const [key, value] of Object.entries(data.errors).slice(0, 20))
				if (typeof value === "string" && value.trim())
					errors[key.slice(0, 100)] = value.slice(0, 500);
		const general = Array.isArray(data.errorMessages)
			? data.errorMessages
					.filter((v: unknown): v is string => typeof v === "string")
					.slice(0, 10)
					.map((v: string) => v.slice(0, 500))
			: [];
		const message = [
			...general,
			...Object.entries(errors).map(([field, value]) => `${field}: ${value}`),
		].join("\n");
		return message ? { message, errors } : null;
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}
