import { app } from "electron";
import { SUPERSET_DIR_NAME } from "shared/constants";
import { copyForkDataOnFirstLaunch } from "./fork-data-migration";

copyForkDataOnFirstLaunch(
	SUPERSET_DIR_NAME,
	app.getPath("appData"),
	app.getName(),
);
