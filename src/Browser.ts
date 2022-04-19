import * as puppeteer from "puppeteer-core";
import * as fs from "fs";
import * as os from "os";

export default class Browser {
	static browser: puppeteer.Browser;
	static page: puppeteer.Page;

	private static async getChromePath() {
		return `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\User Data`;
	}

	static async launchBrowser() {
		if (Browser.browser) {
			await Browser.browser.close();
		}

		try {
			const extensions = [];
			for (const extension of fs.readdirSync(
				`${await Browser.getChromePath()}\\Default\\Extensions`
			)) {
				extensions.push(
					`${await Browser.getChromePath()}\\Default\\Extensions\\${extension}`
				);
			}

			Browser.browser = await puppeteer.launch({
				headless: false,
				defaultViewport: null,
				executablePath:
					"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
				args: [
					`--user-data-dir=${await Browser.getChromePath()}`,
					...extensions,
				],
			});
		} catch (e) {
			console.log("Browser opening error: ", e.message);
			throw new Error(
				"Please close all other instances of Chrome and try again."
			);
		}

		Browser.page = await Browser.browser.newPage();

		await Browser.page.goto("https://lichess.org/login");
		await Browser.page.click("#form3-username");
		await Browser.page.keyboard.type("Salut mon pote");
		// const window = new BrowserWindow();
		// const url = "https://example.com/";
		// await window.loadURL(url);

		// const page = await pie.getPage(browser, window);
		// console.log(page.url());
	}
}
