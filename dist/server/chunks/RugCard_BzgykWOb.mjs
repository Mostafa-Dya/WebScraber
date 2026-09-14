import { F as maybeRenderHead, H as unescapeHTML, I as renderHead, L as addAttribute, O as renderComponent, P as renderTemplate, W as createAstro, j as renderSlot, k as Fragment } from "./runtime_skv-YCY6.mjs";
import { t as createComponent } from "./compiler_CXPqD_v7.mjs";
import { t as renderScript } from "./motion-spec_YyXGDjbF.mjs";
import { X as SUPPORTED_CURRENCIES, Z as money, t as baseCurrency } from "./runtime_r-OJmEZZ.mjs";
import { a as STUDIO_NAME, n as STUDIO_EMAIL, t as prepaint_default } from "./prepaint_Cst9YLzz.mjs";
import { c as ratingText, o as jsonForScript } from "./view_DFjKAQIO.mjs";
import { t as dims } from "./units_BFAJ7W-k.mjs";
//#region src/components/Footer.astro
createAstro("https://astro.build");
var $$Footer = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Footer;
	const { minimal = false } = Astro.props;
	const year = (/* @__PURE__ */ new Date()).getFullYear();
	return renderTemplate`${maybeRenderHead($$result)}<footer data-astro-cid-jo6i4kqk> ${!minimal && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate` <a${addAttribute("https://www.serioludere.com", "href")} target="_blank" rel="noopener" data-astro-cid-jo6i4kqk> ${"serioludere.com"} </a> <a${addAttribute("https://www.instagram.com/serioluderestudio", "href")} target="_blank" rel="noopener" data-astro-cid-jo6i4kqk> ${"@serioluderestudio"} </a> <a${addAttribute(`https://wa.me/525535760978`, "href")} target="_blank" rel="noopener" data-astro-cid-jo6i4kqk> ${"+52 55 3576 0978"} </a> ` })}`} <a${addAttribute(`mailto:${STUDIO_EMAIL}`, "href")} data-astro-cid-jo6i4kqk>${STUDIO_EMAIL}</a> <span data-astro-cid-jo6i4kqk>&copy; <span id="yr" data-astro-cid-jo6i4kqk>${year}</span> ${STUDIO_NAME}</span> <span class="fx-note" data-astro-cid-jo6i4kqk>Prices are indicative and convert at an approximate rate.</span> </footer>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Footer.astro", void 0);
