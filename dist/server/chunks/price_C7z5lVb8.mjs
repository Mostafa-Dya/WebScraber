function validStep(step) {
	return step !== void 0 && Number.isInteger(step) && step > 0 ? step : 5;
}
/**
* Rounds a positive price UP to the next multiple of `step` whole currency units (step 5:
* 1332 → 1335, 1335 → 1335, 1332.4 → 1335, 12.5 → 15; step 50: 1126 → 1150). Returns undefined for
* missing, non-finite or non-positive input. A non-positive or non-integer step falls back to 5.
*/
function roundUpToStep(price, step = 5) {
	if (price === void 0 || price === null || !Number.isFinite(price) || price <= 0) return void 0;
	const s = validStep(step);
	const cents = Math.round(price * 100);
	return Math.ceil(cents / (s * 100)) * s;
}
/**
* The flat amount Karavan's rule adds, chosen by the band the base price falls in.
*
* The owner's wording is "if X<500 then add 100 USD, if X=500 to 1000 then add 150 USD, if X>1000
* then add 200 USD", and confirmed X to be the base USD price — the figure scraped from the page,
* not the multiplied one. The boundaries are therefore inclusive at both ends of the middle band:
* 500 and 1000 both add 150.
*/
function karavanBand(basePriceUsd) {
	if (basePriceUsd < 500) return 100;
	if (basePriceUsd <= 1e3) return 150;
	return 200;
}
/** karavanrug.com: base × 0.7 × 2, then the band amount for the base price. */
function karavanRetail(basePriceUsd) {
	return basePriceUsd * .7 * 2 + karavanBand(basePriceUsd);
}
/** ecarpetgallery.com: the USD price × 1.5, then a flat 150. */
function ecarpetgalleryRetail(priceUsd) {
	return priceUsd * 1.5 + 150;
}
/** Suppliers that carry an owner-supplied formula; anything else falls back to the Settings markup. */
var SUPPLIER_FORMULAS = {
	karavanrug: karavanRetail,
	ecarpetgallery: ecarpetgalleryRetail
};
/** A human-readable name for the rule applied, shown next to the suggested price in the admin form. */
function pricingRuleName(supplier) {
	if (supplier === "karavanrug") return "karavanrug: base × 0.7 × 2 + band";
	if (supplier === "ecarpetgallery") return "ecarpetgallery: USD × 1.5 + 150";
}
/**
* The retail suggestion for a scraped supplier price, rounded up to `step`.
*
* A supplier with an owner-supplied formula uses it and ignores `markup` entirely: the formula IS
* the rule for that supplier, and silently letting a stale Settings row override it would be a
* surprise the owner cannot see. Everything else (owned stock, "other") keeps the plain multiplier,
* which is what the Settings markup is still for.
*/
function supplierRetail(supplier, priceUsd, markup, step = 5) {
	if (priceUsd === void 0 || !Number.isFinite(priceUsd) || priceUsd <= 0) return void 0;
	const formula = SUPPLIER_FORMULAS[supplier];
	if (formula) return roundUpToStep(formula(priceUsd), step);
	if (markup === void 0 || !Number.isFinite(markup) || markup <= 0) return void 0;
	return roundUpToStep(priceUsd * markup, step);
}
//#endregion
export { roundUpToStep as n, supplierRetail as r, pricingRuleName as t };
