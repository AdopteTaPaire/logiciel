export function parse(str: string, args: any) {
	return str.replace(/\{{([^}]+)\}/g, (_, key) => args[key]);
}
