/**
 * Agents often hand back a fenced block. This is already a monospace box, so
 * the fence would just render as literal backticks around the output.
 */
function stripCodeFence(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith("```")) return text;
	const firstBreak = trimmed.indexOf("\n");
	if (firstBreak === -1) return text;
	const body = trimmed.slice(firstBreak + 1);
	return body.endsWith("```") ? body.slice(0, -3).trimEnd() : body;
}

export function TextContent({ text }: { text: string }) {
	return (
		<pre className="overflow-x-auto whitespace-pre-wrap font-mono text-muted-foreground text-xs">
			{stripCodeFence(text)}
		</pre>
	);
}
