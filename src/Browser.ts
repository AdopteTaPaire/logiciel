import * as puppeteer from "puppeteer-core";
import axios from "axios";
import * as child_process from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as _ from "lodash";
import Main from "./Main";
import delay from "./utils/delay";
import Parameter from "./Parameter";
import { compute as productCompute } from "./utils/product";
import Script, { IScriptData } from "./Script";

interface ISiteBase {
	url: string;
	title: string;
	cookies?: string;
}

// This interface is the data we receive from the api
export interface ISiteData extends ISiteBase {
	// If you need infos about all the fields, go see the comments in the api side, in the ./lib/sites/index.ts file
	// All the fiels are copy pasted
	scripts: {
		[key: string]: IScriptData;
	};
}

// This one is how we store it in the Browser attribute
export interface ISite extends ISiteBase {
	scripts: {
		[key: string]: Script;
	};
}
export default class Browser {
	private static browser: puppeteer.Browser | null;
	private static process: child_process.ChildProcess | null;
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
		// if the site already exists in cache, we don't need to fetch it again
		if (Browser.sites[site]) return Browser.sites[site];

		try {
			const response = await Browser.fetchApi(`/actions/script?site=${site}`);
			if (!response) {
				throw new Error("Error loading site.");
			}
			const siteData = response.data.site as ISiteData;
			// we'll instanciate the scripts to be able to run them.
			const newSite = _.omit(siteData, ["scripts"]) as ISite;
			newSite.scripts = {};

			for (const [key, script] of Object.entries(siteData.scripts)) {
				newSite.scripts[key] = new Script(site, key, siteData, script);
			}

			Browser.sites[site] = newSite;
			return newSite;
		} catch (e) {
			console.log("Error loading site: ", e);
			return null;
		}
	}

	static async getSite(site: string) {
		await Browser.loadSite(site);

		return Browser.sites[site];
	}

	static async getScript(site: string, script: string) {
		const siteData = await Browser.getSite(site);
		return siteData ? siteData.scripts[script] : null;
	}

	private static async getChromeDataPath() {
		// return `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\User Data`;
		return path.join(Main.getRessourcesPath(), "chrome");
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
			if (!did) return; // avoid the action to rerun if it failed, we just don't set the action.running to false
			action.running = false;
		} catch (e) {
			console.log("Error running action: ", e);
			Main.sendError("Error running action: " + (e as Error).message);
			action.running = false;
			return;
		}

		console.log("Action done: ", action.site, action.script);
		action.state = 1;
		Browser.actions.shift();
		await Browser.fetchApi(`/actions/update?id=${action._id}&state=1`);
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

	public static humanAction(site: string, script: string, text: string) {
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
		siteName: string,
		scriptName: string,
		args?: { [key: string]: string },
		page?: puppeteer.Page
	): Promise<puppeteer.Page | void | null> {
		console.log("Running script: ", siteName, scriptName);

		const script = await Browser.getScript(siteName, scriptName);
		if (!script) return null;
		return await script.run(args ?? {}, page);
	}

	static newPage() {
		if (!Browser.browser) return null;
		return Browser.browser.newPage();
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
			Parameter.get("chrome_path"),
			[
				"--remote-debugging-port=9222",
				`--user-data-dir=${await Browser.getChromeDataPath()}`,
			],
			{
				detached: false,
			}
		);
		Browser.process.on("close", Browser.onClose);
		return Browser.process;
	}

	private static async TRIGGERCAPTCHA() {
		if (!Browser.browser) return;
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

	private static async uploadTest() {
		if (!Browser.browser) return;

		const value = "/images/products/PHOTOS/A4/A4%20(1).jpg";
		const selector = "#file";

		const page = await Browser.browser.newPage();
		await page.goto("file:///C:/Users/pj841/Documents/STAGE/upload_test.html");

		const endpoint = value.toString();
		const imgPath = path.resolve(Main.getRessourcesPath(), endpoint);

		// if we don't have the image in our files, download it from the api
		if (!fs.existsSync(imgPath)) {
			console.log("doesnt exists, downloading");
			// remove the file name from the path
			const dirPath = imgPath.replace(path.basename(imgPath), "");
			console.log(dirPath);

			fs.mkdirSync(dirPath, { recursive: true });

			// http.get(`${process.env.APP_URL}${endpoint}`, (res) => {
			// 	console.log("creating file stream");
			// 	const file = fs.createWriteStream(imgPath);
			// 	res.pipe(file);
			// 	file.on("finish", () => {
			// 		file.close();
			// 		console.log("File downloaded");
			// 	});
			// });
		}

		const elem = await page.$(selector);
		if (elem) await elem.uploadFile(imgPath);
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
		// Browser.uploadTest();

		return true;
	}
}
