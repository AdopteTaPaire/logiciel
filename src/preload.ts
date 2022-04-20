// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

import { contextBridge, ipcRenderer } from "electron";

const chrome = {
	open: () => {
		ipcRenderer.send("open-chrome");
	},
	continue: () => {
		ipcRenderer.send("app-continue");
	},
	onNeedContinue: (callback: (...args: unknown[]) => void) => {
		ipcRenderer.on("app-continue", (event, ...args) => callback(...args));
	},
};

const _window = {
	refresh: () => {
		ipcRenderer.send("app-refresh", true);
	},
	onError: (callback: (message: string) => void) => {
		ipcRenderer.on("app-error", (event, ...args) => callback(args[0]));
	},
};

const params = {
	get: (param: string) => {
		ipcRenderer.send("app-get-parameters", param);
	},
	onGet: (callback: (param: string, value: string) => void) => {
		ipcRenderer.on("app-get-parameters", (event, ...args) =>
			callback(args[0], args[1])
		);
	},
	set: (param: string, value: string) => {
		ipcRenderer.send("app-set-parameters", param, value);
	},
};

export const API = {
	chrome,
	window: _window,
	params,
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", API);