//#endregion
//#region src/components/Controls.astro
createAstro("https://astro.build");
var $$Controls = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Controls;
	const { rates } = Astro.props;
	const fromSheet = Object.keys(rates.rates).filter((c) => c in rates.symbols);
	const currencies = fromSheet.length ? ["USD", ...fromSheet.filter((c) => c !== "USD")] : [...SUPPORTED_CURRENCIES];
	return renderTemplate`${maybeRenderHead($$result)}<div class="controls"> <div class="toggle" id="unitTog" role="group" aria-label="Units"> <button type="button" data-u="cm" class="on" aria-pressed="true">cm</button> <button type="button" data-u="ft" aria-pressed="false">ft</button> </div> <select class="cur" id="cur" aria-label="Currency"> ${currencies.map((c) => renderTemplate`<option>${c}</option>`)} </select> </div> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/Controls.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Controls.astro", void 0);
//#endregion
//#region src/components/Wordmark.astro
var $$Wordmark = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${maybeRenderHead($$result)}<svg class="wordmark" role="img" aria-label="Serio Ludere" viewBox="0 0 14371 1528" xmlns="http://www.w3.org/2000/svg"><g><path d="M2832.82 974.64V1473.61C2823.93 1483.69 2813.33 1489.01 2800.14 1491.17C2774.62 1495.2 2645.01 1494.91 2628.24 1484.84C2620.06 1479.94 2612.61 1468.72 2610.89 1459.08L2617.34 46.1853C2624.37 34.9627 2645.01 34.9627 2657.05 33.9556C2821.64 20.287 3176.91 18.7043 3336.05 43.4516C3673.97 95.6799 3829.38 441.71 3677.41 740.548C3631.96 830.041 3584.08 849.752 3510.96 904.139C3481.71 925.864 3525.01 937.95 3542.5 956.511C3613.75 1032.19 3686.87 1259.95 3747.95 1289.02C3770.6 1299.81 3801.57 1291.89 3813.9 1309.02C3836.41 1453.18 3837.7 1536.06 3667.09 1484.84C3432.54 1414.34 3482 974.64 3180.21 974.64H2832.68H2832.82ZM2832.82 773.496H3295.04C3298.2 773.496 3347.66 758.389 3355.83 755.367C3597.98 667.889 3546.08 234.955 3266.37 234.955H2832.82V773.352V773.496Z" fill="#000000"></path><path d="M12118.8 1473.61C12116.8 1480.66 12101.9 1489.73 12093.6 1491.31C12072.7 1495.34 11950.1 1495.34 11929.1 1491.31C11909.8 1487.57 11900.6 1469.73 11897.2 1451.6L11896.5 87.6226L11918.2 37.6964C12118.7 39.8546 12331 22.5891 12531.1 33.8117C12725.4 44.7465 12915.5 121.722 12985.9 317.542C13062.6 530.915 13006.7 805.581 12789.6 909.318L12785.2 924.138C12905.3 966.007 12946.9 1241.97 13030.9 1284.7C13052.4 1295.63 13095.7 1295.06 13104 1311.89C13107.5 1442.97 13145.5 1527.28 12976.9 1489.58C12713.8 1430.88 12777.9 974.496 12466.3 974.496H12129.6L12118.8 985.287V1473.47V1473.61ZM12118.8 773.496H12581C12586.5 773.496 12627.3 760.835 12636.8 757.525C12890.9 669.615 12836.8 234.955 12552.4 234.955H12129.6L12118.8 245.746V773.352V773.496Z" fill="#000000"></path><path d="M9157.68 35.6821C9487.71 47.1925 9863.34 -29.4953 10143.8 186.18C10502.9 462.429 10493.4 1104.71 10115 1360.96C9835.24 1550.44 9489.44 1477.07 9170.3 1491.6C9138.76 1490.74 9122.12 1469.15 9123.56 1437.93V87.6226C9122.7 63.0192 9132.16 41.4373 9157.68 35.6821ZM9345.92 1290.45C9574.17 1283.4 9829.22 1330.17 10016 1168.59C10247.7 968.309 10241.1 533.793 10000.3 344.016C9814.17 197.259 9567.14 242.437 9345.92 235.099V1290.45Z" fill="#000000"></path><path d="M5131.46 0.287759C5701.78 -13.093 5950.95 514.369 5818.62 1019.24C5718.12 1403.11 5375.33 1577.64 4994.97 1511.17C4234.83 1377.93 4246.58 21.0064 5131.46 0.287759ZM5150.81 203.302C4525.01 203.302 4516.12 1241.39 5073.96 1317.22C5790.38 1414.62 5824.79 203.302 5150.81 203.302Z" fill="#000000"></path><path d="M2363.58 1290.45C2367.59 1291.17 2379.49 1298.51 2382.07 1302.54C2392.25 1318.94 2405.73 1491.6 2356.27 1491.31H1360.43C1324.3 1492.61 1316.41 1461.96 1313.54 1430.88V94.8166C1316.84 58.7028 1326.16 30.9341 1367.31 33.8117L2356.27 34.2433C2376.62 39.423 2386.52 53.0915 2389.1 73.2347C2392.68 100.86 2397.99 235.099 2363.58 235.099H1543.22V644.292H2234.69C2236.27 644.292 2254.33 662.277 2256.05 666.018C2265.51 686.881 2267.38 823.854 2234.69 823.854H1543.22V1290.45H2363.58Z" fill="#000000"></path><path d="M13516.1 235.099V644.292H14207.6C14257 644.292 14247.4 823.71 14214.7 823.71H13516.1V1290.31H14343.6C14376.6 1290.31 14371.7 1419.8 14368.9 1444.84C14365.7 1471.46 14356.8 1486.56 14328.9 1490.88L13340.3 1491.45C13308.5 1490.59 13292.2 1468.72 13293.6 1437.79V87.6226C13292.9 66.0407 13300.6 44.3149 13322.1 37.2648L14334.9 35.6821C14359 41.725 14366 57.4079 14368.9 80.7164C14371.7 105.608 14376.6 235.243 14343.6 235.243H13516.1V235.099Z" fill="#000000"></path><path d="M10829.2 235.099V644.292H11520.7C11559 644.292 11549.2 787.74 11536.7 814.646C11534.7 816.804 11522.3 823.71 11520.7 823.71H10829.2V1290.31H11649.6C11691.6 1290.31 11685.3 1415.77 11682 1444.84C11678.8 1471.46 11669.9 1486.56 11642 1490.88L10628.8 1487.57C10613.6 1477.5 10604.7 1464.26 10606.7 1445.13V80.2848C10604.7 61.1488 10613.6 47.9119 10628.8 37.8403L11642 34.5311C11669.9 38.9913 11678.8 53.9548 11682 80.5725C11685.4 109.636 11691.6 235.099 11649.6 235.099H10829.2Z" fill="#000000"></path><path d="M1062.51 334.951C1044.01 347.613 992.542 306.463 974.908 298.406C797.131 217.977 330.752 112.514 237.992 352.361C142.079 600.121 551.11 625.588 703.654 663.572C918.564 717.095 1136.2 802.272 1156.56 1056.79C1198.99 1587.71 471.827 1579.51 128.028 1448.43C91.0393 1434.33 24.3728 1416.35 17.4911 1372.47C13.4768 1346.71 13.7636 1210.17 22.3657 1191.61C25.2331 1185.42 29.3908 1177.94 36.1291 1176.07C47.5986 1172.76 163.441 1239.95 189.104 1250.74C364.444 1324.55 666.808 1360.81 835.984 1260.24C977.632 1176.07 968.743 1004.13 824.371 930.181C572.902 801.265 41.7205 866.011 2.72416 468.328C-46.7381 -36.2576 586.522 -56.6885 926.736 59.5661C952.829 68.4866 1044.59 103.162 1059.35 120.571C1076.56 140.858 1074.41 326.894 1062.51 335.095V334.951Z" fill="#000000"></path><path d="M7674.39 35.6821C7692.74 30.3586 7807.87 31.078 7830.09 34.675C7850.02 37.8403 7863.78 47.9119 7868.37 68.055C7884.57 345.455 7852.02 638.393 7869.66 913.922C7882.99 1123.41 7968.44 1322.4 8202.85 1341.1C8540.77 1367.86 8648.29 1179.09 8665.21 870.471C8679.69 604.869 8653.31 327.614 8666.79 60.861C8668.65 54.5303 8677.25 44.3149 8682.7 41.0057C8698.33 31.6535 8825.07 30.2147 8847.72 34.3872C8860.91 36.8331 8869.08 45.6098 8876.39 55.9691L8880.55 935.648C8858.9 1317.94 8654.89 1527.14 8267.5 1528.14C7429.37 1530.59 7692.17 621.991 7647.43 73.3785C7646.72 58.5589 7660.62 39.7107 7674.39 35.826V35.6821Z" fill="#000000"></path><path d="M6816.76 1290.46H7565.57C7570.3 1290.46 7588.65 1313.48 7590.52 1322.97C7594.67 1344.84 7593.24 1458.36 7583.92 1474.05C7579.05 1482.1 7567.86 1489.73 7558.26 1491.31L6622.92 1488.29C6598.26 1480.09 6596.4 1453.61 6594.39 1430.74L6595.39 81.4358C6599.27 54.6742 6605.86 39.1352 6634.53 34.5311C6659.05 30.6463 6761.27 29.7831 6784.35 34.2433C6793.67 35.9699 6816.76 54.5303 6816.76 59.2783V1290.46Z" fill="#000000"></path><path d="M4034.54 35.6821C4052.03 30.6463 4176.91 31.2218 4196.26 35.6821C4215.76 40.1424 4227.09 54.3864 4229.52 74.0979L4230.24 1438.08C4230.96 1466.85 4219.34 1486.56 4190.1 1491.17C4165.15 1495.05 4063.93 1495.91 4040.28 1491.45C4025.08 1488.58 4010.89 1474.48 4008.02 1459.08L4007.44 73.2347C4006.73 58.4151 4020.63 39.5669 4034.4 35.6821H4034.54Z" fill="#000000"></path></g></svg>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Wordmark.astro", void 0);
//#endregion
//#region src/components/Header.astro
createAstro("https://astro.build");
var $$Header = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Header;
	const { eyebrow = "Catalogue", rates } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<header data-astro-cid-nen7h5rs> <div class="masthead" data-astro-cid-nen7h5rs> <a href="/" class="home" aria-label="Serio Ludere catalogue" data-astro-cid-nen7h5rs>${renderComponent($$result, "Wordmark", $$Wordmark, { "data-astro-cid-nen7h5rs": true })}</a> <p class="eyebrow" data-astro-cid-nen7h5rs>${eyebrow}</p> </div> ${renderComponent($$result, "Controls", $$Controls, {
		"rates": rates,
		"data-astro-cid-nen7h5rs": true
	})} </header>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Header.astro", void 0);
//#endregion
//#region src/components/Layout.astro
createAstro("https://astro.build");
var $$Layout = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Layout;
	const { title, rates, customer } = Astro.props;
	return renderTemplate`<html lang="en" data-mode="preview"${addAttribute(customer, "data-customer")}> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex, nofollow"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet"><link rel="expect" href="#sl-ready" blocking="render"><script type="application/json" id="sl-rates">${unescapeHTML(jsonForScript(rates))}<\/script>${renderHead($$result)}</head> <body> <div id="progress" aria-hidden="true"></div> ${renderSlot($$result, $$slots["default"])} <script>${unescapeHTML(prepaint_default)}<\/script><span id="sl-ready" hidden></span> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/Layout.astro?astro&type=script&index=0&lang.ts")}</body> </html>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/Layout.astro", void 0);
