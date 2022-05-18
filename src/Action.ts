import * as puppeteer from "puppeteer-core";
import axios from "axios";
import * as path from "path";
import * as fs from "fs";
import Browser from "./Browser";
import Script from "./Script";
import { parse as stringParse } from "./utils/string";

export interface IAction {
	type: "click" | "input" | "wait" | "human" | "upload" | "return" | "for";
	if?: { this: string; eq: string }[];
	then?: IAction["selector"] | IAction["selectors"];
	else?: IAction["then"];
	validation?: {
		type: "iframe" | "input";
		value: string | boolean;
		continue?: boolean;
	};
	selector?: string;
	selectors?: { [key: string]: string };
	value?: string | number;
	text?: string;
	continue?: boolean;
	relaunch?: boolean;
	for: IAction[];
}

export default class Action {
	private action: IAction;
	private script: Script;

	constructor(script: Script, action: IAction) {
		this.script = script;
		this.action = action;
	}

	public getData() {
		return this.action;
	}

	private getValue(args: { [key: string]: string }) {
		return this.action.value && typeof this.action.value == "string"
			? stringParse(this.action.value, args)
			: this.action.value ?? "";
	}

	private async getSelector(
		value: string | number = "",
		args: { [key: string]: string }
	) {
		let selectors = this.action.selectors;
		let selector = this.action.selector;

		if (this.action.if) {
			// if we have an if condition, we need to check if the value is equal to the condition
			let passed = true; // default to true, if the condition is false, we will set it to false
			for (const { this: toCheck, eq } of this.action.if) {
				const toCheckParsed = stringParse(toCheck, args);
				let eqPassed = false;
				for (const eqArg of eq.split("|")) {
					// we can have multiple values to check, separated by |
					// exemple: if: [{this: "myValue", eq: "myValue|myOtherValue"}] -> return true if (myValue == "myValue" || myValue == "myOtherValue")
					if (toCheckParsed.indexOf(eqArg.trim()) !== -1) {
						eqPassed = true;
					}
				}
				if (!eqPassed) passed = false;
			}

			// if the condition is false and there is no else, then return
			if (!passed && !this.action.else) return this.action.continue ? 0 : -1;
			const selec = passed ? this.action.then : this.action.else;
			if (typeof selec == "string") {
				selector = selec;
			} else {
				selectors = selec;
			}
		}

		if (value && typeof value == "string" && selectors) {
			// if the action value & an array of selector is set, means we have multiple selector to choose based on the value
			for (const [selecName, selec] of Object.entries(selectors)) {
				// the key is the name of the selector, we need to see if the value contains the key
				if (value.indexOf(selecName) !== -1) {
					selector = selec;
				}
			}

			if (!selector) {
				// if we didn't find a selector, we use the default one
				selector = selectors.default;
			}
		}

		return stringParse(selector ?? "", args);
	}

	private async doValidation(
		selector: string | undefined,
		page: puppeteer.Page
	): Promise<number> {
		try {
			// if no selector & a certain action, then return;
			// this little action array is the actions which need to have a valid selector
			if (
				!selector &&
				["click", "input", "upload"].indexOf(this.action.type) != -1
			)
				throw new Error("No selector");

			if (selector) {
				// check if the selector is valid, if not it'll throw an error
				const element = await page.waitForSelector(selector, {
					timeout: 5000,
				});

				if (this.action.validation) {
					switch (this.action.validation.type) {
						case "iframe": {
							// if we need to validate an iframe, we see all frame and then if we match the src, means we good
							const frames = await page.frames();
							const frame = frames.find((f) =>
								f.url().includes(this.action.validation.value as string)
							);
							if (!frame) {
								if (this.action.validation.continue) return 0; // return 0 means continue to the next action
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
								this.action.validation.value
							);
							if (val != this.action.validation.value) {
								if (this.action.validation.continue) return 0;
								throw new Error("Value not valid");
							}

							break;
						}
					}
				}
			}
		} catch (e) {
			if (!this.action.continue) {
				console.log(e.message + ": " + selector);
				await page.close();
			}

			return this.action.continue ? 0 : -1; // -1 means the script failed for this action, 0 means it failed but we can continue
		}

		return 1; // 1 means the action is valid
	}

	public async run(args: { [key: string]: string }, page: puppeteer.Page) {
		const value = this.getValue(args);
		const selector = await this.getSelector(value, args);
		if (typeof selector != "string") {
			// if selector is a number means we didn't find it, so we return it as it is the continue or return
			console.log("No selector for action");
			return selector;
		}

		console.log("Running action", this.action.type, selector ?? value);

		const valid = await this.doValidation(selector, page);
		if (valid != 1) return valid;

		// do the action
		switch (this.action.type) {
			case "click": {
				await page.click(selector);
				break;
			}
			case "input": {
				await page.click(selector);
				await page.keyboard.type(value.toString(), { delay: 100 });
				break;
			}
			case "wait":
				await page.waitForTimeout(value as number);
				break;
			case "human":
				await Browser.humanAction(
					this.script.getSiteName(),
					this.script.getScriptName(),
					this.action.text
				);
				break;
			case "upload": {
				const endpoint = value.toString();
				const imgPath = path.resolve(__dirname, "../public" + endpoint);

				// if we don't have the image in our files, download it from the api
				if (!fs.existsSync(imgPath)) {
					console.log("doesnt exists, downloading");
					// remove the file name from the path
					const dirPath = imgPath.replace(path.basename(imgPath), "");
					fs.mkdirSync(dirPath, { recursive: true });

					try {
						const res = await axios({
							method: "GET",
							responseType: "stream",
							url: `${process.env.APP_URL}${endpoint}`,
						});
						console.log("creating file stream");
						const file = fs.createWriteStream(imgPath);
						res.data.pipe(file);

						// create a new promise to wait untill the file is downloaded
						const p = new Promise<void>((resolve) =>
							file.on("finish", () => {
								file.close();
								console.log("File downloaded");
								resolve();
							})
						);
						await p;
					} catch (e) {
						// Means the request failed, so we just continue to the next action
						console.log("Failed to download image");
						return 0;
					}
				}

				const elem = await page.$(selector);
				await elem.uploadFile(imgPath);

				break;
			}
			case "return": {
				// TODO: implement
				break;
			}
			case "for": {
				let i = value as number;
				if (!i) {
					const element = await page.$(selector);
					i = (await (
						await element.getProperty("childElementCount")
					).jsonValue()) as number;
				}

				for (let j = 0; j < i; j++) {
					const newAction = new Action(this.script, this.action.for[j]);
					await newAction.run(args, page);
				}

				break;
			}
			default:
				await page.close();
				throw new Error("Unknown action type: " + this.action.type);
		}
	}
}
