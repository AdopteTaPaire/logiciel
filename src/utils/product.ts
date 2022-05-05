export function compute(
	product: {
		[key: string]: string | number | Date | { [key: string]: string | number };
	},
	productTag = true
) {
	const computed: { [key: string]: string } = {};
	for (const pKey in product) {
		const pValue = product[pKey];

		if (typeof pValue === "object" && !(pValue instanceof Date)) {
			const computedValue = compute(pValue, false);
			for (const cKey in computedValue) {
				computed[`${productTag ? "product." : ""}${pKey}.${cKey}`] =
					computedValue[cKey];
			}
		} else {
			computed[`${productTag ? "product." : ""}${pKey}`] = pValue.toString();
		}
	}
	return computed;
}
