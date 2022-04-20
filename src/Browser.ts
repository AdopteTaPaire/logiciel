import * as puppeteer from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";
import Main from "./Main";

export default class Browser {
	private static browser: puppeteer.Browser;
	private static initied = false;
	private static sites: {
		[key: string]: {
			url: string;
			title: string;
			cookies?: string;
			scripts: {
				[key: string]: {
					page: string;
					condition: {
						type: string;
						selector: string;
					};
					args?: { [key: string]: string };
					actions: {
						type: "click" | "input" | "wait" | "human";
						condition?: "notexists";
						selector?: string;
						value?: string;
						text?: string;
					}[];
				};
			};
		};
	} = {};

	private static loadSite(site: string) {
		try {
			const siteJson = fs.readFileSync(
				path.resolve(__dirname, `../public/sites/${site}.json`)
			);
			const siteData = JSON.parse(siteJson.toString());
			Browser.sites[site] = siteData;

			return siteData;
		} catch (e) {
			console.log("Error loading site: ", e);
			return null;
		}
	}

	private static async fetchApi(
		endpoint: string
	): Promise<{ [key: string]: object } | null> {
		if (!Browser.browser) return null;
		if (endpoint != "/version" && !Browser.initied) return null;

		try {
			const page = await Browser.browser.newPage();
			await page.goto(`${process.env.APP_URL}/api${endpoint}`);
			const content = await page.evaluate(() => document.body.innerText);
			await page.close();

			return JSON.parse(content);
		} catch (e) {
			console.log("Error fetching API: ", e);
			return null;
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
	) {
		if (!Browser.sites[site]) {
			if (!Browser.loadSite(site))
				return Main.sendError("Could not open site: " + site);
		}

		console.log(
			"Running script: " + script + " on site " + site + " with args: ",
			args
		);

		const siteData = Browser.sites[site];
		const scriptData = siteData.scripts[script];
		if (!scriptData) return Main.sendError("No script data !");

		if (!page) page = await Browser.browser.newPage();
		await page.goto(`${siteData.url}/${scriptData.page}`);
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

		if (scriptData.args) {
			for (const arg in scriptData.args) {
				if (args[arg]) continue;

				if (scriptData.args[arg] == "") {
					throw new Error("Missing argument: " + arg);
				}

				args[arg] = scriptData.args[arg];
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
				if (!action.condition && action.condition != "notexists") {
					console.log("Could not find selector: " + action.selector);
					continue;
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
					await page.waitForTimeout(parseInt(action.value));
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

	static async launchBrowser() {
		if (Browser.browser) {
			await Browser.browser.close();
		}

		try {
			const options: Parameters<typeof puppeteer.launch>[0] = {
				headless: false,
				defaultViewport: {
					width: 1500,
					height: 800,
				},
				executablePath:
					"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
				ignoreDefaultArgs: ["--disable-extensions"],
				args: [`--start-maximized`],
			};

			Browser.browser = await puppeteer.launch(options);
		} catch (e) {
			console.log("Browser opening error: ", e);
			throw new Error(
				"Please close all other instances of Chrome and try again."
			);
		}

		setTimeout(async () => {
			const data = await Browser.fetchApi("/version");
			if (!data) {
				return Main.sendError("Could not connect to the API.");
			}
			console.log(data.version);
			Browser.initied = true;

			// await Browser.runScript("vinted", "login", {
			// 	email: "pj",
			// 	password: "1234",
			// });
		}, 3000);
	}
}
