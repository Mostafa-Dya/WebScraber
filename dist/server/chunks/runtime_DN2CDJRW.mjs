import { randomBytes } from "node:crypto";
//#region src/lib/google/handshake.ts
var HANDSHAKE_TTL_MS = 6e5;
var HANDSHAKE_COOKIE = "sl_g_oauth";
var MAX_PENDING = 8;
var HandshakeStore = class {
	pending = /* @__PURE__ */ new Map();
	now;
	ttlMs;
	constructor(options = {}) {
		this.now = options.now ?? Date.now;
		this.ttlMs = options.ttlMs ?? 6e5;
	}
	prune() {
		const cutoff = this.now() - this.ttlMs;
		for (const [id, h] of this.pending) if (h.createdAt < cutoff) this.pending.delete(id);
		while (this.pending.size > MAX_PENDING) {
			const oldest = this.pending.keys().next();
			if (oldest.done) break;
			this.pending.delete(oldest.value);
		}
	}
	/** Returns the cookie id; the handshake itself never leaves the process. */
	create(input) {
		const id = randomBytes(16).toString("base64url");
		this.pending.set(id, {
			...input,
			createdAt: this.now()
		});
		this.prune();
		return id;
	}
	/** One use only: taking it removes it, so a replayed callback finds nothing. */
	take(id) {
		this.prune();
		if (!id) return void 0;
		const h = this.pending.get(id);
		if (!h) return void 0;
		this.pending.delete(id);
		if (this.now() - h.createdAt > this.ttlMs) return void 0;
		return h;
	}
	get size() {
		return this.pending.size;
	}
};
/** Only an /admin path may be a post-connection destination. */
function sanitiseNext(value, fallback = "/admin/google") {
	if (typeof value !== "string") return fallback;
	const v = value.trim();
	if (!/^\/admin(\/[A-Za-z0-9_\-/]*)?$/.test(v) || v.startsWith("//")) return fallback;
	return v;
}
//#endregion
//#region src/lib/google/runtime.ts
/** In-progress authorisations, keyed by the id in the owner's short-lived cookie. */
var handshakes = new HandshakeStore();
//#endregion
export { sanitiseNext as i, HANDSHAKE_COOKIE as n, HANDSHAKE_TTL_MS as r, handshakes as t };
