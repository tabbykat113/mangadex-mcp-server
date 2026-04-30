// ─── Tag Cache ───
export class TagCache {
    map = new Map(); // normalized name -> uuid
    loaded = false;
    async load(client) {
        const tags = await client.getTags();
        for (const tag of tags) {
            const enName = tag.attributes.name["en"]?.toLowerCase().trim();
            if (enName)
                this.map.set(enName, tag.id);
            // Also store any alternative locale names
            for (const [locale, name] of Object.entries(tag.attributes.name)) {
                if (locale !== "en") {
                    this.map.set(name.toLowerCase().trim(), tag.id);
                }
            }
        }
        this.loaded = true;
    }
    isLoaded() {
        return this.loaded;
    }
    resolve(names) {
        const found = [];
        const missing = [];
        for (const name of names) {
            const uuid = this.map.get(name.toLowerCase().trim());
            if (uuid)
                found.push(uuid);
            else
                missing.push(name);
        }
        return { found, missing };
    }
    getAllTags() {
        return new Map(this.map);
    }
}
export function resolveSearchTags(options, tagCache) {
    const result = { ...options };
    const missing = [];
    if (options.includedTags && options.includedTags.length > 0) {
        const resolved = tagCache.resolve(options.includedTags);
        result.includedTags = resolved.found;
        missing.push(...resolved.missing);
    }
    if (options.excludedTags && options.excludedTags.length > 0) {
        const resolved = tagCache.resolve(options.excludedTags);
        result.excludedTags = resolved.found;
        missing.push(...resolved.missing);
    }
    if (missing.length > 0) {
        result.missingTags = [...new Set(missing)];
    }
    return result;
}
//# sourceMappingURL=filters.js.map