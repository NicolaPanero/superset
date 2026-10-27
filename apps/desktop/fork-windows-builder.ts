import type { Configuration } from "electron-builder";
import base from "./electron-builder";
import { FORK_PRODUCT_NAME } from "./fork-display-name";

const config: Configuration = {
	...base,
	// The Windows installer of every released build accepts only Superset++.exe.
	productName: FORK_PRODUCT_NAME,
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
