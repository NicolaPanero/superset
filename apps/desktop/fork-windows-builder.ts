import type { Configuration } from "electron-builder";
import base from "./electron-builder";

const config: Configuration = {
	...base,
	publish: { provider: "github", owner: "NicolaPanero", repo: "superset" },
	nsis: {
		...base.nsis,
		oneClick: true,
		perMachine: false,
		allowElevation: false,
		allowToChangeInstallationDirectory: false,
		runAfterFinish: true,
	},
	win: { ...base.win, artifactName: "Superset-fork-x64.exe" },
};
export default config;
