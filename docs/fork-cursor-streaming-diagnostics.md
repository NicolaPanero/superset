# Cursor streaming failures

Investigation on 2026-10-23 with Cursor CLI `2026.10.01-e373342` and Gemini 4
Argon. Evidence comes from the Superset journal, the matching native Cursor
debug log, and the installed CLI source. No generation request was sent during
the investigation.

## PING timeout

The failed turn ran for 15 minutes 54 seconds. Its final response streamed for
about 3 minutes 20 seconds and reached 40,256 UTF-8 bytes, including the error.
Cursor logged `ConnectError: [unavailable] PING timed out` and no caller abort.
The native log confirms HTTP/2 agent transport.

This error comes from Cursor's HTTP/2 session manager. Its direct agent
connection uses a 10-second PING interval and a 20-second acknowledgement
timeout. This is a connection watchdog. It does not measure how long the model
has been thinking or how long the answer is. A long request exposes the
connection to disruption for longer, but elapsed generation time alone does
not cause this error. The log does not identify whether the lost acknowledgement
was caused by the network route, the remote endpoint, or a local process stall.

Superset's ACP `session/prompt` request has no overall response timeout. The
stdio reader accepts newline-delimited JSON and has no fixed text-size cap.
Cursor's bundled Connect client uses the default per-message read and write
limit of 4,294,967,295 bytes. The observed response is far below that client
limit; this does not establish the remote service's limits.

## ResourceExhausted

The Markdown request failed after 3 minutes 45 seconds, during reasoning.
No file-writing tool call had reached Superset. The full native error contains:

- Connect code: `ResourceExhausted` (8).
- Cursor error: `ERROR_NETWORK_ERROR` (56).
- Inference error type: `NETWORK_ERROR`.
- Display title: `Network Error`.
- Display detail: a temporary failure connecting to the model provider.
- `isRetryable: true`, but `enableAgentRetries: false` and `willRetry: false`.
- A server heartbeat was received about 4.6 seconds before the failure.

This occurrence has evidence of a provider connection failure. It has no
evidence of local memory exhaustion, a Markdown transfer limit, or an account
quota failure. The generic gRPC code alone cannot classify future occurrences.

## Recovery and further diagnosis

Cursor's ACP implementation catches the structured error, sends only
`Error: ${String(error)}` as assistant text, then returns a successful prompt
result. The fork recognizes the exact final Cursor error chunk and marks the
turn as failed. Periodic text checkpoints preserve partial output, queued work
pauses, and the existing message can be downloaded as Markdown without another
model request. The UI uses neutral provider-error guidance for the generic code.

For a recurrence, correlate the journal timestamp with Cursor's native logs in
the operating system's temporary directory, under `cursor-agent-logs-<uid>`.
Record the request ID, structured error details, abort origin, retry decision,
and heartbeat timing. Do not infer a quota or payload limit from code 8 alone.

Cursor supports `network.useHttp1ForAgent` in `~/.cursor/cli-config.json` as a
network compatibility option. It can be tested for recurring HTTP/2 connection
failures; it does not resolve a failure between Cursor and the model provider.
It was not changed during this investigation.

References:

- [gRPC keepalive](https://grpc.io/docs/guides/keepalive/)
- [gRPC status codes](https://grpc.io/docs/guides/status-codes/)
- [Connect 1.6.1 message limits](https://github.com/connectrpc/connect-es/blob/v1.6.1/packages/connect/src/protocol/limit-io.ts)
- [Cursor CLI configuration](https://cursor.com/docs/cli/reference/configuration)
