export function parse(str: string, args: { [key: string]: string }): string {
	return str.replace(/\{{([^}]+)\}}/g, (_, key) => {
		if (key.indexOf("|") != -1) {
			// {{ product.infos.num | product.infos.name }} // mean if num isn't defined the name will be returned
			for (const keyArg of key.split("|")) {
				const value = args[keyArg.trim()];
				if (value) {
					return value;
				}
			}
		}

		return args[key.trim()] ?? "N/A";
	});
}
