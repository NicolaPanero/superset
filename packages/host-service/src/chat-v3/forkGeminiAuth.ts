/**
 * Google ended the Gemini CLI sign-in for personal accounts, so a key or a
 * Vertex setup in the launch environment decides the method. The environment
 * includes the login shell, so a key exported in `~/.zshrc` counts too.
 */
export function forkGeminiAuthMethod(
	env: Record<string, string | undefined>,
	fallback: string | undefined,
): string | undefined {
	if (env.GEMINI_API_KEY) return "gemini-api-key";
	if (/^(1|true)$/i.test(env.GOOGLE_GENAI_USE_VERTEXAI ?? ""))
		return "vertex-ai";
	return fallback;
}
