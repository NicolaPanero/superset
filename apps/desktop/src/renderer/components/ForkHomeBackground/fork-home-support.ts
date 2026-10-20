let supported: boolean | undefined;

export function supportsForkHomeScene() {
	if (supported === undefined) {
		const gl = document.createElement("canvas").getContext("webgl2");
		supported = !!gl;
		gl?.getExtension("WEBGL_lose_context")?.loseContext();
	}
	return supported;
}
