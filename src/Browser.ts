import * as puppeteer from "puppeteer-core";

export default class Browser {
	static browser: puppeteer.Browser;
	static page: puppeteer.Page;

	private static async fetchApi(
		endpoint: string
	): Promise<{ [key: string]: object } | null> {
		if (!Browser.browser) return null;

		const page = await Browser.browser.newPage();
		page.goto(`${process.env.APP_URL}/api${endpoint}`);
		await page.waitForNavigation();
		const content = await page.evaluate(() => document.body.innerText);
		await page.close();

		return JSON.parse(content);
	}

	static async launchBrowser() {
		if (Browser.browser) {
			await Browser.browser.close();
		}

		try {
			const options: Parameters<typeof puppeteer.launch>[0] = {
				headless: false,
				devtools: false,
				defaultViewport: null,
				executablePath:
					"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
				ignoreDefaultArgs: ["--disable-extensions"],
			};

			Browser.browser = await puppeteer.launch(options);
		} catch (e) {
			console.log("Browser opening error: ", e);
			throw new Error(
				"Please close all other instances of Chrome and try again."
			);
		}

		Browser.page = (await Browser.browser.pages())[0]; // page opened by puppeteer automaticaly
	}
}
