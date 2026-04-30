import { describe, it, expect, vi, beforeEach } from "vitest";
import { TagCache, resolveSearchTags } from "../../src/filters.js";
import { MangaDexApiClient } from "../../src/client.js";
import { MdTag } from "../../src/types.js";

function createMockClient(tags: MdTag[]): MangaDexApiClient {
  const client = new MangaDexApiClient("", "", "", "");
  vi.spyOn(client, "getTags").mockResolvedValue(tags);
  return client;
}

const mockTags: MdTag[] = [
  {
    id: "tag-action",
    type: "tag",
    attributes: {
      name: { en: "Action", ja: "アクション" },
      description: {},
      group: "genre",
      version: 1,
    },
    relationships: [],
  },
  {
    id: "tag-comedy",
    type: "tag",
    attributes: {
      name: { en: "Comedy" },
      description: {},
      group: "genre",
      version: 1,
    },
    relationships: [],
  },
  {
    id: "tag-romance",
    type: "tag",
    attributes: {
      name: { en: "Romance" },
      description: {},
      group: "genre",
      version: 1,
    },
    relationships: [],
  },
];

describe("TagCache", () => {
  it("loads tags from client", async () => {
    const client = createMockClient(mockTags);
    const cache = new TagCache();
    await cache.load(client);
    expect(cache.isLoaded()).toBe(true);
    expect(cache.getAllTags().size).toBe(4); // Action, アクション, Comedy, Romance
  });

  it("resolves English tag names case-insensitively", async () => {
    const client = createMockClient(mockTags);
    const cache = new TagCache();
    await cache.load(client);

    const result = cache.resolve(["Action", "COMEDY", " romance "]);
    expect(result.found).toEqual(["tag-action", "tag-comedy", "tag-romance"]);
    expect(result.missing).toEqual([]);
  });

  it("returns missing tags for unknown names", async () => {
    const client = createMockClient(mockTags);
    const cache = new TagCache();
    await cache.load(client);

    const result = cache.resolve(["Action", "UnknownTag", "AlsoMissing"]);
    expect(result.found).toEqual(["tag-action"]);
    expect(result.missing).toEqual(["UnknownTag", "AlsoMissing"]);
  });

  it("resolves Japanese tag names", async () => {
    const client = createMockClient(mockTags);
    const cache = new TagCache();
    await cache.load(client);

    const result = cache.resolve(["アクション"]);
    expect(result.found).toEqual(["tag-action"]);
  });
});

describe("resolveSearchTags", () => {
  it("resolves included and excluded tags", async () => {
    const client = createMockClient(mockTags);
    const cache = new TagCache();
    await cache.load(client);

    const options = {
      title: "test",
      includedTags: ["Action", "Romance"],
      excludedTags: ["Comedy"],
    };

    const result = resolveSearchTags(options, cache);
    expect(result.includedTags).toEqual(["tag-action", "tag-romance"]);
    expect(result.excludedTags).toEqual(["tag-comedy"]);
    expect(result.missingTags).toBeUndefined();
  });

  it("reports missing tags", async () => {
    const client = createMockClient(mockTags);
    const cache = new TagCache();
    await cache.load(client);

    const options = {
      includedTags: ["Action", "Missing"],
      excludedTags: ["AlsoMissing"],
    };

    const result = resolveSearchTags(options, cache);
    expect(result.missingTags).toContain("Missing");
    expect(result.missingTags).toContain("AlsoMissing");
  });
});
