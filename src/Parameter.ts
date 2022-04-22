import * as path from "path";
import * as fs from "fs";

export default class Parameter {
	private static initied = false;
	private static parameters: {
		[key: string]: string;
	} = {};

	static init() {
		if (Parameter.initied) return;

		try {
			const parametersJson = fs.readFileSync(
				path.resolve(__dirname, "../parameters.json")
			);
			const parameters = JSON.parse(parametersJson.toString());
			Parameter.parameters = parameters;
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
		return Parameter.parameters[key];
	}

	static getAll() {
		return Parameter.parameters;
	}

	static set(key: string, value: string) {
		Parameter.parameters[key] = value;
		Parameter.save();
	}
}
