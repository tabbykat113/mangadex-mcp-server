import { MdManga, MdTag, MdCover } from "../../src/types.js";

export const mockManga: MdManga = {
  id: "a77742b1-befd-49a8-b599-2214b7a80289",
  type: "manga",
  attributes: {
    title: { en: "Chainsaw Man", ja: "チェンソーマン" },
    altTitles: [{ "es-la": "Chainsaw Man" }, { "ja-ro": "Chensou Man" }],
    description: { en: "Denji's life of poverty is changed forever when he merges with his pet chainsaw dog, Pochita..." },
    isLocked: false,
    links: { al: "107706", mal: "116778", mu: "150669" },
    originalLanguage: "ja",
    lastVolume: "18",
    lastChapter: "174",
    publicationDemographic: "shounen",
    status: "ongoing",
    year: 2018,
    contentRating: "suggestive",
    chapterNumbersResetOnNewVolume: false,
    availableTranslatedLanguages: ["en", "es-la", "ja"],
    tags: [
      {
        id: "391b0423-d847-456f-aff0-8b0cfc03066b",
        type: "tag",
        attributes: {
          name: { en: "Action" },
          description: {},
          group: "genre",
          version: 1,
        },
        relationships: [],
      },
      {
        id: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
        type: "tag",
        attributes: {
          name: { en: "Comedy" },
          description: {},
          group: "genre",
          version: 1,
        },
        relationships: [],
      },
    ],
    state: "published",
    version: 12,
    createdAt: "2018-12-03T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
    latestUploadedChapter: "2024-03-15T00:00:00Z",
  },
  relationships: [
    {
      id: "author-uuid-1",
      type: "author",
      attributes: { name: "Fujimoto Tatsuki" },
    },
    {
      id: "artist-uuid-1",
      type: "artist",
      attributes: { name: "Fujimoto Tatsuki" },
    },
    {
      id: "cover-uuid-1",
      type: "cover_art",
      attributes: { fileName: "cover.png", volume: "1", locale: "ja" },
    },
  ],
};

export const mockTag: MdTag = {
  id: "391b0423-d847-456f-aff0-8b0cfc03066b",
  type: "tag",
  attributes: {
    name: { en: "Action", ja: "アクション" },
    description: { en: "Fast-paced, exciting scenes" },
    group: "genre",
    version: 1,
  },
  relationships: [],
};

export const mockCover: MdCover = {
  id: "cover-uuid-1",
  type: "cover_art",
  attributes: {
    volume: "1",
    fileName: "cover.png",
    description: null,
    locale: "ja",
    version: 1,
    createdAt: "2018-12-03T00:00:00Z",
    updatedAt: "2018-12-03T00:00:00Z",
  },
  relationships: [{ id: "a77742b1-befd-49a8-b599-2214b7a80289", type: "manga" }],
};
