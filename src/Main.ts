import {
	BrowserWindow,
	nativeImage,
	Menu,
	Tray,
	shell,
	ipcMain,
	Notification,
} from "electron";
import * as path from "path";
import Parameter from "./Parameter";
import Browser from "./Browser";

export default class Main {
	private static mainWindow: BrowserWindow;
	private static application: Electron.App;
	private static BrowserWindow: typeof BrowserWindow;
	private static tray: Tray;
	private static ipcInitied: boolean;
	private static continueCallback: () => void;

	private static onWindowAllClosed() {
		// just hide the window, do not quit the app.
		if (process.platform == "darwin") Main.application.dock.hide();
	}

	private static initIpc() {
		if (Main.ipcInitied) return;

		ipcMain.on("app-refresh", Main.onReady);
		ipcMain.on("open-chrome", async () => {
			try {
				if (await Browser.launchBrowser()) {
					Main.sendNotification("Navigateur", "Le navigateur est opérationnel");
				}
			} catch (e) {
				Main.sendError((e as Error).message);
			}
		});
		ipcMain.on("app-continue", () => Main.continueCallback());

		ipcMain.on("app-get-parameters", (event, ...args) => {
			const param = args[0];
			const val = Parameter.get(param);

			if (!val) return;
			Main.mainWindow.webContents.send("app-get-parameters", param, val);
		});
		ipcMain.on("app-set-parameters", (event, ...args) => {
			const param = args[0];
			const value = args[1];
			Parameter.set(param, value);
		});

		Main.ipcInitied = true;
	}

	static needContinue(text: string, cb: () => void) {
		Main.continueCallback = cb; // avoid register multiple on.
		Main.mainWindow.webContents.send("app-continue", text);
	}

	private static onReady() {
		if (!Main.tray) Main.createTray();
		if (Main.mainWindow) Main.mainWindow.close();

		Main.mainWindow = new Main.BrowserWindow({
			width: 500,
			height: 600,
			webPreferences: {
				preload: path.join(__dirname, "preload.js"),
			},
			autoHideMenuBar: true,
			icon: path.join(__dirname, "../public/icons/win/icon.ico"),
		});
		Main.mainWindow.loadURL(
			"file://" + path.resolve(__dirname, "../public/index.html")
		);

		Main.mainWindow.webContents.once("new-window", function (e, url) {
			// open external links in default browser
			e.preventDefault();
			shell.openExternal(url);
		});

		Main.initIpc();
	}

	private static createTray() {
		const icon = path.join(__dirname, "../public/app.png"); // required.
		const trayicon = nativeImage.createFromPath(icon);
		Main.tray = new Tray(trayicon.resize({ width: 16 }));
		const contextMenu = Menu.buildFromTemplate([
			{
				label: "Show App",
				click: () => {
					Main.onReady();
				},
			},
			{
				label: "Quit",
				click: () => {
					Main.application.quit(); // actually quit the app.
				},
			},
		]);

		Main.tray.setToolTip("Adopte ta paire");
		Main.tray.setContextMenu(contextMenu);
	}

	static sendNotification(title: string, body: string) {
		new Notification({
			title,
			body,
			icon: nativeImage.createFromPath(
				path.join(__dirname, "../public/app.png")
			),
		}).show();
	}

	static sendError(error: string, notify = true) {
		if (notify) Main.sendNotification("Error", error);
		Main.mainWindow.webContents.send("app-error", error);
	}

	static main(app: Electron.App, browserWindow: typeof BrowserWindow) {
		// we pass the Electron.App object and the
		// Electron.BrowserWindow into this function
		// so this class has no dependencies. This
		// makes the code easier to write tests for
		Main.BrowserWindow = browserWindow;
		Main.application = app;
		Main.application.on("window-all-closed", Main.onWindowAllClosed);
		Main.application.on("ready", Main.onReady);
	}
}
