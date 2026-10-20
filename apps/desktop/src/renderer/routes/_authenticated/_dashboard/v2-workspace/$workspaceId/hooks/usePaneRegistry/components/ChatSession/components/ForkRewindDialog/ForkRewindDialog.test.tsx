import { afterEach, expect, test } from "bun:test";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { ForkRewindDialog } = await import("./ForkRewindDialog");
afterEach(cleanup);

test("rewind needs an explicit confirmation that files stay unchanged", () => {
	let confirmed = 0;
	const view = render(
		<ForkRewindDialog
			open
			onOpenChange={() => undefined}
			onConfirm={() => confirmed++}
		/>,
	);
	expect(view.getByRole("alertdialog").textContent).toContain(
		"Files stay unchanged",
	);
	expect(confirmed).toBe(0);
	fireEvent.click(view.getByRole("button", { name: "Rewind chat only" }));
	expect(confirmed).toBe(1);
});

test("cancel leaves the conversation alone", () => {
	let confirmed = 0;
	const view = render(
		<ForkRewindDialog
			open
			onOpenChange={() => undefined}
			onConfirm={() => confirmed++}
		/>,
	);
	fireEvent.click(view.getByRole("button", { name: "Cancel" }));
	expect(confirmed).toBe(0);
});
