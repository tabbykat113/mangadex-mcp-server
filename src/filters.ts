import { MangaDexApiClient } from "./client.js";
import { MdTag, SearchOptions } from "./types.js";

// ─── Tag Cache ───

export class TagCache {
  private map = new Map<string, string>(); // normalized name -> uuid
  private loaded = false;

  async load(client: MangaDexApiClient): Promise<void> {
    const tags = await client.getTags();
    for (const tag of tags) {
      const enName = tag.attributes.name["en"]?.toLowerCase().trim();
      if (enName) this.map.set(enName, tag.id);
      // Also store any alternative locale names
      for (const [locale, name] of Object.entries(tag.attributes.name)) {
        if (locale !== "en") {
          this.map.set(name.toLowerCase().trim(), tag.id);
        }
      }
    }
    this.loaded = true;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  resolve(names: string[]): { found: string[]; missing: string[] } {
    const found: string[] = [];
    const missing: string[] = [];
    for (const name of names) {
      const uuid = this.map.get(name.toLowerCase().trim());
      if (uuid) found.push(uuid);
      else missing.push(name);
    }
    return { found, missing };
  }

  getAllTags(): Map<string, string> {
    return new Map(this.map);
  }
}

// ─── Search Options with Tag Resolution ───

export interface ResolvedSearchOptions extends SearchOptions {
  missingTags?: string[];
}

export function resolveSearchTags(
  options: SearchOptions,
  tagCache: TagCache,
): ResolvedSearchOptions {
  const result: ResolvedSearchOptions = { ...options };
  const missing: string[] = [];

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
