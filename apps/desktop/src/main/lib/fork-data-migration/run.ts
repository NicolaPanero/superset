import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { SUPERSET_DIR_NAME } from "shared/constants";
import { copyForkDataOnFirstLaunch } from "./fork-data-migration";

const storageName =
	SUPERSET_DIR_NAME === ".superset-fork" ? "Superset Fork" : app.getName();

copyForkDataOnFirstLaunch(
	SUPERSET_DIR_NAME,
	app.getPath("appData"),
	storageName,
);

if (
	SUPERSET_DIR_NAME === ".superset-fork" &&
	process.env.NODE_ENV !== "development"
) {
	const profile = join(app.getPath("appData"), storageName);
	mkdirSync(profile, { recursive: true });
	app.setPath("userData", profile);
	app.setPath("sessionData", profile);
}
