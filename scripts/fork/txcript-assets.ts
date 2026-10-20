export function txcriptAssets(platform: string, arch: string) {
	if (platform === "darwin" && arch === "arm64")
		return {
			target: "aarch64-apple-darwin",
			extension: "tar.gz",
			executable: "",
		};
	if (platform === "win32" && arch === "x64")
		return {
			target: "x86_64-pc-windows-msvc",
			extension: "zip",
			executable: ".exe",
		};
	throw new Error(`Unsupported transfer helper platform: ${platform}/${arch}`);
}
