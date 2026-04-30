import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MangaDexApiClient, buildSearchParams, buildCoverUrl } from "../../src/client.js";

describe("buildSearchParams", () => {
  it("builds basic params with defaults", () => {
    const params = buildSearchParams({ title: "One Piece" });
    expect(params.get("title")).toBe("One Piece");
    expect(params.get("limit")).toBe("10");
    expect(params.get("offset")).toBe("0");
    expect(params.get("includes[]")).toBe("cover_art");
  });

  it("includes contentRating default", () => {
    const params = buildSearchParams({});
    expect(params.getAll("contentRating[]")).toEqual(["safe", "suggestive"]);
  });

  it("builds tag params", () => {
    const params = buildSearchParams({
      includedTags: ["tag1", "tag2"],
      excludedTags: ["tag3"],
      includedTagsMode: "AND",
      excludedTagsMode: "OR",
    });
    expect(params.getAll("includedTags[]")).toEqual(["tag1", "tag2"]);
    expect(params.getAll("excludedTags[]")).toEqual(["tag3"]);
    expect(params.get("includedTagsMode")).toBe("AND");
    expect(params.get("excludedTagsMode")).toBe("OR");
  });

  it("builds order params", () => {
    const params = buildSearchParams({
      order: { rating: "desc", followedCount: "asc" },
    });
    expect(params.get("order[rating]")).toBe("desc");
    expect(params.get("order[followedCount]")).toBe("asc");
  });

  it("builds demographic and status params", () => {
    const params = buildSearchParams({
      publicationDemographic: ["shounen", "seinen"],
      status: ["ongoing"],
    });
    expect(params.getAll("publicationDemographic[]")).toEqual(["shounen", "seinen"]);
    expect(params.getAll("status[]")).toEqual(["ongoing"]);
  });
});

describe("buildCoverUrl", () => {
  it("builds original URL", () => {
    const url = buildCoverUrl("manga-id", "cover.png");
    expect(url).toBe("https://uploads.mangadex.org/covers/manga-id/cover.png");
  });

  it("builds 256px URL", () => {
    const url = buildCoverUrl("manga-id", "cover.png", "256");
    expect(url).toBe("https://uploads.mangadex.org/covers/manga-id/cover.png.256.jpg");
  });

  it("builds 512px URL", () => {
    const url = buildCoverUrl("manga-id", "cover.png", "512");
    expect(url).toBe("https://uploads.mangadex.org/covers/manga-id/cover.png.512.jpg");
  });
});

describe("MangaDexApiClient auth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets token with expiry buffer", async () => {
    const client = new MangaDexApiClient("id", "secret", "user", "pass");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access123",
        refresh_token: "refresh123",
        expires_in: 900,
        token_type: "Bearer",
      }),
    });

    await client.login();
    expect(client.hasAuth()).toBe(true);
  });

  it("refreshes token when expired", async () => {
    const client = new MangaDexApiClient("id", "secret", "user", "pass");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "newAccess",
        refresh_token: "newRefresh",
        expires_in: 900,
        token_type: "Bearer",
      }),
    });

    await client.login();
    vi.advanceTimersByTime(1000 * 60 * 20); // 20 minutes later
    await client.ensureTokenValid();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
