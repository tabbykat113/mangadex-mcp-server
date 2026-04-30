// ─── MangaDex API Response Wrappers ───

export interface MdResponse<T> {
  result: "ok" | "error";
  response?: T;
  data?: T;
  errors?: MdError[];
}

export interface MdCollectionResponse<T> {
  result: "ok" | "error";
  data: T[];
  limit: number;
  offset: number;
  total: number;
  errors?: MdError[];
}

export interface MdError {
  id: string;
  status: number;
  title: string;
  detail?: string;
}

// ─── Manga ───

export interface MdManga {
  id: string;
  type: "manga";
  attributes: MdMangaAttributes;
  relationships: MdRelationship[];
}

export interface MdMangaAttributes {
  title: Record<string, string>;
  altTitles: Record<string, string>[];
  description: Record<string, string>;
  isLocked: boolean;
  links: Record<string, string> | null;
  originalLanguage: string;
  lastVolume: string | null;
  lastChapter: string | null;
  publicationDemographic: "shounen" | "shoujo" | "josei" | "seinen" | "none" | null;
  status: "ongoing" | "completed" | "hiatus" | "cancelled";
  year: number | null;
  contentRating: "safe" | "suggestive" | "erotica" | "pornographic";
  chapterNumbersResetOnNewVolume: boolean;
  availableTranslatedLanguages: string[];
  tags: MdTag[];
  state: "draft" | "submitted" | "published" | "rejected";
  version: number;
  createdAt: string;
  updatedAt: string;
  latestUploadedChapter: string | null;
}

// ─── Chapter ───

export interface MdChapter {
  id: string;
  type: "chapter";
  attributes: MdChapterAttributes;
  relationships: MdRelationship[];
}

export interface MdChapterAttributes {
  title: string | null;
  volume: string | null;
  chapter: string | null;
  pages: number;
  translatedLanguage: string;
  uploader: string;
  externalUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishAt: string;
  readableAt: string;
}

// ─── Tag ───

export interface MdTag {
  id: string;
  type: "tag";
  attributes: MdTagAttributes;
  relationships: [];
}

export interface MdTagAttributes {
  name: Record<string, string>;
  description: Record<string, string>;
  group: "content" | "format" | "genre" | "theme";
  version: number;
}

// ─── Cover Art ───

export interface MdCover {
  id: string;
  type: "cover_art";
  attributes: MdCoverAttributes;
  relationships: MdRelationship[];
}

export interface MdCoverAttributes {
  volume: string | null;
  fileName: string;
  description: string | null;
  locale: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Relationship ───

export interface MdRelationship {
  id: string;
  type: string;
  related?: string;
  attributes?: Record<string, unknown>;
}

// ─── Reading Status ───

export interface MdReadingStatus {
  mangaId: string;
  status: "reading" | "on_hold" | "dropped" | "plan_to_read" | "completed" | "re_reading" | null;
}

export interface MdReadingStatusMap {
  statuses: Record<string, string>;
}

// ─── Auth ───

export interface MdTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// ─── Type Guards ───

export function isMdError(response: unknown): response is MdResponse<never> {
  return (
    typeof response === "object" &&
    response !== null &&
    (response as MdResponse<never>).result === "error"
  );
}

// ─── Search Options ───

export interface SearchOptions {
  title?: string;
  limit?: number;
  offset?: number;
  includedTags?: string[];
  excludedTags?: string[];
  includedTagsMode?: "AND" | "OR";
  excludedTagsMode?: "AND" | "OR";
  publicationDemographic?: string[];
  status?: string[];
  contentRating?: string[];
  order?: Record<string, "asc" | "desc">;
}
