# Images: Astro 7 remote images, per-host image services, Google Drive direct-view URLs

Research date 2026-09-05. Consolidated from the research report, the fact-check pass and the breakage-hunt pass. Refuted claims are replaced by their corrections; verifier disagreements are flagged in Recommendation.

## Versions

| package             | version                                                                               | registry URL                                          |
| ------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| astro               | 7.3.1 (engines node >=22.12.0; optional sharp ^0.35.4; deps vite ^8.0.13, zod ^4.5.4) | https://registry.npmjs.org/astro/latest               |
| sharp               | 0.35.4 (2026-08-26; engines node >=20.9.0; sharp-libvips 1.3.3 with heif 1.23.2)      | https://registry.npmjs.org/sharp/latest               |
| @astrojs/cloudflare | 14.3.0 (peers astro ^7.2.0, wrangler ^4.125.0)                                        | https://registry.npmjs.org/@astrojs/cloudflare/latest |
| @astrojs/netlify    | 8.2.5 (peer astro ^7.0.0; security floor 8.2.4)                                       | https://registry.npmjs.org/@astrojs/netlify/latest    |
| @astrojs/vercel     | 11.0.10 (peer astro ^7.0.0)                                                           | https://registry.npmjs.org/@astrojs/vercel/latest     |
| @astrojs/node       | 11.1.5 (peer astro ^7.2.1)                                                            | https://registry.npmjs.org/@astrojs/node/latest       |
| vite                | 8.2.2                                                                                 | https://registry.npmjs.org/vite/latest                |
| vitest              | 5.0.0 (2026-09-03; dist-tag V4 = 4.1.11)                                              | https://registry.npmjs.org/vitest/latest              |
| zod                 | 4.5.4                                                                                 | https://registry.npmjs.org/zod/latest                 |
| @imagekit/astro     | 1.0.1 (peer astro >=3.2.0)                                                            | https://registry.npmjs.org/@imagekit/astro/latest     |
| @unpic/astro        | 1.0.2 (peer astro ^2.0.0 / ^3.0.0 / ^4.0.0 / ^5.0.0-beta only; no Astro 6/7)          | https://registry.npmjs.org/@unpic/astro/latest        |
| unpic               | 4.2.2                                                                                 | https://registry.npmjs.org/unpic/latest               |

## Key facts

### Astro `<Image>` / `getImage()` with remote sources

- Remote string `src` requires explicit `width` and `height` unless `inferSize` is set (MissingImageDimension); `alt` is always required (ImageMissingAlt). https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/modules/astro-assets.mdx
- Since Astro 5.17.3 `inferSize` only fetches dimensions for allow-listed hosts; a non-allow-listed `src` with `inferSize` throws RemoteImageNotAllowed at build. This was security fix GHSA-cj9f-h6r6-4cx2 / CVE-2026-27829. https://github.com/advisories/GHSA-cj9f-h6r6-4cx2
- `<Image>` renders a plain `<img>`, forwards unknown props (`data-*`, `id`, `class`) as attributes, defaults `loading="lazy" decoding="async"`; `priority` sets `loading="eager" decoding="sync" fetchpriority="high"`. `naturalWidth`, `complete` and load/error events work normally. https://raw.githubusercontent.com/withastro/astro/main/packages/astro/components/Image.astro
- Responsive props `layout` ('constrained' | 'full-width' | 'fixed' | 'none'), `fit`, `position`, `priority` and config `image.layout`, `image.objectFit` ('cover'), `image.objectPosition` ('center'), `image.breakpoints`, `image.responsiveStyles` (false) are stable since astro@5.10.0 (corrected: `fit` is since 5.10.0, not 5.0.0). `densities` is incompatible with `layout`. https://docs.astro.build/en/reference/experimental-flags/
- `getImage(options: UnresolvedImageTransform): Promise<GetImageResult>` returns `{ src, srcSet: { values, attribute }, attributes, options, rawOptions }`; server-only, throws on the client. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/modules/astro-assets.mdx
- Since Astro 6 the default service crops by default, never upscales, rasterizes SVG when `format` is given, and emits responsive styles as hashed classes + `data-*` instead of inline `style` (CSP compatibility). https://docs.astro.build/en/guides/upgrade-to/v6/
- Astro 7.3.0 added a trailing `logger: AstroRuntimeLogger` argument to every image-service hook; astro@6.0.0 added optional `getRemoteSize()`. Custom services written from Astro 5 docs must accept the extra parameter. https://docs.astro.build/en/reference/image-service-reference/
- Default service is sharp: `image.service = { entrypoint: 'astro/assets/services/sharp', config?: {} }`; service options `limitInputPixels` (4.1.0), `kernel` (5.17.0), `jpeg/webp/avif/png` encoder options (6.1.0). https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/configuration-reference.mdx

