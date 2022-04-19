import { API } from "../preload";

declare global {
	interface Window {
		api: typeof API;
	}
}
