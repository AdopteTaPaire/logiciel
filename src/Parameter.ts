import * as path from "path";
import * as fs from "fs";

export default class Parameter {
	private static initied = false;
	private static parameters: {
		[key: string]: string;
	} = {};
	private static defaultParams: { [key: string]: string } = {
		chrome_path:
			"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
	};

	static init() {
		if (Parameter.initied) return;

		try {
			const paramsPath = path.resolve(__dirname, "../parameters.json");
			if (fs.existsSync(paramsPath)) {
				const parametersJson = fs.readFileSync(
					path.resolve(__dirname, "../parameters.json")
				);
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
				path.resolve(__dirname, "../parameters.json"),
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
