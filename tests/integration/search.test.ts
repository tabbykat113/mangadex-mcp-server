import { describe, it, expect, beforeAll } from "vitest";
import { MangaDexApiClient } from "../../src/client.js";

describe("Integration: search_manga", () => {
  let client: MangaDexApiClient;

  beforeAll(() => {
    // No auth needed for search
    client = new MangaDexApiClient("", "", "", "");
  });

  it("searches for One Piece and returns results", async () => {
    const result = await client.searchManga({ title: "One Piece", limit: 5 });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    // Should find One Piece manga
    const hasOnePiece = result.data.some(
      (m) =>
        Object.values(m.attributes.title).some((t) =>
          t.toLowerCase().includes("one piece"),
        ) ||
        m.attributes.altTitles.some((alt) =>
          Object.values(alt).some((t) => t.toLowerCase().includes("one piece")),
        ),
    );
    expect(hasOnePiece).toBe(true);
  });

  it("searches with content rating filters", async () => {
    const result = await client.searchManga({
      title: "Chainsaw Man",
      contentRating: ["suggestive"],
      limit: 5,
    });
    expect(result.data.length).toBeGreaterThan(0);
    // All results should match the content rating
    for (const manga of result.data) {
      expect(manga.attributes.contentRating).toBe("suggestive");
    }
  });

  it("handles empty search results gracefully", async () => {
    const result = await client.searchManga({
      title: "xyznonexistent12345",
      limit: 10,
    });
    expect(result.data.length).toBe(0);
    expect(result.total).toBe(0);
  });
});
