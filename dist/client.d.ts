import { MdCollectionResponse, MdManga, MdTag, MdCover, SearchOptions } from "./types.js";
export declare class MangaDexApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
export declare class MangaDexApiClient {
    private clientId;
    private clientSecret;
    private username;
    private password;
    private token?;
    private cache;
    private lastRequestTime;
    private readonly minSpacingMs;
    constructor(clientId: string, clientSecret: string, username: string, password: string);
    login(): Promise<void>;
    refreshToken(): Promise<void>;
    private setToken;
    ensureTokenValid(): Promise<void>;
    private tokenRequest;
    hasAuth(): boolean;
    private throttle;
    request<T>(path: string, options?: RequestInit): Promise<T>;
    authenticatedRequest<T>(path: string, options?: RequestInit): Promise<T>;
    private requestWithRetry;
    private parseResponse;
    getTags(): Promise<MdTag[]>;
    searchManga(options: SearchOptions): Promise<MdCollectionResponse<MdManga>>;
    getMangaDetails(mangaId: string): Promise<MdManga>;
    getUserFollowsManga(limit?: number, offset?: number): Promise<MdCollectionResponse<MdManga>>;
    getCoversForManga(mangaId: string): Promise<MdCover[]>;
}
export declare function buildSearchParams(options: SearchOptions): URLSearchParams;
export declare function buildCoverUrl(mangaId: string, filename: string, size?: "256" | "512"): string;
export declare function getRelated<T>(manga: MdManga, type: string): T[];
export declare function getCoverFilename(manga: MdManga): string | undefined;
//# sourceMappingURL=client.d.ts.map