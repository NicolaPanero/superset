/**
 * Fork Settings keep one MCP server list. The host writes it as launch files
 * under `$SUPERSET_HOME_DIR/state`; the wrappers hand them to every launch so
 * no account profile needs its own copy.
 */

const CLAUDE_SUBCOMMANDS = [
	"mcp",
	"config",
	"doctor",
	"update",
	"upgrade",
	"install",
	"setup-token",
	"plugin",
	"plugins",
	"migrate-installer",
	"auth",
	"agents",
	"--version",
	"-v",
	"--help",
	"-h",
];

/**
 * `--mcp-config` takes several files, so it goes last where it cannot swallow
 * a prompt. Subcommands reject it, and after `--` it would become prompt text.
 */
export const FORK_CLAUDE_MCP_EXEC = `_superset_fork_mcp="\${SUPERSET_HOME_DIR:+$SUPERSET_HOME_DIR/state/fork-mcp-claude.json}"
if [ -n "$_superset_fork_mcp" ] && [ -s "$_superset_fork_mcp" ]; then
  case "\${1:-}" in
    ${CLAUDE_SUBCOMMANDS.join("|")}) ;;
    *)
      _superset_fork_mcp_tail="1"
      for _superset_arg in "$@"; do
        [ "$_superset_arg" = "--" ] && _superset_fork_mcp_tail="0" && break
      done
      [ "$_superset_fork_mcp_tail" = "1" ] && exec "$REAL_BIN" "$@" --mcp-config "$_superset_fork_mcp"
      ;;
  esac
fi
exec "$REAL_BIN" "$@"`;

const CODEX_ARGS_READY = "_superset_configure_project_trust\n";

const FORK_CODEX_MCP_ARGS = `_superset_fork_mcp_args="\${SUPERSET_HOME_DIR:+$SUPERSET_HOME_DIR/state/fork-mcp-codex.args}"
if [ -n "$_superset_fork_mcp_args" ] && [ -s "$_superset_fork_mcp_args" ]; then
  _superset_fork_mcp_env="$SUPERSET_HOME_DIR/state/fork-mcp-codex.env"
  [ -s "$_superset_fork_mcp_env" ] && . "$_superset_fork_mcp_env"
  while IFS= read -r _superset_line || [ -n "$_superset_line" ]; do
    [ -n "$_superset_line" ] && _superset_codex_args+=("-c" "$_superset_line")
  done < "$_superset_fork_mcp_args"
fi
`;

/** Adds one `-c` override per line of the host's Codex launch file, and its secret values as environment. */
export function withForkCodexMcpArgs(execBlock: string): string {
	if (!execBlock.includes(CODEX_ARGS_READY))
		throw new Error(
			"codex wrapper template no longer builds _superset_codex_args",
		);
	return execBlock.replace(
		CODEX_ARGS_READY,
		`${CODEX_ARGS_READY}${FORK_CODEX_MCP_ARGS}`,
	);
}
