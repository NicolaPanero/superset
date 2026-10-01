export const RUNTIME_SCRIPT_PATH = "/_superset/runtime.js";

/**
 * Separate from the comments runtime, and injected into `<head>` rather than
 * before `</body>`, because it has to exist before the document's own scripts
 * run. A page that reads `window.superset.storage` while parsing — which is
 * the obvious way to write one — would otherwise find nothing there and
 * render its empty state forever. The comments runtime stays at the end of
 * the body, where it wants a parsed DOM.
 */
export const STORAGE_SCRIPT_PATH = "/_superset/storage.js";

/**
 * The origin's one edit to a published document: a same-origin script tag
 * before `</body>` (or appended when there is none), so the runtime can
 * change without republishing anything.
 */
export function injectScriptTag(html: string, src: string): string {
	const tag = `<script src="${src}"></script>`;
	const close = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
	if (close === -1) return html + tag;
	return html.slice(0, close) + tag + html.slice(close);
}

/**
 * A `<head>` written inside a comment, a raw-text element, or a quoted
 * attribute value is text, not a tag. Walk the document skipping those spans
 * — including any whole tag that is not itself the `<head>` — and take the
 * first real one.
 */
const HEAD_OR_SKIP =
	/<!--|<(script|style|textarea|title)(?=[\s/>])|<head(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*>|<[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>/gi;

const IS_HEAD = /^<head[\s>]/i;

const RAW_TEXT_CLOSE: Record<string, RegExp> = {
	script: /<\/script\s*>/gi,
	style: /<\/style\s*>/gi,
	textarea: /<\/textarea\s*>/gi,
	title: /<\/title\s*>/gi,
};

function findHeadTag(html: string): { index: number; length: number } | null {
	HEAD_OR_SKIP.lastIndex = 0;
	let match = HEAD_OR_SKIP.exec(html);
	while (match) {
		if (match[0].startsWith("<!--")) {
			const end = html.indexOf("-->", match.index + 4);
			if (end === -1) return null;
			HEAD_OR_SKIP.lastIndex = end + 3;
		} else if (match[1]) {
			const close = RAW_TEXT_CLOSE[match[1].toLowerCase()];
			if (!close) return null;
			close.lastIndex = match.index;
			const end = close.exec(html);
			if (!end) return null;
			HEAD_OR_SKIP.lastIndex = end.index + end[0].length;
		} else if (IS_HEAD.test(match[0])) {
			return { index: match.index, length: match[0].length };
		}
		match = HEAD_OR_SKIP.exec(html);
	}
	return null;
}

/**
 * Inlined rather than linked: the CSS is a build-time constant that never
 * varies per page, so a `<link>` would cost a round trip before first paint on
 * a document that is already `no-store`.
 */
export function injectStyleTag(html: string, css: string): string {
	return injectIntoHead(html, `<style>${css}</style>`);
}

/**
 * A blocking script in `<head>`, so it has finished defining its API before
 * the parser reaches anything the author wrote. Deliberately not `defer` or
 * `async`: both would run after the document's own inline scripts, which is
 * the bug this exists to avoid.
 */
export function injectHeadScriptTag(html: string, src: string): string {
	return injectIntoHead(html, `<script src="${src}"></script>`);
}

function injectIntoHead(html: string, tag: string): string {
	const head = findHeadTag(html);
	if (head) {
		const at = head.index + head.length;
		return html.slice(0, at) + tag + html.slice(at);
	}
	const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
	if (doctype) {
		const at = doctype[0].length;
		return html.slice(0, at) + tag + html.slice(at);
	}
	return tag + html;
}
