export default function delay(timeout: number) {
	return new Promise((resolve) => setTimeout(resolve, timeout));
}
