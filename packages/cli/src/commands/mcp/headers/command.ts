import { command } from "../../../lib/command";

export default command({
	description:
		"Print the auth headers for Superset's plugin MCP endpoints (for an agent's headers helper)",
	args: [],
	options: {},
	/**
	 * Claude reads this as `headersHelper` and Codex as `http_headers_helper`:
	 * a command whose stdout is a JSON object of headers, re-run per connection
	 * and again when the server rejects. Printing the credential here instead of
	 * writing it into the agent's config is the whole point — nothing
	 * long-lived lands in ~/.claude.json or ~/.codex/config.toml, and rotation
	 * happens wherever the CLI's own auth does.
	 */
	run: async ({ ctx }) => {
		const headers = { Authorization: `Bearer ${ctx.bearer}` };
		return {
			data: headers,
			// stdout must be the JSON object and nothing else: the agent parses
			// the whole of it.
			message: JSON.stringify(headers),
		};
	},
});
