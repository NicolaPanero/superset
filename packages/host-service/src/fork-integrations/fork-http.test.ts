import { expect, test } from "bun:test";
import { forkFetch, forkText } from "./fork-http";

test("a connection lost while reading JSON or a diff remains a recoverable service outage", async () => {
	const interrupted = (async () =>
		new Response(
			new ReadableStream({
				start(controller) {
					controller.error(new TypeError("Socket closed"));
				},
			}),
		)) as unknown as typeof fetch;
	for (const request of [
		() => forkFetch("https://api.bitbucket.org/test", {}, interrupted),
		() => forkText("https://api.bitbucket.org/test", {}, interrupted),
	]) {
		await expect(request()).rejects.toMatchObject({
			code: "BAD_GATEWAY",
			message: "The service could not be reached",
		});
	}
});