### Allow-list, redirects and the `/_image` endpoint

- `image.domains`: `Array<string>`, default `[]`, no wildcards. `image.remotePatterns`: `Array<{ protocol?, hostname?, port?, pathname? }>`; hostname `**.` = all subdomains, `*.` = one level; pathname `/**` = all sub-routes, `/*` = one level. Both since astro@2.10.10. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/configuration-reference.mdx
- (corrected: the option shapes are unchanged since 2.10.10 but matching semantics changed. GHSA-g735-7g2w-hh3f / CVE-2026-33769 "Remote allowlist bypass via unanchored matchPathname wildcard" affected astro >=2.10.10 <5.18.1; pathname wildcards are now anchored, so any relied-upon pathname pattern must be tested against the 5.18.1+ matcher.) https://api.github.com/advisories?ecosystem=npm&affects=astro&per_page=15
- Docs: "HTTP redirects are also followed when an image URL matches a remote pattern. The final destination URL must be among the allowed remote patterns to be loaded." https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/configuration-reference.mdx
- SSR `/_image`: 403 'Forbidden' for a non-allow-listed remote `src`; up to 10 redirects fetched with `redirect: 'manual'`, every hop must pass `isRemoteAllowed`; non-ok upstream or disallowed redirect -> 404 'Not Found'; transform failure -> 500; success sets `Cache-Control: public, max-age=31536000` + ETag. (loadImage lives at `packages/astro/src/assets/endpoint/loadImage.ts`.) https://raw.githubusercontent.com/withastro/astro/main/packages/astro/src/assets/endpoint/generic.ts
- Non-allow-listed remote images are returned untransformed at the original URL, but `<Image>` still emits width/height so there is no CLS. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/images.mdx
- Allow-listing `lh3.googleusercontent.com` makes the public `/_image` endpoint a decoder for any public Drive file: IDs are opaque so pathname patterns cannot scope the allow-list; Vercel's guidance is "consider adding your account id to the pathname if you don't own the hostname". Mitigations: keep sharp patched; custom `image.endpoint` validating the Drive ID against the sheet; or a host whose path you control. (unverified inference from the live URL scheme) https://vercel.com/docs/image-optimization

### Security advisories that set version floors

- CRITICAL GHSA-26w7-cxv4-gfx2 (CVSS 9.8, 2026-08-27): RCE through AVIF optimisation via libheif (CVE-2026-84383, fixed heif 1.23.2) in the default sharp service; fixed in astro 7.2.8, which requires sharp 0.35.4. Enforce astro >=7.2.8 and sharp >=0.35.4 with a package-manager override (sharp is only an optional `^` range). https://api.github.com/repos/withastro/astro/security-advisories/GHSA-26w7-cxv4-gfx2
- astro 7.3.0 shipped a regression that stopped projects using `astro:assets` from starting or building; fixed in 7.3.1 (2026-09-03). Pin >=7.3.1. https://registry.npmjs.org/astro/latest
- GHSA-4233-jc72-56c5 (Moderate, 2026-08-27): Netlify Image CDN allow-list bypass / SSRF in @astrojs/netlify >=5.2.0 <=8.2.3 (an allowed origin anywhere in path or query satisfied the allow-list); earlier GHSA-hp3v-mfqw-h74c (<8.1.2) and GHSA-529g-xq4f-cw38 (<7.0.13) hit the same regex generator. Never deploy the Netlify adapter below 8.2.4; interim workaround was `imageCDN: false`. https://api.github.com/repos/withastro/astro/security-advisories/GHSA-4233-jc72-56c5
- GHSA-376h-93r7-7g6f (astro <=7.2.3, fixed 7.2.4): authorisation bypass when a non-root `base` is set and middleware checks `context.url.pathname` (relevant to protecting `/api/revalidate`). https://api.github.com/repos/withastro/astro/security-advisories/GHSA-376h-93r7-7g6f
- GHSA-f48w-9m4c-m7f5 (<7.0.6): XSS via unescaped spread attribute names — never spread sheet-controlled objects onto `<img>`. GHSA-j687-52p2-xcff (<6.1.6): XSS in `define:vars` — pass sheet data as `data-*` attributes. Also patched in 7.3.1: GHSA-8mv7-9c27-98vc (checkOrigin bypass, 7.0.0-7.0.5), GHSA-7pw4-f3q4-r2p2 (<7.0.4), GHSA-4g3v-8h47-v7g6 (<=7.0.9). https://api.github.com/advisories?ecosystem=npm&affects=astro&per_page=15
- Node self-host behind a proxy: set `security.allowedDomains` (astro@5.14.2) so `X-Forwarded-Host` is validated (Host-header SSRF class GHSA-2pvr-wf23-7pc7 / CVE-2026-54299; @astrojs/node >=9.5.4 reads error pages from disk). https://api.github.com/advisories?cve_id=CVE-2026-54299

