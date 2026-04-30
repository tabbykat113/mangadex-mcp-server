import { describe, it, expect } from "vitest";
import {
  formatMangaList,
  formatMangaDetails,
  formatCoverList,
  formatTagList,
  formatUserReadingList,
} from "../../src/format.js";
import { mockManga, mockTag, mockCover } from "../fixtures/manga.js";
import { MdManga } from "../../src/types.js";

describe("formatMangaList", () => {
  it("formats a list of manga", () => {
    const text = formatMangaList([mockManga], { total: 1 });
    expect(text).toContain("Chainsaw Man");
    expect(text).toContain("ID: a77742b1-befd-49a8-b599-2214b7a80289");
    expect(text).toContain("Status: ongoing");
    expect(text).toContain("Tags: Action, Comedy");
  });

  it("shows pagination hint when more results available", () => {
    const text = formatMangaList([mockManga], { total: 100, nextOffset: 10 });
    expect(text).toContain("Showing 1 of 100 results");
    expect(text).toContain("offset=10");
  });

  it("shows missing tags warning", () => {
    const text = formatMangaList([mockManga], { missingTags: ["UnknownTag"] });
    expect(text).toContain("Unknown tags ignored: UnknownTag");
  });

  it("handles empty list", () => {
    expect(formatMangaList([])).toBe("No manga found.");
  });
});

describe("formatMangaDetails", () => {
  it("formats full manga details", () => {
    const text = formatMangaDetails(mockManga);
    expect(text).toContain("Chainsaw Man");
    expect(text).toContain("MangaDex ID: a77742b1-befd-49a8-b599-2214b7a80289");
    expect(text).toContain("Content Rating: suggestive");
    expect(text).toContain("Fujimoto Tatsuki (author, artist)");
    expect(text).toContain("Tags: Action, Comedy");
    expect(text).toContain("AL: 107706");
    expect(text).toContain("MAL: 116778");
  });

  it("handles manga with minimal data", () => {
    const minimal: MdManga = {
      id: "00000000-0000-0000-0000-000000000000",
      type: "manga",
      attributes: {
        title: { en: "Minimal" },
        altTitles: [],
        description: {},
        isLocked: false,
        links: null,
        originalLanguage: "en",
        lastVolume: null,
        lastChapter: null,
        publicationDemographic: null,
        status: "ongoing",
        year: null,
        contentRating: "safe",
        chapterNumbersResetOnNewVolume: false,
        availableTranslatedLanguages: [],
        tags: [],
        state: "published",
        version: 1,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        latestUploadedChapter: null,
      },
      relationships: [],
    };

    const text = formatMangaDetails(minimal);
    expect(text).toContain("Minimal");
    expect(text).toContain("No description available.");
  });
});

describe("formatCoverList", () => {
  it("formats cover list", () => {
    const text = formatCoverList([mockCover], mockManga.id, "Chainsaw Man");
    expect(text).toContain('Cover Art for "Chainsaw Man"');
    expect(text).toContain("Volume: 1");
    expect(text).toContain("Original:");
    expect(text).toContain("256px:");
    expect(text).toContain("512px:");
  });

  it("handles empty covers", () => {
    expect(formatCoverList([], mockManga.id)).toBe("No cover art found for this manga.");
  });
});

describe("formatTagList", () => {
  it("formats tags grouped by group", () => {
    const text = formatTagList([mockTag]);
    expect(text).toContain("Available Tags");
    expect(text).toContain("Genre:");
    expect(text).toContain("Action");
  });

  it("handles empty tags", () => {
    expect(formatTagList([])).toBe("No tags available.");
  });
});

describe("formatUserReadingList", () => {
  it("formats followed manga list", () => {
    const text = formatUserReadingList([mockManga], { total: 1 });
    expect(text).toContain("Your Followed Manga");
    expect(text).toContain("Chainsaw Man");
    expect(text).toContain("Status: ongoing");
  });

  it("handles empty list", () => {
    expect(formatUserReadingList([])).toBe("Your reading list is empty.");
  });
});
