import * as puppeteer from "puppeteer-core";
import axios from "axios";
import * as child_process from "child_process";
import * as os from "os";
import Main from "./Main";
import delay from "./utils/delay";
import Parameter from "./Parameter";

export default class Browser {
	private static browser: puppeteer.Browser;
	private static process: child_process.ChildProcess;
	private static initied = false;
	private static actionsFetchInterval: NodeJS.Timer;
	private static actionsRunInterval: NodeJS.Timer;
	private static actions: {
		_id: string;
		site: string;
		script: string;
		product: string;
		args: { [key: string]: string };
		state: number;
	}[] = [];
	private static sites: {
		// cache sites to avoid loading them multiple times
		[key: string]: {
			url: string;
			title: string;
			cookies?: string;
			scripts: {
				[key: string]: {
					page: string;
					args?: { [key: string]: string };
					actions: {
						type: "click" | "input" | "wait" | "human";
						condition?: "notexists";
						selector?: string;
						value?: string | number;
						text?: string;
						continue?: boolean; // If true, the script will continue if the selector is not found
					}[];
				};
			};
		};
	} = {};

	private static async loadSite(site: string) {
		try {
			const response = await Browser.fetchApi(`/actions/script?site=${site}`);
			if (!response) {
				throw new Error("Error loading site.");
			}
			Browser.sites[site] = response.data.site;

			return Browser.sites[site];
		} catch (e) {
			console.log("Error loading site: ", e);
			return null;
		}
	}

	private static async getChromePath() {
		return `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\User Data`;
	}

	private static async fetchApi(endpoint: string): Promise<any | null> {
		if (!Browser.browser) return null;
		if (endpoint != "/version" && !Browser.initied) return null;

		try {
			const page = await Browser.browser.newPage();
			const response = await page.goto(`${process.env.APP_URL}/api${endpoint}`);
			const content = await page.evaluate(() => document.body.innerText);
			const status = response.status();
			if (status >= 400) {
				throw new Error("Error loading API, status code: " + status);
			}
			await page.close();

			return JSON.parse(content);
		} catch (e) {
			console.log("Error fetching API: ", e);
			return null;
		}
	}

	private static async runActions() {
		console.log("Running actions...");

		const action = Browser.actions.shift();
		if (!action) return;
		if (action.state != 0) return;

		const did = await Browser.runScript(action.site, action.script, {
			...Parameter.getAll(),
			...action.args,
		});
		if (!did) return;

		action.state = 1;
		await Browser.fetchApi(`/actions/update?id=${action._id}&state=1`);
	}

	private static initTimeouts() {
		if (Browser.actionsFetchInterval) {
			clearInterval(Browser.actionsFetchInterval);
		}
		if (Browser.actionsRunInterval) {
			clearInterval(Browser.actionsRunInterval);
		}
		Browser.actionsFetchInterval = setInterval(Browser.fetchActions, 10000); // actions are updated every 10 seconds
		Browser.actionsRunInterval = setInterval(Browser.runActions, 10000); // actions are run every 10 seconds
	}

	private static async fetchActions() {
		console.log("Fetching actions...");

		const actions = await Browser.fetchApi("/actions");
		if (!actions) {
			throw new Error("Could not connect to the API.");
		}
		Browser.actions = actions.data.actions;
	}

	private static humanAction(site: string, script: string, text: string) {
		return new Promise((resolve) => {
			Main.sendNotification(
				site + " - " + script,
				text + "\nPuis appuyez sur continuer dans le logiciel."
			);
			Main.needContinue(text, () => {
				console.log("Human action continuing...");
				resolve({});
			});
		});
	}

	static async runScript(
		site: string,
		script: string,
		args?: { [key: string]: string },
		page?: puppeteer.Page
	) {
		if (!Browser.sites[site]) {
			if (!(await Browser.loadSite(site)))
				return Main.sendError("Could not open site: " + site);
		}

		console.log(
			"Running script: " + script + " on site " + site + " with args: ",
			args
		);

		const siteData = Browser.sites[site];
		const scriptData = siteData.scripts[script];
		if (!scriptData) return Main.sendError("No script data !");

		if (scriptData.args) {
			if (!args) throw new Error("Missing arguments object !");

			for (const arg in scriptData.args) {
				if (args[arg]) continue;

				if (scriptData.args[arg] == "") {
					throw new Error("Missing argument: " + arg);
				}

				args[arg] = scriptData.args[arg];
			}
		}

		if (!page) page = await Browser.browser.newPage();
		await page.goto(
			scriptData.page.indexOf("http") != -1
				? scriptData.page
				: `${siteData.url}/${scriptData.page}`
		); // redirect to page url if it contains http otherwise, use site url + page endpoint
		// await waitTillHTMLRendered(page);

		if (siteData.cookies) {
			// accept cookies first
			try {
				await page.waitForSelector(siteData.cookies);

				await page.click(siteData.cookies);
				await page.waitForTimeout(3000); // wait for website to compute

				console.log("Cookies accepted");
			} catch (e) {
				console.log("No cookies to accept");
			}
		}

		for (const action of scriptData.actions) {
			console.log(
				"Running action",
				action.type,
				action.selector ?? action.value
			);

			try {
				if (action.selector) {
					await page.waitForSelector(action.selector);
				}
			} catch (e) {
				if (
					(!action.condition && action.condition != "notexists") ||
					!action.continue
				) {
					console.log("Could not find selector: " + action.selector);
					return;
				}
			}

			// do the action
			switch (action.type) {
				case "click":
					await page.click(action.selector);
					break;
				case "input":
					await page.click(action.selector);
					await page.keyboard.type(args[action.value]);
					break;
				case "wait":
					await page.waitForTimeout(action.value as number);
					break;
				case "human":
					await Browser.humanAction(site, script, action.text);
					break;
				default:
					throw new Error("Unknown action type: " + action.type);
			}
		}

		return page;
	}

	private static async launchProcess() {
		// make a new process to avoid all puppeteer paramaters. Usefull for bypassing bot detection
		Browser.process = child_process.spawn(
			"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			[
				"--remote-debugging-port=9222",
				`--user-data-dir=${await Browser.getChromePath()}`,
			],
			{
				detached: false,
			}
		);
		return Browser.process;
	}

	static async launchBrowser() {
		if (Browser.browser) {
			await Browser.browser.close();
		}

		if (Browser.process) {
			Browser.process.kill();
		}

		await Browser.launchProcess();

		// wait for the browser to be ready
		await delay(3000);
		// using delay to have a promise timeout

		try {
			const response = await axios.get("http://localhost:9222/json/version");
			Browser.browser = await puppeteer.connect({
				browserWSEndpoint: response.data?.webSocketDebuggerUrl,
			});
		} catch (e) {
			console.log("Browser opening error: ", e);
			throw new Error(
				"Please close all other instances of Chrome and try again."
			);
		}

		await delay(2000);

		const data = await Browser.fetchApi("/version");
		if (!data) {
			throw new Error("Could not connect to the API.");
		}
		console.log(data.version);
		Browser.initied = true;

		Browser.initTimeouts();

		return true;
	}
}