### sharp and Node self-host

- sharp 0.35.4 requires Node >=20.9.0 and ships prebuilt linux-x64/arm64 binaries (`@img/sharp-linux-*` optional deps); 0.35.0 removed the install script (no automatic source build; use WASM or build manually), added `limitInputChannels` (default 5), removed `failOnError`, retuned lossy AVIF with SSIMULACRA2. Astro added sharp 0.35 support in 7.0.4. The binding Node floor is astro's >=22.12.0. https://sharp.pixelplumbing.com/changelog/v0.35.0
- Cross-platform install: `npm install --cpu=x64 --os=linux --libc=glibc sharp`; Lambda-style bundles must contain binaries for the target arch. https://sharp.pixelplumbing.com/install/
- Host default Node versions satisfy >=22.12: Netlify Ubuntu 24.04 image default Node 24 (functions runtime matches build), Cloudflare Workers Builds 24.18.0 (22.23.2 preinstalled), Vercel 24.x (22.x fine, 20.x out). Pin with `.nvmrc`. https://docs.netlify.com/build/configure-builds/available-software-at-build-time/

### Cloudflare

- @astrojs/cloudflare 14.3.0 `imageService`: `'passthrough' | 'cloudflare' | 'cloudflare-binding' | 'compile' | 'custom' | { build: 'compile' | 'cloudflare-binding', runtime?: 'cloudflare-binding' | 'passthrough' }`, default `'cloudflare-binding'`; omitted runtime falls back to `'passthrough'` for `build: 'compile'`; the adapter defaults to binding mode when an incompatible global service is configured. wrangler: `{ "images": { "binding": "MY_IMAGES" } }`. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/integrations-guide/cloudflare.mdx
- (corrected: "Drops official support for Cloudflare Pages", dev server in workerd, and default `compile` -> `cloudflare-binding` are CHANGELOG 13.0.0 entries, not 14.0.0; 14.0.0 is the Vite 8 upgrade + opt-in CDN cache provider; 14.2.0 added `build: 'cloudflare-binding'`; 14.3.0 fixed incremental builds with `build.concurrency > 1`.) https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/cloudflare/CHANGELOG.md
- Sharp cannot run in workerd: 14.2.0 logs a dev warning when `imageService: 'custom'` resolves to sharp "since Sharp's native binding cannot run inside workerd in dev or production". Node-incompatible image options use passthrough in `astro dev`, so expect unoptimised images locally unless running against `--remote` bindings. `passthroughImageService()` from 'astro/config' is the documented no-op. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/cloudflare/CHANGELOG.md
- The 14.3.0 binding endpoint enforces the allow-list (403), fetches via `fetchWithRedirects`, re-validates the final URL, sets `Cache-Control: public, max-age=31536000, immutable` and stores in `caches.default` (closes the SSRF class of GHSA-qpr4-c339-7vq8, adapter <12.6.6). https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/cloudflare/src/utils/image-binding-transform.ts
- Cloudflare Images binding: raw bytes from any source incl. a `fetch()` response, max input 20 MB; billed per unique source+params once per calendar month; Free plan (default for all accounts) 5,000 unique transformations/month, then error 9422 with no charge; paid $0.50/1,000 extra, $5/100k stored, $1/100k delivered; `.info()` calls free. `wrangler dev` offline binding supports only width/height/rotate/format. (docs moved to /images/optimization/binding/) https://developers.cloudflare.com/images/optimization/binding/
- URL transformations `https://<ZONE>/cdn-cgi/image/<OPTIONS>/<SOURCE>` need a zone with transformations enabled; sources default to "allowed origins" (`*.b.com` wildcard) or "any origin"; only the initial URL is checked, redirects are followed. https://developers.cloudflare.com/images/transform-images/sources/

