import logger from "electron-log";
import { autoUpdater } from "electron-updater";

autoUpdater.logger = logger;

/**
 * Check if the app has updates available. If so, download the latest one and notify the user
 */
export default async function updateApp(): Promise<void> {
	try {
		await autoUpdater.checkForUpdatesAndNotify();
	} catch (err) {
		// Ignore errors thrown because user is not connected to internet
		if ((err as Error).message !== "net::ERR_INTERNET_DISCONNECTED") {
			throw err;
		}
	}
}