//#endregion
//#region src/components/RugPhoto.astro
createAstro("https://astro.build");
var $$RugPhoto = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RugPhoto;
	const { src, alt, rot, ar = "3-4", widthCm, lengthCm, eager = false, priority = false, hero = false, full } = Astro.props;
	const dimText = dims(widthCm, lengthCm, "cm");
	const rotClass = rot === "force" ? "rot" : void 0;
	return renderTemplate`${src && !hero && renderTemplate`${maybeRenderHead($$result)}<img${addAttribute(src, "src")}${addAttribute(alt, "alt")}${addAttribute(rotClass, "class")}${addAttribute(eager ? "eager" : "lazy", "loading")}${addAttribute(priority ? "high" : void 0, "fetchpriority")} decoding="async"${addAttribute(rot, "data-rot")} data-rug-img data-plate-img>`} ${src && hero && renderTemplate`<img${addAttribute(["hero-base", rotClass], "class:list")}${addAttribute(src, "src")}${addAttribute(alt, "alt")} loading="eager" fetchpriority="high" decoding="async"${addAttribute(rot, "data-rot")} data-rug-img data-plate-img>`} ${src && hero && full && renderTemplate`<img${addAttribute(["hero-full", rotClass], "class:list")}${addAttribute(full, "src")}${addAttribute(`${src} 800w, ${full} 1600w`, "srcset")} sizes="(min-width: 900px) 55vw, 100vw" alt="" loading="eager" fetchpriority="low" decoding="async"${addAttribute(rot, "data-rot")} data-rug-img>`} <div class="ph-art" aria-hidden="true"${addAttribute(ar, "data-ar")}> <span class="ph-rug"></span> <span class="ph-dims" data-dims${addAttribute(widthCm ?? "", "data-w")}${addAttribute(lengthCm ?? "", "data-l")}${addAttribute(!dimText, "hidden")}>${dimText}</span> </div> <div class="ph">photo to come</div> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/RugPhoto.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/RugPhoto.astro", void 0);
//#endregion
//#region src/components/VoteButtons.astro
createAstro("https://astro.build");
var $$VoteButtons = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$VoteButtons;
	const { rugId, mode = "card" } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<div${addAttribute(["like", { "like-detail": mode === "detail" }], "class:list")}> ${mode === "detail" && renderTemplate`<button type="button" aria-pressed="false" data-vote="dislike"${addAttribute(mode, "data-source")}${addAttribute(rugId, "data-rug")}> <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"> <path d="M10 15v4a2 2 0 0 0 2 2l2.7-6.1c.2-.4.3-.8.3-1.2V6.4A2.4 2.4 0 0 0 12.6 4H6.2c-1.2 0-2.2.8-2.4 2l-1.1 6.4A2.4 2.4 0 0 0 5.1 15H10zm7-11h2.4c.9 0 1.6.7 1.6 1.6v6.8c0 .9-.7 1.6-1.6 1.6H17"></path> </svg> <span class="sr-only">Not for me</span> </button>`} <button type="button" aria-pressed="false" data-vote="like"${addAttribute(mode, "data-source")}${addAttribute(rugId, "data-rug")}> <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 4.2 2.3C11.8 6.1 13.2 5 15.2 5c3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z"></path></svg> <span class="sr-only">Like this rug</span> </button> </div> ${renderScript($$result, "C:/Users/MD/Desktop/WebScraber/src/components/VoteButtons.astro?astro&type=script&index=0&lang.ts")}`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/VoteButtons.astro", void 0);
//#endregion
//#region src/components/RugCard.astro
createAstro("https://astro.build");
var $$RugCard = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RugCard;
	const { card, rates, hidden = false, eager = false, priority = false, related = false, href: hrefProp } = Astro.props;
	const dimText = dims(card.widthCm, card.lengthCm, "cm");
	const priceText = money(card.priceUsd, baseCurrency, rates, "en-US");
	const rating = ratingText(card.likes, card.dislikes, card.rating);
	const hasMeta = Boolean(dimText || card.material || card.age || card.origin);
	const href = hrefProp ?? `/rugs/${card.slug}`;
	return renderTemplate`${maybeRenderHead($$result)}<div${addAttribute(["card", { lead: card.lead === true }], "class:list")}${addAttribute(related ? void 0 : "", "data-card")}${addAttribute(card.collectionSlug, "data-collection")}${addAttribute(card.collectionSlugs.join(" "), "data-collections")}${addAttribute(card.slug, "data-slug")}${addAttribute(hidden, "hidden")} data-astro-cid-4ej4vgoa> <div class="photo" data-plate${addAttribute(card.photoUrl ? void 0 : "", "data-empty")}${addAttribute(card.altPhotoUrl, "data-alt")} data-astro-cid-4ej4vgoa> ${renderComponent($$result, "RugPhoto", $$RugPhoto, {
		"src": card.photoUrl,
		"alt": card.name,
		"rot": card.rot,
		"ar": card.ar,
		"widthCm": card.widthCm,
		"lengthCm": card.lengthCm,
		"eager": eager,
		"priority": priority,
		"data-astro-cid-4ej4vgoa": true
	})} <a class="photo-link"${addAttribute(href, "href")} tabindex="-1" aria-hidden="true" data-astro-cid-4ej4vgoa></a> ${renderComponent($$result, "VoteButtons", $$VoteButtons, {
		"rugId": card.id,
		"name": card.name,
		"data-astro-cid-4ej4vgoa": true
	})} </div> <div class="nm" data-astro-cid-4ej4vgoa><a class="nm-link"${addAttribute(href, "href")} data-astro-cid-4ej4vgoa>${card.name}</a></div> ${hasMeta && renderTemplate`<ul class="meta" data-astro-cid-4ej4vgoa> <li data-dims${addAttribute(card.widthCm ?? "", "data-w")}${addAttribute(card.lengthCm ?? "", "data-l")}${addAttribute(!dimText, "hidden")} data-astro-cid-4ej4vgoa> ${dimText} </li> ${card.material && renderTemplate`<li data-astro-cid-4ej4vgoa>${card.material}</li>`} ${card.age && renderTemplate`<li data-astro-cid-4ej4vgoa>${card.age}</li>`} ${card.origin && renderTemplate`<li data-astro-cid-4ej4vgoa>${card.origin}</li>`} </ul>`} <div class="price-row" data-astro-cid-4ej4vgoa> <div class="price" data-price${addAttribute(card.priceUsd ?? "", "data-usd")}${addAttribute(!priceText, "hidden")} data-astro-cid-4ej4vgoa>${priceText}</div> <div class="rating"${addAttribute(card.id, "data-rating-for")}${addAttribute(!rating, "hidden")} data-astro-cid-4ej4vgoa>${rating}</div> </div> </div>`;
}, "C:/Users/MD/Desktop/WebScraber/src/components/RugCard.astro", void 0);
//#endregion
export { $$Header as a, $$Layout as i, $$VoteButtons as n, $$Footer as o, $$RugPhoto as r, $$RugCard as t };