### Netlify

- @astrojs/netlify 8.2.5: `imageCDN` boolean, default true; remote hosts come from Astro `image.domains`/`remotePatterns` and the adapter generates Netlify `remote_images` (feature since 5.2.0 — corrected from 6.3.0). Not needed for same-domain images. 8.2.0 stops auto-wiring the Blobs session driver when `session: false`; 8.1.0 added `devFeatures.edgeFunctions`. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/netlify/CHANGELOG.md
- Image CDN: `/.netlify/images?url=&w=&h=&fit=(contain|cover|fill, default contain)&position=(default center)&fm=(avif|jpg|png|webp|gif|blurhash)&q=(1-100, default 75)`; remote sources must be public (Authorization/Cookie not forwarded); no published max source size; standard CDN rate limits apply (429). TOML example is double-quoted with `\\.`: `remote_images = ["https://my-images\\.com/.*"]`. https://docs.netlify.com/build/image-cdn/overview/
- Image CDN responses are `Cache-Control: public,max-age=0,must-revalidate` + ETag (304 on match); the request to honour source Cache-Control was closed as "expected" (2026-01-21). Docs say source cache headers are respected at the edge; `private` handling is undocumented. https://answers.netlify.com/t/netlify-images-cdn-cache-control/114373
- Pricing: no Image CDN line item; bandwidth definition "includes ... Image CDN usage" at 20 credits/GB; web requests 2 credits/10k; production deploys 15 credits each; compute 10 credits/GB-hour. Free = 300 credits/month hard cap and all sites pause at 0; Personal $9 = 1,000, Pro $20 = 3,000 (tiers changed 2026-07-14). https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/

### Vercel

