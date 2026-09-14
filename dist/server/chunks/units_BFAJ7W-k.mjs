//#region src/lib/units.ts
function ftIn(cm) {
	const total = cm / 2.54;
	let f = Math.floor(total / 12);
	let i = Math.round(total - f * 12);
	if (i === 12) {
		f++;
		i = 0;
	}
	return f + "'" + (i ? " " + i + "\"" : "");
}
/**
* Dimension line exactly as the reference renders it (lines 175-179); empty when a side is unknown.
* `sep` defaults to the reference's cross so the public catalogue is unchanged.
*/
function dims(widthCm, lengthCm, unit, sep = "×") {
	if (!widthCm || !lengthCm) return "";
	return unit === "cm" ? `${widthCm} ${sep} ${lengthCm} cm` : `${ftIn(widthCm)} ${sep} ${ftIn(lengthCm)}`;
}
//#endregion
export { dims as t };
