// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

import { contextBridge, ipcRenderer } from "electron";

const chrome = {
	open: () => {
		ipcRenderer.send("open-chrome");
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

export const API = {
	chrome,
	window: _window,
};

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("api", API);
