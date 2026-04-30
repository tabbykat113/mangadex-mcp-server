import { MangaDexApiClient } from "./client.js";
import { SearchOptions } from "./types.js";
export declare class TagCache {
    private map;
    private loaded;
    load(client: MangaDexApiClient): Promise<void>;
    isLoaded(): boolean;
    resolve(names: string[]): {
        found: string[];
        missing: string[];
    };
    getAllTags(): Map<string, string>;
}
export interface ResolvedSearchOptions extends SearchOptions {
    missingTags?: string[];
}
export declare function resolveSearchTags(options: SearchOptions, tagCache: TagCache): ResolvedSearchOptions;
//# sourceMappingURL=filters.d.ts.map