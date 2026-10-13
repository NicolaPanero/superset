import type { AccountCredentialKind } from "../apiBilling";
import type { ManagedAgent } from "../visibleQuotaAgents";

function literal(value: string) {
	return `'${value.replaceAll("'", "''")}'`;
}
export function windowsLoginScript(input: {
	agent: ManagedAgent;
	credentialKind: AccountCredentialKind;
	selection?: string | null;
	slug?: string;
	markCompleted?: boolean;
	keyPrompt?: string;
}) {
	const { agent, credentialKind, selection, slug, markCompleted } = input;
	if (slug !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(slug))
		throw new Error("account_profile_name_invalid");
	const cli = agent === "claude" ? "claude" : "codex";
	const key = agent === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
	const home = `(Join-Path $env:USERPROFILE ${literal(`.${agent}${slug ? `-${slug}` : ""}`)})`;
	const profile = selection
		? literal(selection)
		: slug
			? home
			: `if ($env:${key}) { $env:${key} } else { ${home} }`;
	const run =
		agent === "claude"
			? `& claude auth login${credentialKind === "api_key" ? " --console" : ""}`
			: `& codex login -c 'cli_auth_credentials_store="file"'${credentialKind === "api_key" ? " --with-api-key" : ""}`;
	const login =
		credentialKind === "api_key" && agent === "codex"
			? `$secret = Read-Host ${literal(input.keyPrompt || "API key")} -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer); $apiKey | ${run}; $loginStatus = $LASTEXITCODE }
finally { $apiKey = $null; [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }`
			: `${run}
$loginStatus = $LASTEXITCODE`;
	const marks = [
		credentialKind === "api_key"
			? `Set-Content -LiteralPath (Join-Path $accountDirectory '.superset-api-billing') -Value ${literal(cli)} -Encoding ascii`
			: "",
		markCompleted && slug
			? `Set-Content -LiteralPath (Join-Path $accountDirectory '.superset-login-complete') -Value ${literal(`${agent}:${slug}`)} -Encoding ascii`
			: "",
	]
		.filter(Boolean)
		.join("\n");
	return `$ErrorActionPreference = 'Stop'
$accountDirectory = ${profile}
New-Item -ItemType Directory -Force -Path $accountDirectory | Out-Null
$previous = [Environment]::GetEnvironmentVariable(${literal(key)}, 'Process')
try {
 [Environment]::SetEnvironmentVariable(${literal(key)}, $accountDirectory, 'Process')
 ${login}
 if ($loginStatus -ne 0) { exit $loginStatus }
 ${marks}
} catch { Write-Error $_; exit 1 }
finally { [Environment]::SetEnvironmentVariable(${literal(key)}, $previous, 'Process') }
exit 0`;
}
export function encodeWindowsCommand(script: string) {
	const bytes = new Uint8Array(script.length * 2);
	for (let i = 0; i < script.length; i++) {
		const code = script.charCodeAt(i);
		bytes[i * 2] = code & 255;
		bytes[i * 2 + 1] = code >>> 8;
	}
	const encoded = btoa(
		Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
	);
	return `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

export function windowsLoginCommand(
	input: Parameters<typeof windowsLoginScript>[0],
) {
	return encodeWindowsCommand(windowsLoginScript(input));
}
