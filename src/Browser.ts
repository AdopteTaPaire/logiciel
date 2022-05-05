import * as puppeteer from "puppeteer-core";
import axios from "axios";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import Main from "./Main";
import delay from "./utils/delay";
import Parameter from "./Parameter";
import { compute as productCompute } from "./utils/product";
import { parse as stringParse } from "./utils/string";

export interface ISite {
	url: string;
	title: string;
	cookies?: string;
	scripts: {
		[key: string]: {
			page: string;
			args?: { [key: string]: string };
			condition?: {
				type: "notexists";
				selector: string;
				action?: string;
				else: string;
			};
			actions: {
				type: "click" | "input" | "wait" | "human" | "upload";
				validation?: {
					type: "iframe" | "input";
					value: string | boolean;
					continue?: boolean;
				};
				selector?: string;
				selectors?: { [key: string]: string };
				value?: string;
				value2?: string | number;
				valueCustom?: string | number;
				text?: string;
				continue?: boolean; // If true, the script will continue if the selector is not found
				for: ISite["scripts"]["actions"];
				relaunch?: boolean; // If true, the script will relaunch if the selector is found. Usefull for human confirm, relaunch the script after the confirm.
			}[];
		};
	};
}
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
		product: any; // I know it's not good to use any, but here I would need to copy/paste the product interface and edit it each time the interface changes
		args: { [key: string]: string };
		state: number;
		running: boolean; // custom property to know if the action is running
	}[] = [];
	private static sites: {
		// cache sites to avoid loading them multiple times
		[key: string]: ISite;
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
		// return `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\User Data`;
		return path.join(__dirname, "../chrome/data");
	}

	private static async fetchApi(endpoint: string): Promise<any | null> {
		if (!Browser.browser) return null;
		if (endpoint != "/version" && !Browser.initied) return null;

		try {
			const page = await Browser.browser.newPage();
			const response = await page.goto(`${process.env.APP_URL}/api${endpoint}`);
			const content = await page.evaluate(() => document.body.innerText);
			const status = response.status();
			if (status == 401) {
				// login user if needed
				console.log("Login user...");

				await page.goto(`${process.env.APP_URL}/login`);
				await page.type("#username", Parameter.get("app_username"));
				await page.type("#password", Parameter.get("app_password"));
				await page.click("#se-connecter");
				await page.waitForNavigation();
				const url = page.url();
				await page.close();
				if (url == `${process.env.APP_URL}/login`) {
					throw new Error("Login failed.");
				}
				return await Browser.fetchApi(endpoint);
			}

			await page.close();
			if (status >= 400) {
				throw new Error("Error loading API, status code: " + status);
			}

			return JSON.parse(content);
		} catch (e) {
			console.log("Error fetching API: ", e);
			return null;
		}
	}

	private static async runActions(): Promise<void> {
		console.log("Running actions...");
		if (Browser.actions.length == 0)
			return console.log("No more action to run...");

		const action = Browser.actions[0]; // get the first action
		if (action.state != 0) return;
		if (action.running) return; // if this action is running, we wait. Don't like to execute multiple actions at the same time, for the moment => to test

		action.running = true;
		try {
			const did = await Browser.runScript(action.site, action.script, {
				...Parameter.getAll(),
				...action.args,
				...productCompute(action.product),
			});
			action.running = false;
			if (!did) return;
		} catch (e) {
			console.log("Error running action: ", e);
			Main.sendError("Error running action: " + e.message);
			action.running = false;
			return;
		}

		console.log("Action done: ", action.site, action.script);
		action.state = 1;
		Browser.actions.shift();
		// await Browser.fetchApi(`/actions/update?id=${action._id}&state=1`);
	}

	private static initIntervals() {
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
			Main.sendError("Error fetching actions.", true);
			throw new Error("Could not connect to the API.");
		}

		for (const action of actions.data.actions) {
			if (Browser.actions.find((a) => a._id == action._id)) continue; // if the action is already in the list, we skip it
			Browser.actions.push(action);
		}
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
	): Promise<puppeteer.Page | void> {
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

		// check script arguments
		if (scriptData.args) {
			console.log("Checking script args...");
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
		// redirect to page url if it contains http otherwise, use site url + page endpoint
		const newUrl =
			scriptData.page.indexOf("http") != -1
				? scriptData.page
				: `${siteData.url}/${scriptData.page}`;
		// Check if we're already on the page
		if (page.url().indexOf(newUrl) == -1) await page.goto(newUrl);

		// accept cookies first
		if (siteData.cookies) {
			console.log("Accepting cookies...");
			try {
				await page.waitForSelector(siteData.cookies, { timeout: 5000 });

				await page.click(siteData.cookies);
				await page.waitForTimeout(3000); // wait for website to compute

				console.log("Cookies accepted");
			} catch (e) {
				console.log("No cookies to accept");
			}
		}

		if (scriptData.condition) {
			// if the selector is found and condition = notexists, run the else script and then re-run the actual script
			console.log("Checking script condition");

			const onNotFullfilled: () => Promise<puppeteer.Page | void> =
				async () => {
					const curPage = await Browser.runScript(
						site,
						scriptData.condition.else,
						args,
						page
					);
					if (!curPage) {
						await page.close();
						throw new Error(
							"Error while running else condition of " + site + " " + script
						);
					}

					return Browser.runScript(site, script, args, page);
				};

			try {
				await page.waitForSelector(scriptData.condition.selector, {
					timeout: 5000,
				});

				// here selector exists because waitForSelector didn't throw an error
				if (scriptData.condition.type === "notexists") {
					if (scriptData.condition.action == "click") {
						await page.click(scriptData.condition.selector); // usefull when we need to click on a login button for exemple
						// for leboncoin, if we don't click on a login button, the redirect_uri is not set and we can't log in
					}

					return onNotFullfilled();
				}
			} catch (e) {
				// selector doesnt exists
				if (scriptData.condition.type !== "notexists") {
					return onNotFullfilled();
				}
			}
		}

		// loop to run the actions in the script
		for (const action of scriptData.actions) {
			let selector = action.selector;

			if (action.value && action.selectors) {
				// if the action value & an array of selector is set, means we have multiple selector to choose based on the value
				for (const [selecName, selec] of Object.entries(action.selectors)) {
					// the key is the name of the selector, we need to see if the value contains the key
					if (args[action.value].indexOf(selecName) !== -1) {
						selector = selec;
					}
				}

				if (selector == action.selector) {
					// if we didn't find a selector, we use the default one
					selector = action.selectors.default;
				}
			}

			console.log(
				"Running action",
				action.type,
				selector ?? action.value ?? action.valueCustom
			);

			try {
				// if no selector & a certain action, then return;
				// this little action array is the actions which need to have a valid selector
				if (
					!selector &&
					["click", "input", "upload"].indexOf(action.type) != -1
				)
					throw new Error("No selector");

				if (selector) {
					// check if the selector is valid, if not it'll throw an error
					const element = await page.waitForSelector(selector, {
						timeout: 5000,
					});

					if (action.validation) {
						switch (action.validation.type) {
							case "iframe": {
								// if we need to validate an iframe, we see all frame and then if we match the src, means we good
								const frames = await page.frames();
								const frame = frames.find((f) =>
									f.url().includes(action.validation.value as string)
								);
								if (!frame) {
									if (action.validation.continue) continue;
									throw new Error("No frame found"); // will trigger the catch
								}
								// atm the moment, this is used to check leboncoin captacha, if we find the iframe, we continue the script execution to make the human do the captcha

								break;
							}
							case "input": {
								const val = await (
									await element.getProperty("checked")
								).jsonValue();
								console.log(
									"Input value",
									val,
									typeof val,
									action.validation.value
								);
								if (val != action.validation.value) {
									if (action.validation.continue) continue;
									throw new Error("Value not valid");
								}

								break;
							}
						}
					}
				}
			} catch (e) {
				if (!action.continue) {
					console.log(e.message + ": " + selector);
					return await page.close();
				} else {
					continue;
				}
			}

			// do the action
			switch (action.type) {
				case "click": {
					await page.click(selector);
					break;
				}
				case "input":
					await page.click(selector);
					await page.keyboard.type(
						args[action.value] ?? (action.value2 ? args[action.value2] : ""), // if value doesn't exist, use value2, or ""
						{ delay: 100 }
					);
					break;
				case "wait":
					await page.waitForTimeout(action.valueCustom as number);
					break;
				case "human":
					await Browser.humanAction(site, script, action.text);
					break;
				case "upload": {
					const endpoint = stringParse(action.value.toString(), args);
					if (!fs.existsSync(action.value.toString())) {
						http.get(`${process.env.APP_URL}${endpoint}`, (res) => {
							const file = fs.createWriteStream(
								path.resolve(__dirname, "../", endpoint)
							);
							res.pipe(file);
							file.on("finish", () => {
								file.close();
								console.log("File downloaded");
							});
						});
					}
					const elem = await page.$(selector);
					await elem.uploadFile(path.resolve(__dirname, "../", endpoint));

					break;
				}
				default:
					await page.close();
					throw new Error("Unknown action type: " + action.type);
			}

			if (action.relaunch) {
				return Browser.runScript(site, script, args, page);
			}
		}

		return page;
	}

	private static onClose() {
		console.log("Browser closed");

		if (Browser.browser) {
			Browser.browser.close();
		}

		if (Browser.process) {
			Browser.process.kill();
		}

		if (Browser.actionsFetchInterval) {
			clearInterval(Browser.actionsFetchInterval);
		}
		if (Browser.actionsRunInterval) {
			clearInterval(Browser.actionsRunInterval);
		}

		Browser.browser = null;
		Browser.process = null;
		Browser.initied = false;
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
		Browser.process.on("close", Browser.onClose);
		return Browser.process;
	}

	private static async TRIGGERCAPTCHA() {
		// just a little function to make leboncoin ask us for the captcha (usefull to try to bypass it)
		const page = await Browser.browser.newPage();
		await page.goto("https://www.leboncoin.fr/deposer-une-annonce");
		await page.click(
			"#account-deposit > div.styles_contentBox__vpOna > div > div > div.sc-iQKALj.ixvnQX > div > button"
		);
		await page.waitForNavigation();
		await page.click("#email");
		await page.keyboard.type("oidfmjdhufdshifehzfhuvhieirhgf@gmail.com");
		await page.click("#password");
		await page.keyboard.type("oidfmjdhufdshifehzfhuvhieirhgf@gmail.com");
		for (let i = 0; i < 10; i++) {
			await page.click(
				"#__next > div > main > div > div.row.sc-ikJzcn.fJNrxx > div > div.row.sc-hiCivh.iUXnyj > form > div.row.sc-ezbkgU.iYxMPu > button"
			);
			await page.waitForTimeout(100);
		}
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
				defaultViewport: { width: 1000, height: 900 },
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

		Browser.initIntervals();
		// Browser.TRIGGERCAPTCHA();

		return true;
	}
}
