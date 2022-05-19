import * as path from "path";
import * as fs from "fs";
import Main from "./Main";

export default class Parameter {
	private static paramsPath: string;
	private static initied = false;
	private static parameters: {
		[key: string]: string;
	} = {};
	private static defaultParams: { [key: string]: string } = {
		chrome_path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	};

	static init() {
		if (Parameter.initied) return;

		Parameter.paramsPath = path.resolve(
			Main.getRessourcesPath(),
			"parameters.json"
		);

		try {
			if (fs.existsSync(Parameter.paramsPath)) {
				const parametersJson = fs.readFileSync(Parameter.paramsPath);
				const parameters = JSON.parse(parametersJson.toString());
				Parameter.parameters = parameters;
			} else {
				Parameter.parameters = {};
			}

			Parameter.initied = true;
		} catch (e) {
			console.log("Error loading parameters: ", e);
		}
	}

	static save() {
		try {
			fs.writeFileSync(
				Parameter.paramsPath,
				JSON.stringify(Parameter.parameters)
			);
		} catch (e) {
			console.log("Error saving parameters: ", e);
		}
	}

	static get(key: string) {
		if (!this.initied) Parameter.init();
		return Parameter.parameters[key] ?? Parameter.defaultParams[key] ?? "";
	}

	static getAll() {
		if (!this.initied) Parameter.init();
		return Parameter.parameters;
	}

	static set(key: string, value: string) {
		Parameter.parameters[key] = value;
		Parameter.save();
	}
}
