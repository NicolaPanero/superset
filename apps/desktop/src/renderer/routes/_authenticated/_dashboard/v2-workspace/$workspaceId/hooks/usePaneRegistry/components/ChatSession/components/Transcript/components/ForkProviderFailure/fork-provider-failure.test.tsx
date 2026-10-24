import { afterEach, expect, test } from "bun:test";

const { cleanup, render } = await import("@testing-library/react");
const { NoticeRow } = await import("../NoticeRow");
afterEach(cleanup);

test("provider errors retain their original details and explain the recovery options", () => {
	const ping = "Error: RetriableError: [unavailable] PING timed out";
	const item = {
		id: "notice",
		kind: "notice" as const,
		noticeKind: "error" as const,
		startedAtMs: 1,
		text: ping,
	};
	const view = render(<NoticeRow item={item} />);
	expect(view.container.textContent).toContain(ping);
	expect(view.container.textContent).toContain(
		"Continue from the last saved part.",
	);
	view.rerender(
		<NoticeRow
			item={{
				...item,
				text: "Error: RetriableError: [resource_exhausted] Error",
			}}
		/>,
	);
	expect(view.container.textContent).toContain(
		"Wait and retry, or switch models.",
	);
	view.rerender(<NoticeRow item={{ ...item, noticeKind: "info" }} />);
	expect(view.container.textContent).not.toContain(
		"Continue from the last saved part.",
	);
});
