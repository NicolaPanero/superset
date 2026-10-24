import { afterEach, expect, spyOn, test } from "bun:test";

const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { ForkDownloadMessage } = await import("./ForkDownloadMessage");
afterEach(cleanup);

test("downloads the full received Markdown locally without generating another response", async () => {
	const text = "# Risposta\n\nà🚀\n".repeat(4000);
	const create = spyOn(URL, "createObjectURL").mockReturnValue(
		"blob:test-response",
	);
	let href = "",
		filename = "";
	const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
		function (this: HTMLAnchorElement) {
			href = this.href;
			filename = this.download;
		},
	);
	try {
		const view = render(<ForkDownloadMessage text={text} />);
		await act(async () =>
			fireEvent.click(view.getByRole("button", { name: "Download Markdown" })),
		);
		const blob = create.mock.calls[0]?.[0] as Blob;
		expect(await blob.text()).toBe(text);
		expect(blob.type).toBe("text/markdown;charset=utf-8");
		expect(href).toBe("blob:test-response");
		expect(filename).toBe("response.md");
		expect(document.querySelector('a[download="response.md"]')).toBeNull();
	} finally {
		create.mockRestore();
		click.mockRestore();
	}
});
