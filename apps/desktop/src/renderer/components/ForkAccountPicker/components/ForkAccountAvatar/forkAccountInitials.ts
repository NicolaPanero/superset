export function forkAccountInitials(label: string) {
	const name = label.split("@")[0] ?? label;
	const words = name.split(/[\s._-]+/).filter(Boolean);
	const initials =
		words.length > 1
			? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
			: name.slice(0, 2);
	return initials.toUpperCase();
}
