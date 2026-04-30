const API_BASE = "https://api.mangadex.org";
const AUTH_BASE = "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token";
const UPLOADS_BASE = "https://uploads.mangadex.org";
// ─── Errors ───
export class MangaDexApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = "MangaDexApiError";
    }
}
// ─── Timed Cache ───
class TimedCache {
    store = new Map();
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return undefined;
        if (Date.now() > entry.expiry) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key, value, ttlMs) {
        this.store.set(key, { value, expiry: Date.now() + ttlMs });
    }
}
// ─── API Client ───
export class MangaDexApiClient {
    clientId;
    clientSecret;
    username;
    password;
    token;
    cache = new TimedCache();
    lastRequestTime = 0;
    minSpacingMs = 100;
    constructor(clientId, clientSecret, username, password) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.username = username;
        this.password = password;
    }
    // ─── Auth ───
    async login() {
        const data = await this.tokenRequest({
            grant_type: "password",
            username: this.username,
            password: this.password,
            client_id: this.clientId,
            client_secret: this.clientSecret,
        });
        this.setToken(data);
    }
    async refreshToken() {
        if (!this.token)
            throw new Error("No refresh token available");
        const data = await this.tokenRequest({
            grant_type: "refresh_token",
            refresh_token: this.token.refresh,
            client_id: this.clientId,
            client_secret: this.clientSecret,
        });
        this.setToken(data);
    }
    setToken(data) {
        this.token = {
            access: data.access_token,
            refresh: data.refresh_token,
            expiresAt: Date.now() + data.expires_in * 1000 - 60000, // 1 min buffer
        };
    }
    async ensureTokenValid() {
        if (!this.token)
            await this.login();
        else if (Date.now() >= this.token.expiresAt)
            await this.refreshToken();
    }
    async tokenRequest(body) {
        const response = await fetch(AUTH_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(body),
        });
        if (!response.ok) {
            throw new Error(`Auth failed: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }
    hasAuth() {
        return !!this.token;
    }
    // ─── Rate Limiting ───
    async throttle() {
        const now = Date.now();
        const wait = this.lastRequestTime + this.minSpacingMs - now;
        if (wait > 0)
            await new Promise((r) => setTimeout(r, wait));
        this.lastRequestTime = Date.now();
    }
    // ─── Generic Request ───
    async request(path, options = {}) {
        return this.requestWithRetry(path, options);
    }
    async authenticatedRequest(path, options = {}) {
        await this.ensureTokenValid();
        return this.requestWithRetry(path, options, true);
    }
    async requestWithRetry(path, options, authenticated = false) {
        await this.throttle();
        const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
        const headers = new Headers(options.headers);
        if (authenticated && this.token) {
            // Only send auth to api.mangadex.org and auth.mangadex.org
            if (url.includes("mangadex.org") && !url.includes("uploads.mangadex.org")) {
                headers.set("Authorization", `Bearer ${this.token.access}`);
            }
        }
        const response = await fetch(url, { ...options, headers });
        // Handle 401 by refreshing token and retrying once
        if (response.status === 401 && authenticated) {
            await this.refreshToken();
            await this.throttle();
            const retryHeaders = new Headers(options.headers);
            if (this.token) {
                retryHeaders.set("Authorization", `Bearer ${this.token.access}`);
            }
            const retryResponse = await fetch(url, { ...options, headers: retryHeaders });
            return this.parseResponse(retryResponse);
        }
        // Handle 429 with exponential backoff
        if (response.status === 429) {
            let delay = 1000;
            for (let attempt = 0; attempt < 3; attempt++) {
                await new Promise((r) => setTimeout(r, delay));
                await this.throttle();
                const retryResponse = await fetch(url, { ...options, headers });
                if (retryResponse.status !== 429) {
                    return this.parseResponse(retryResponse);
                }
                delay *= 2;
            }
            throw new MangaDexApiError("Rate limited. Please try again later.", 429);
        }
        // Handle server errors with one retry
        if (response.status >= 500) {
            await new Promise((r) => setTimeout(r, 2000));
            await this.throttle();
            const retryResponse = await fetch(url, { ...options, headers });
            return this.parseResponse(retryResponse);
        }
        return this.parseResponse(response);
    }
    async parseResponse(response) {
        if (!response.ok) {
            const text = await response.text().catch(() => "Unknown error");
            throw new MangaDexApiError(`MangaDex API error (${response.status}): ${text}`, response.status);
        }
        return response.json();
    }
    // ─── Endpoints ───
    async getTags() {
        const cacheKey = "tags:all";
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        const res = await this.request("/manga/tag");
        if (res.result !== "ok" || !res.data) {
            throw new MangaDexApiError("Failed to load tags", 500);
        }
        this.cache.set(cacheKey, res.data, 1000 * 60 * 60); // 1 hour
        return res.data;
    }
    async searchManga(options) {
        const params = buildSearchParams(options);
        const cacheKey = `search:${params.toString()}`;
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        const res = await this.request(`/manga?${params}`);
        this.cache.set(cacheKey, res, 1000 * 60 * 5); // 5 minutes
        return res;
    }
    async getMangaDetails(mangaId) {
        const cacheKey = `manga:${mangaId}`;
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        const res = await this.request(`/manga/${mangaId}?includes[]=author&includes[]=artist&includes[]=cover_art`);
        if (res.result !== "ok" || !res.data) {
            if (res.errors?.some((e) => e.status === 404)) {
                throw new MangaDexApiError("Manga not found", 404);
            }
            throw new MangaDexApiError("Failed to fetch manga details", 500);
        }
        this.cache.set(cacheKey, res.data, 1000 * 60 * 5); // 5 minutes
        return res.data;
    }
    async getUserFollowsManga(limit = 20, offset = 0) {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        params.append("includes[]", "cover_art");
        const res = await this.authenticatedRequest(`/user/follows/manga?${params}`);
        return res;
    }
    async getCoversForManga(mangaId) {
        const params = new URLSearchParams();
        params.append("manga[]", mangaId);
        params.set("limit", "100");
        const res = await this.request(`/cover?${params}`);
        if (res.result !== "ok" || !res.data) {
            throw new MangaDexApiError("Failed to fetch covers", 500);
        }
        return res.data;
    }
}
// ─── Query Parameter Builder ───
export function buildSearchParams(options) {
    const params = new URLSearchParams();
    if (options.title)
        params.set("title", options.title);
    for (const tag of options.includedTags ?? [])
        params.append("includedTags[]", tag);
    for (const tag of options.excludedTags ?? [])
        params.append("excludedTags[]", tag);
    if (options.includedTagsMode)
        params.set("includedTagsMode", options.includedTagsMode);
    if (options.excludedTagsMode)
        params.set("excludedTagsMode", options.excludedTagsMode);
    for (const d of options.publicationDemographic ?? [])
        params.append("publicationDemographic[]", d);
    for (const s of options.status ?? [])
        params.append("status[]", s);
    for (const c of options.contentRating ?? ["safe", "suggestive"])
        params.append("contentRating[]", c);
    for (const [field, dir] of Object.entries(options.order ?? {})) {
        params.set(`order[${field}]`, dir);
    }
    params.append("includes[]", "cover_art");
    params.set("limit", String(options.limit ?? 10));
    params.set("offset", String(options.offset ?? 0));
    return params;
}
// ─── Cover URL Builder ───
export function buildCoverUrl(mangaId, filename, size) {
    const base = `${UPLOADS_BASE}/covers/${mangaId}/${filename}`;
    if (size === "256")
        return `${base}.256.jpg`;
    if (size === "512")
        return `${base}.512.jpg`;
    return base;
}
// ─── Relationship Helpers ───
export function getRelated(manga, type) {
    return manga.relationships.filter((r) => r.type === type);
}
export function getCoverFilename(manga) {
    const cover = getRelated(manga, "cover_art")[0];
    return cover?.attributes?.fileName;
}
//# sourceMappingURL=client.js.map