- @astrojs/vercel 11.0.10: `imageService?: boolean` (no default = off), `devImageService` default `'sharp'`, `imagesConfig: { sizes, domains, remotePatterns, minimumCacheTTL, formats, dangerouslyAllowSVG, contentSecurityPolicy }` (Vercel's `localPatterns`, `qualities`, `contentDispositionType`, `RemotePattern.search` are not exposed); production uses `/_vercel/image?url=&w=&q=`; default sizes `[640, 750, 828, 1080, 1200, 1920, 2048, 3840]`; Astro domains/remotePatterns copied through. With `imageService: false`, `/_vercel/image` 404s and Astro's own `/_image` (sharp in the Node function) serves images. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/vercel/src/image/shared.ts
- BUG (still on main 2026-09-05, no fix through 11.0.10): with `imagesConfig` set, `isAcceptedPattern` uses `pattern.protocol !== 'http' || pattern.protocol !== 'https'` (always true) so any protocol-bearing Astro remotePattern is dropped; Astro `**.host` wildcards pass through unconverted although Vercel's RemotePattern hostname/pathname are RegExp strings. Use `image.domains` on Vercel. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/vercel/src/index.ts
- Limits/pricing: Hobby 5K transformations, 300K cache reads, 100K cache writes/month, then new images 402 (no charge, pause lasts 30 days); $0.05-$0.0812 per 1K; source max 8192 px/side, output max 10 MB; only jpeg/png/webp/avif optimised; Hobby is non-commercial only. https://vercel.com/docs/image-optimization/limits-and-pricing
- Remote cache TTL = max(upstream `max-age`, `minimumCacheTTL` default 3600 s); cached renditions survive redeploys and source updates, so a replaced Drive photo under the same id stays stale for at least 24 h (lh3 max-age=86400). https://vercel.com/docs/image-optimization
- Vercel's quickstart still imports `@astrojs/vercel/static` (stale); use `import vercel from '@astrojs/vercel'`. https://vercel.com/docs/image-optimization/quickstart

### Google Drive URLs (live-tested 2026-09-05, reproduced by both verifiers)

- `https://drive.google.com/uc?export=view&id=ID` -> 303 to `drive.usercontent.google.com/download?id=ID&export=view` (`Cache-Control: no-cache, no-store`); 200 image/jpeg for a plain server fetch, 403 text/html when requested like a cross-site `<img>` (Sec-Fetch-Dest: image). Unusable for hotlinking. https://drive.google.com/uc?export=view&id=1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0
- `https://lh3.googleusercontent.com/d/ID` -> direct 200 image/jpeg, no redirect, `Access-Control-Allow-Origin: *`, `Cache-Control: private, max-age=86400, no-transform`, `Vary: Origin`, `Server: fife`; still 200 with cross-site fetch-metadata. Undocumented suffixes: `=w200` -> 200x445, `=w1000-h1000` -> 450x1000 (fit inside box), `=s400` -> 180x400 (longest side), `=w4000`/`=w8000`/`=s2000`/`=s0` -> original 720x1600 (never upscales), `=w1000-rw` -> image/webp, `=w300-h300-c` and `=s300-c` -> exact crop; `Accept: image/webp` does not switch format. https://lh3.googleusercontent.com/d/1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0=w1000
- `https://drive.google.com/thumbnail?id=ID&sz=w1000` -> 302 to `lh3.googleusercontent.com/d/ID=w1000` with `Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site` and no-store; `sz=w2500`/`w4000` accepted. The cross-host hop means Astro needs both hosts allow-listed. https://drive.google.com/thumbnail?id=1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0&sz=w1000
- Nonexistent id: lh3 -> 500 text/html; thumbnail -> 302 -> 500; uc -> 303 -> 404 text/html. Astro's `loadImage` returns undefined on `!res.ok`, `/_image` answers 404, the browser `<img>` fires `error`, so an onerror fallback is reliable. https://lh3.googleusercontent.com/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB=w1000
- Drive API `thumbnailLink` is short-lived (hours), CORS-restricted, needs a credentialed request for non-public files, and is invalidated on content change; Google documents none of the `=w/=s/-c/-rw` suffixes. Store the file id of "Anyone with the link" files and build URLs in one swappable function. https://developers.google.com/workspace/drive/api/guides/file
- Google publishes no hotlink rate limits; community reports throttling at 10+ `/thumbnail` images per page (2024-12) and 403/429 on `uc?export=view` (2025-11). https://github.com/orgs/community/discussions/86986
- Google's 2023-10 blog never names `/uc?export=`; the explicit 403 statement is the Workspace DevRel post (2024-01-11), which recommends an iframe preview or a CDN host. https://dev.to/googleworkspace/embed-images-from-google-drive-in-your-website-11k6

### Hosted alternatives

- Cloudinary Free: 25 credits/month (1 credit = 1,000 transformations or 1 GB storage or 1 GB bandwidth), 3 users, no card; Plus $99/mo. Fetch URL `https://res.cloudinary.com/<cloud_name>/image/fetch/<transformations>/<remote_url>`; cached copies count against storage (7-day ETag recheck); allowed-fetch-domain restriction (else 404); max 5 redirects. https://cloudinary.com/documentation/fetch_remote_images
- ImageKit Free: 20 GB bandwidth/month (delivery stops at the limit), 3 GB storage, 2 external origins; Lite $9/mo + 40 GB, $0.5/GB after. Web-proxy origin `https://ik.imagekit.io/<id>/https://...` (restrict unsigned URLs). @imagekit/astro 1.0.1 routes ImageKit URLs around `/_image`; local assets still use sharp. https://imagekit.io/docs/integration/astro
- GCS Always Free: 5 GB-months regional (us-east1/us-west1/us-central1), 5,000 Class A + 50,000 Class B ops, 100 GB North-America egress/month; stable URLs, no on-the-fly resizing. https://docs.cloud.google.com/free/docs/free-cloud-features
- @unpic/astro 1.0.2 declares peer astro ^2 to ^5.0.0-beta only; not usable on Astro 7 without testing. https://registry.npmjs.org/@unpic/astro/latest

### Client-side script for per-image rotate/fallback

- Processed `<script>` becomes `type="module"` and is included once per page regardless of component instances; use `querySelectorAll` or a custom element (`connectedCallback` per instance, `this.dataset.*`). A `<script>` with any attribute other than `src` is not processed. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/client-side-scripts.mdx
- `define:vars` on `<script>` implies `is:inline`: not bundled, not deduplicated, imports unresolved. https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/directives-reference.mdx
- With `<ClientRouter/>` bundled scripts run once per session; re-init on `astro:page-load`. `security.csp` (stable, astro@6.0.0) is incompatible with `<ClientRouter/>`; inline `onerror=` attributes need `unsafe-hashes` (`kind: 'attribute'`, astro 7.1); external scripts need manual hashes. A capture-phase `error` listener in a bundled module is the CSP-safe fallback. https://docs.astro.build/en/reference/configuration-reference/
- `img.complete` is true for both loaded and broken images (check `naturalWidth > 0`) and may change while the script runs; `error` does not bubble, so delegate with `capture: true`. https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/complete

### Astro 7 platform changes affecting this project

- `output` is `'static' | 'server'` only (no `'hybrid'`); use `export const prerender = false` on on-demand routes. `compressHTML` default is now `'jsx'` (adjacent inline elements lose spaces; set true/false to restore). Rust compiler errors on unclosed tags and no longer auto-corrects invalid HTML; `src/fetch.ts` is reserved; Markdown via Sätteri; @astrojs/db removed. https://docs.astro.build/en/guides/upgrade-to/v7/
- Zod 4 via `astro/zod` (`z` from `astro:content`/`astro:schema` deprecated): `z.string().url()` -> `z.url()`, `.strict()` -> `z.strictObject()`, unified `error` param. https://docs.astro.build/en/guides/upgrade-to/v6/
- Vitest 5.0.0 (2026-09-03) needs Node >=22.12 and Vite >=6.4 and changes defaults (`clearMocks: true`, `test.sequential` removed, reports in `.vitest/`); Astro's monorepo still tests with vitest ^4.1.0, so pin 4.1.11 (dist-tag V4). https://vitest.dev/guide/migration

## Snippets

Allow-list (docs shape; `domains` is the portable form): https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/reference/configuration-reference.mdx

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
export default defineConfig({
  image: {
    domains: ['lh3.googleusercontent.com'], // plain hostnames, no wildcards
    // remotePatterns: [{ protocol: 'https', hostname: '**.googleusercontent.com', pathname: '/d/**' }], // dropped by @astrojs/vercel when imagesConfig is set
  },
});
```

Remote `<Image>` (docs example + documented props): https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/images.mdx

```astro
---
import { Image } from 'astro:assets';
---

<Image src="https://example.com/remote-bird.jpg" alt="A bird." width="50" height="50" />
<Image
  src="https://lh3.googleusercontent.com/d/FILE_ID=w1600"
  alt="Rug"
  inferSize
  layout="constrained"
  fit="cover"
  position="center"
/>
```

Adapter image services (each line verbatim from the respective docs): https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/integrations-guide/cloudflare.mdx , https://docs.astro.build/en/guides/integrations-guide/netlify/ , https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/integrations-guide/vercel.mdx , https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/images.mdx

```js
// Cloudflare — wrangler.jsonc: { "images": { "binding": "MY_IMAGES" } }
adapter: cloudflare({ imageService: { build: 'compile', runtime: 'cloudflare-binding' } }),
// Netlify — Image CDN on by default; remote_images generated from image.domains; disable with netlify({ imageCDN: false })
adapter: netlify(), image: { domains: ['lh3.googleusercontent.com'] },
// Vercel — imagesConfig is optional and triggers the remotePatterns-protocol bug; keep image.domains
adapter: vercel({ imageService: true, devImageService: 'sharp', imagesConfig: { sizes: [320, 640, 1280] } }),
// Runtime without sharp
import { defineConfig, passthroughImageService } from 'astro/config';
export default defineConfig({ image: { service: passthroughImageService() } });
```

Drive URL normaliser, server-side only (output pattern live-verified; id regex is a heuristic, suffix grammar undocumented): https://lh3.googleusercontent.com/d/1DlTneR_41y-MNEuzUuqqaR5H0pXy0Sb0=w1000

```ts
// src/lib/driveImage.ts
const ID_RE = /^[A-Za-z0-9_-]{20,}$/;
export function extractDriveId(input: string): string | null {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  try {
    const u = new URL(s);
    const fromQuery = u.searchParams.get('id'); // uc?id=, thumbnail?id=, open?id=
    if (fromQuery && ID_RE.test(fromQuery)) return fromQuery;
    const m = u.pathname.match(/\/(?:file\/d|d)\/([A-Za-z0-9_-]{20,})/); // /file/d/<id>/view, lh3 /d/<id>
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
export function driveImageUrl(input: string, width = 1600): string | null {
  const id = extractDriveId(input);
  return id ? `https://lh3.googleusercontent.com/d/${id}=w${width}` : null; // 200 image/jpeg, ACAO *, downscale-only
}
```

Per-image script (adapted; every premise confirmed against Astro docs and MDN): https://docs.astro.build/en/guides/client-side-scripts/

```astro
---
import { Image } from 'astro:assets';
const { src, alt, width, height, fallback } = Astro.props;
---

<Image src={src} alt={alt} width={width} height={height} data-rug-img data-fallback={fallback} />
<script>
  function onReady(img: HTMLImageElement) {
    if (img.naturalWidth > img.naturalHeight) img.classList.add('landscape');
  }
  function init() {
    document.querySelectorAll<HTMLImageElement>('img[data-rug-img]').forEach((img) => {
      if (img.complete) {
        if (img.naturalWidth > 0) onReady(img);
        else img.dispatchEvent(new Event('error'));
      } else img.addEventListener('load', () => onReady(img), { once: true });
    });
  }
  document.addEventListener(
    'error',
    (e) => {
      // error does not bubble: capture phase
      const img = e.target as HTMLImageElement;
      if (img?.matches?.('img[data-rug-img]') && img.dataset.fallback && img.src !== img.dataset.fallback)
        img.src = img.dataset.fallback;
    },
    true,
  );
  init();
  document.addEventListener('astro:page-load', init); // only needed with <ClientRouter/>, which is CSP-incompatible
</script>
```

## Recommendation

1. Drive stays the owner's upload location; the sheet stores only the share URL or file id of files shared "Anyone with the link". Normalise server-side to `https://lh3.googleusercontent.com/d/<ID>=w<px>` (direct 200, CORS `*`, no redirect, downscale-only). Never emit `/uc?export=view` (403 for a browser `<img>`) or `/thumbnail` (cross-host 302 needing a second allow-listed host). Keep URL construction in one function because the suffix grammar is undocumented.
2. `image.domains: ['lh3.googleusercontent.com']`, not `remotePatterns`: identical on sharp/Netlify/Vercel, sidesteps the Vercel `isAcceptedPattern` bug, the Netlify regex-generator advisory history and the 5.18.1 pathname-matching change. Render with `<Image>` using width/height from the sheet (or `inferSize`, permitted on the allow-listed host), `layout="constrained"`, lazy defaults, `priority` only for the hero.
3. Version floors: astro >=7.3.1 (AVIF RCE fixed 7.2.8; 7.3.0 assets regression), sharp >=0.35.4 via a package-manager override, @astrojs/netlify >=8.2.4 if Netlify, Node 22.12+ pinned in `.nvmrc`, vitest 4.1.11 until Astro tests against 5.
4. Hosting. Researcher: Netlify with @astrojs/netlify 8.2.5 (Image CDN on by default, no sharp binary in functions, `remote_images` generated). Breakage-hunt correction adopted: do not assume the Free plan (300-credit hard cap, 15 credits per deploy, 20 per GB, 2 per 10k requests, all sites pause at 0) for an image-heavy catalogue; budget Personal ($9, 1,000 credits) or Pro ($20, 3,000), or choose after measuring bandwidth. Fallback: Vercel Pro with `imageService: true` (Hobby is non-commercial and 402s past 5K transformations). Cloudflare 14.3.0 works (binding Free 5,000/month, allow-list enforced) but dev runs in workerd with passthrough images and needs wrangler; Node self-host needs a VPS plus `security.allowedDomains` behind a proxy.
5. Accept that allow-listing lh3 exposes `/_image` as a decoder for any public Drive file; mitigate with patched sharp and, optionally, a custom `image.endpoint` that validates IDs against the sheet.
6. Rotate/fallback logic: one bundled module (`querySelectorAll`, `img.complete` + `naturalWidth`, capture-phase `error`, `astro:page-load` re-init only if `<ClientRouter/>` is used) with a local placeholder in `public/`. No `define:vars`, no inline `onerror=`, no spreading sheet objects onto `<img>`.
7. When a photo is replaced, upload a new Drive file (new id) or add a cache-busting param: Vercel keeps renditions for at least max(86400 s, 3600 s) across redeploys; Netlify always revalidates via ETag.
8. If Drive proves flaky (undocumented throttling, `Cache-Control: private`), move originals to ImageKit Free (20 GB/month, @imagekit/astro 1.0.1 supports Astro 7, Web-proxy origin can bridge existing lh3 URLs; sign URLs). Cloudinary's 25-credit cap and Cloudflare Images' zone requirement make them weaker fits.

Verifier disagreements:

- "`image.domains`/`remotePatterns` unchanged since 2.10.10": fact-check confirmed (option shapes verbatim); breakage-hunt refuted (pathname matching anchored in 5.18.1, CVE-2026-33769). Both hold at different levels; moot when only `image.domains` is used.
- Cloudflare CHANGELOG attribution: fact-check places "drops Pages / workerd dev / default cloudflare-binding" under 13.0.0 with PR numbers; breakage-hunt's additional finding restates them under 14.0.0 (medium confidence, "not verbatim source"). This brief follows the fact-check reading; the behaviour is present in 14.3.0 either way.
- Netlify hosting: fact-check judged the researcher's recommendation consistent with the evidence; breakage-hunt refuted the Free-plan assumption on credit-cap grounds. This brief adopts the breakage-hunt correction.

## Open questions

- Upper size cap of lh3 `=wN`/`=sN` (test source only 720 px; up to `=w8000` returned the original unchanged).
- Google rate/abuse limits for lh3 hotlinking (community reports only; no documentation).
- Behaviour of a private, non-shared Drive file on lh3 (only a nonexistent id was tested: 500 text/html).
- Whether Netlify/Vercel edges honour lh3's `Cache-Control: private, max-age=86400` (`private` handling undocumented on both).
- Whether Netlify Image CDN / Vercel Image Optimization follow cross-host redirects (only relevant if `/thumbnail` URLs are used).
- End-to-end behaviour of Astro `**.host` remotePatterns on Vercel (adapter passes them through unconverted).
- Whether sharp runs inside Vercel Node functions when `imageService: false` (no official statement; Node 24 default satisfies the floor).
- Netlify Free plan commercial-use terms; GCS paid per-GB pricing (page truncated during research).

## Verification notes

- Fact-check: 51 claims — 49 confirmed, 2 refuted, 0 unverifiable; 17 additional findings merged.
- Breakage-hunt: 20 claims — 18 confirmed, 2 refuted, 0 unverifiable; 24 additional findings merged.
- Refuted claims and corrections:
  1. "@astrojs/cloudflare CHANGELOG 14.0.0: drops Pages, workerd dev server, default changed to cloudflare-binding" -> those entries are under 13.0.0; 14.0.0 is the Vite 8 upgrade + opt-in CDN cache provider; 14.2.0 added `build: 'cloudflare-binding'`. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/cloudflare/CHANGELOG.md
  2. "@astrojs/netlify 6.3.0 added image.remotePatterns/domains support for Netlify Image CDN" -> landed in 5.2.0 (withastro/adapters PR #187); 6.3.0 is the session API stabilisation release. https://raw.githubusercontent.com/withastro/astro/main/packages/integrations/netlify/CHANGELOG.md
  3. "image.domains/remotePatterns added in 2.10.10 and unchanged in Astro 7" -> matching semantics changed in 5.18.1: pathname wildcards anchored (GHSA-g735-7g2w-hh3f / CVE-2026-33769). https://api.github.com/advisories?ecosystem=npm&affects=astro&per_page=15
  4. "Deploy on Netlify; transformations only bill as bandwidth credits" (Free-plan assumption) -> 300-credit hard cap pauses all sites; 15 credits per production deploy, 20 per GB, 2 per 10k requests; budget Personal or Pro. https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
- Minor corrections applied inline: `fit` prop since 5.10.0 (not 5.0.0); loadImage path is `packages/astro/src/assets/endpoint/loadImage.ts`; Netlify double-quoted TOML needs `\\.`; Cloudflare bindings doc moved to /images/optimization/binding/; the researcher's per-claim confidence tags were dropped in favour of the verdicts.
