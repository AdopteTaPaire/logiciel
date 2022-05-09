import * as puppeteer from "puppeteer-core";
import Browser, { ISiteData } from "./Browser";
import Action, { IAction } from "./Action";

export interface IScriptData {
	debug?: boolean;
	page: string;
	args?: { [key: string]: string };
	condition?: {
		type: "notexists";
		selector: string;
		action?: string;
		else: string;
	};
	actions: IAction[];
}

export default class Script {
	private siteName: string;
	private scriptName: string;
	private site: ISiteData;
	private script: IScriptData;
	private actions: Action[];

	constructor(
		siteName: string,
		scriptName: string,
		site: ISiteData,
		script: IScriptData
	) {
		this.siteName = siteName;
		this.scriptName = scriptName;
		this.site = site;
		this.script = script;
		this.actions = [];

		for (const action of this.script.actions) {
			this.actions.push(new Action(this, action));
		}
	}

	public getSite() {
		return this.site;
	}

	public getData() {
		return this.script;
	}

	public getSiteName() {
		return this.siteName;
	}

	public getScriptName() {
		return this.scriptName;
	}

	// check the script required argument, and set the default value if not set and if the arg have a default value
	private checkArgs(args: { [key: string]: string }) {
		if (this.script.args) {
			console.log("Checking script args...");
			if (!args) throw new Error("Missing arguments object !");

			for (const arg in this.script.args) {
				if (args[arg]) continue;

				if (this.script.args[arg] == "") {
					throw new Error("Missing argument: " + arg);
				}

				args[arg] = this.script.args[arg];
			}
		}

		return args;
	}

	// create if not exists, and go to the script url
	private async gotoPage(page: puppeteer.Page) {
		if (!page) page = await Browser.newPage();
		// redirect to page url if it contains http otherwise, use site url + page endpoint
		const newUrl =
			this.script.page.indexOf("http") != -1
				? this.script.page
				: `${this.site.url}/${this.script.page}`;
		// Check if we're already on the page
		if (page.url().indexOf(newUrl) == -1) await page.goto(newUrl);

		return page;
	}

	private async acceptCookies(page: puppeteer.Page) {
		if (this.site.cookies) {
			console.log("Accepting cookies...");
			try {
				await page.waitForSelector(this.site.cookies, { timeout: 5000 });

				await page.click(this.site.cookies);
				await page.waitForTimeout(3000); // wait for website to compute

				console.log("Cookies accepted");
			} catch (e) {
				console.log("No cookies to accept");
			}
		}
	}

	private async checkCondition(
		args: { [key: string]: string },
		page: puppeteer.Page
	) {
		if (this.script.condition) {
			// if the selector is found and condition = notexists, run the else script and then re-run the actual script
			console.log("Checking script condition");

			const onNotFullfilled: () => Promise<puppeteer.Page | void> =
				async () => {
					const curPage = await Browser.runScript(
						this.siteName,
						this.script.condition.else,
						args,
						page
					);
					if (!curPage) {
						await page.close();
						throw new Error(
							"Error while running else condition of " +
								this.siteName +
								" " +
								this.scriptName
						);
					}

					return Browser.runScript(this.siteName, this.scriptName, args, page);
				};

			try {
				await page.waitForSelector(this.script.condition.selector, {
					timeout: 5000,
				});

				// here selector exists because waitForSelector didn't throw an error
				if (this.script.condition.type === "notexists") {
					if (this.script.condition.action == "click") {
						await page.click(this.script.condition.selector); // usefull when we need to click on a login button for exemple
						// for leboncoin, if we don't click on a login button, the redirect_uri is not set and we can't log in
					}

					return onNotFullfilled();
				}
			} catch (e) {
				// selector doesnt exists
				if (this.script.condition.type !== "notexists") {
					return onNotFullfilled();
				}
			}
		}
	}

	public async run(args: { [key: string]: string }, page?: puppeteer.Page) {
		args = this.checkArgs(args);
		page = await this.gotoPage(page);

		await this.acceptCookies(page);
		await this.checkCondition(args, page);

		for (const action of this.actions) {
			const returnCode = await action.run(args, page);
			if (returnCode == 0) {
				continue;
			} else if (returnCode == -1) return;

			if (action.getData().relaunch) {
				return Browser.runScript(this.siteName, this.scriptName, args, page);
			}
		}

		return this.script.debug ? null : page;
	}
}
