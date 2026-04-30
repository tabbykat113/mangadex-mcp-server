# MangaDex MCP Server - Full Implementation Specification

> **Version:** 1.0.0
> **Date:** 2026-04-30
> **Status:** Implementation-ready specification
> **Reference:** MangaDex API v5 (https://api.mangadex.org/docs)
> **Pattern Reference:** `mal-mcp-server` (/home/tabby/.openclaw/workspace/mal-mcp-server)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication](#2-authentication)
3. [Tool Definitions](#3-tool-definitions)
4. [Data Models](#4-data-models)
5. [Filter Strategy](#5-filter-strategy)
6. [Formatting](#6-formatting)
7. [Error Handling](#7-error-handling)
8. [Rate Limiting & Caching](#8-rate-limiting--caching)
9. [Testing Strategy](#9-testing-strategy)
10. [Future Extensions](#10-future-extensions)
11. [Appendix A: Endpoint-to-Tool Mapping](#appendix-a-endpoint-to-tool-mapping)
12. [Appendix B: Comparison with MAL MCP](#appendix-b-comparison-with-mal-mcp)
13. [Appendix C: File Structure](#appendix-c-file-structure)
14. [Appendix D: Key Code Snippets](#appendix-d-key-code-snippets)

---

## 1. Architecture Overview

### 1.1 Design Goals

- **Single-file entry point** (`src/index.ts`) that bootstraps the stdio MCP server, registers all tools, and starts the transport.
- **Modular internal structure** split across 5 layers:
  1. **Transport Layer** - stdio via `@modelcontextprotocol/sdk/server/stdio.js`
  2. **API Client Layer** - `MangaDexApiClient` class handling all HTTP to `api.mangadex.org` and `auth.mangadex.org`
  3. **Filter Layer** - tag resolution, query-parameter building, AND/OR tag logic
  4. **Formatting Layer** - human-readable text output for every tool response
  5. **Auth Layer** - OAuth2 password-grant token management, automatic refresh, in-memory only

### 1.2 Technology Stack

| Component | Choice | Version |
|-----------|--------|---------|
| Runtime | Node.js | >= 20 |
| Language | TypeScript | >= 5.7 |
| Module system | ESM (`"type": "module"`) | - |
| MCP SDK | `@modelcontextprotocol/sdk` | ^1.20.0 |
| Validation | `zod` | ^3.25.0 |
| HTTP | Native `fetch` (Node 20+) | - |

### 1.3 Layer Responsibilities

```
┌─────────────────────────────────────────┐
│  Transport (StdioServerTransport)       │  ← MCP stdio wire protocol
├─────────────────────────────────────────┤
│  Server (McpServer)                     │  ← tool registration, routing
├─────────────────────────────────────────┤
│  Tools (index.ts)                       │  ← z schemas, handler wrappers
├─────────────────────────────────────────┤
│  Formatters (format.ts)                 │  ← human-readable text output
├─────────────────────────────────────────┤
│  Filters (filters.ts)                   │  ← tag cache, param building
├─────────────────────────────────────────┤
│  API Client (client.ts)                 │  ← HTTP, auth, rate limiting
├─────────────────────────────────────────┤
│  Auth Manager (inside client.ts)        │  ← tokens, refresh, expiry
└─────────────────────────────────────────┘
```

### 1.4 Server Lifecycle

```typescript
// src/index.ts
const server = new McpServer({ name: "mangadex-mcp-server", version: "1.0.0" });

// 1. Validate env vars (fail fast)
// 2. Instantiate MangaDexApiClient
// 3. Pre-load tag cache (one API call, session lifetime)
// 4. Register all 4 core tools (search, details, cover art, user list)
// 5. Connect StdioServerTransport
// 6. Log "mangadex-mcp-server running on stdio" to stderr
```

**Critical:** All console output to **stdout** is JSON-RPC. Only `console.error` may be used for diagnostics.

---

## 2. Authentication


#### Read-Only Mode (Graceful Degradation)
If auth environment variables (`MANGADEX_CLIENT_ID`, `MANGADEX_CLIENT_SECRET`, `MANGADEX_USERNAME`, `MANGADEX_PASSWORD`) are not set, the server starts in **read-only mode**: all search, details, and cover art tools work without authentication, but `get_user_reading_list` returns an error prompting the user to configure credentials.
### 2.1 OAuth2 Personal Clients (Password Grant)

MangaDex uses **Keycloak** under `auth.mangadex.org`. Only **personal clients** are fully available today.

#### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MANGADEX_CLIENT_ID` | No* | Personal client ID, e.g. `personal-client-abc123` |
| `MANGADEX_CLIENT_SECRET` | No* | Revealed once at creation. Never commit. |
| `MANGADEX_USERNAME` | No* | MangaDex account username |
| `MANGADEX_PASSWORD` | No* | MangaDex account password |

\* All four auth variables must be present together for read/write features. If **none** are set, the server starts in **read-only mode**: user list tools and write tools are disabled, but search and lookup tools work normally. If **some but not all** are set, print a clear error to stderr and exit with code 1.

**Startup validation:** Check auth vars as a group. Fully absent → read-only mode. Partially present → fatal error.

### 2.2 Token Acquisition

```
POST https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded
```

Fields:
- `grant_type=password`
- `username={MANGADEX_USERNAME}`
- `password={MANGADEX_PASSWORD}`
- `client_id={MANGADEX_CLIENT_ID}`
- `client_secret={MANGADEX_CLIENT_SECRET}`

Response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

### 2.3 Token Refresh Flow

| Property | Value |
|----------|-------|
| Access token lifetime | **15 minutes** (900s) |
| Refresh token lifetime | Long-lived (weeks/months) |
| Refresh endpoint | Same token URL |
| Refresh grant type | `refresh_token` |

**Automatic refresh strategy:**
1. Store `accessToken`, `refreshToken`, and `expiresAt` (timestamp) in-memory only.
2. Before every authenticated request, check `Date.now() >= expiresAt - 60000` (refresh if within 1 minute of expiry).
3. If expired, acquire new tokens using `refresh_token` grant.
4. If refresh fails with 401, attempt one full re-login with password grant.
5. If re-login fails, throw an MCP error: `MangaDex authentication failed. Check credentials.`

### 2.4 Security Rules

- **NEVER** persist tokens to disk, dotfiles, or `localStorage` equivalents.
- **NEVER** send `Authorization` headers to any domain other than `api.mangadex.org` or `auth.mangadex.org`.
- **NEVER** send auth headers to `*.mangadex.network` or `uploads.mangadex.org` (CDN/image domains).
- Only attach `Authorization: Bearer <token>` when the endpoint documentation explicitly requires authentication.

---

## 3. Tool Definitions (v1.0 Scope)

The v1.0 release includes **4 core tools** covering search, lookup, cover art, and user reading list access. Deferred tools (chapter feed, reading status writes, tag-only discovery, and recent updates) are documented in [Section 10: Future Extensions](#10-future-extensions).

All tools use `zod` schemas for input validation and provide `annotations` (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).

### 3.1 Tool: `search_manga`

**Title:** Search Manga on MangaDex
**Read-only:** yes
**Destructive:** no

**Description:** Search for manga by title/keywords with advanced server-side filtering. Returns a list of matching manga with titles, descriptions, content ratings, publication status, and cover art info.

**Input Schema:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `title` | `string` (2-200) | - | Search text (title or keywords) |
| `limit` | `number` (1-100) | 10 | Max results to return |
| `offset` | `number` (≥0) | 0 | Pagination offset |
| `includedTags[]` | `string[]` | - | Tag names to include (case-insensitive). Supports AND/OR logic via `includedTagsMode`. Tag names are resolved to UUIDs internally. |
| `excludedTags[]` | `string[]` | - | Tag names to exclude |
| `includedTagsMode` | `"AND" \| "OR"` | `"OR"` | How included tags combine |
| `excludedTagsMode` | `"AND" \| "OR"` | `"OR"` | How excluded tags combine |
| `publicationDemographic[]` | `string[]` | - | `shounen`, `shoujo`, `josei`, `seinen`, `none` |
| `status[]` | `string[]` | - | `ongoing`, `completed`, `hiatus`, `cancelled` |
| `contentRating[]` | `string[]` | `["safe", "suggestive"]` | `safe`, `suggestive`, `erotica`, `pornographic` |
| `order` | `object` | `{ latestUploadedChapter: "desc" }` | Sort fields, e.g. `{ rating: "desc", followedCount: "desc" }` |

**Handler logic:**
1. Resolve tag names to UUIDs using the in-memory tag cache.
2. Unknown tag names → warning in output, ignored for search.
3. Build query params and call `GET /manga`.
4. Request `includes[]=cover_art` so cover filenames are available.
5. Format results with pagination hints.

> **Content rating note:** `erotica` and `pornographic` content is excluded by default and must be explicitly included via `contentRating` if desired.

**Example output:**
```
1. Chainsaw Man
   ID: a77742b1-befd-49a8-b599-2214b7a80289 | Content: suggestive | Status: ongoing
   Demographic: shounen | Rating: ★ 8.72
   Latest chapter: 2024-03-15
   Tags: Action, Comedy, Drama, Horror, Supernatural
   Cover: https://uploads.mangadex.org/covers/a77742b1-.../cover.png.256.jpg
   https://mangadex.org/title/a77742b1-befd-49a8-b599-2214b7a80289

2. Spy x Family
   ...

Showing 2 of 10 results. More available - use offset=10 to continue.
```

---

### 3.2 Tool: `get_manga_details`

**Title:** Get Manga Details from MangaDex
**Read-only:** yes

**Description:** Full info for a specific manga by its UUID. Inlines author, artist, and cover art relationships.

**Input Schema:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `manga_id` | `string` (UUID) | MangaDex manga UUID |

**Handler logic:**
1. Call `GET /manga/{id}?includes[]=author&includes[]=artist&includes[]=cover_art`.
2. Extract relationships from the `relationships` array.
3. Build cover URL from cover_art relationship attributes.
4. Format comprehensive details block.

> **Aggregate endpoint:** `GET /manga/{id}/aggregate` groups chapters by volume and is useful for formatted chapter overviews (volume → chapter list). Consider using this for detail views that include a structured chapter tree.

**Example output:**
```
Chainsaw Man
══════════════════════════════════════════
MangaDex ID: a77742b1-befd-49a8-b599-2214b7a80289
URL: https://mangadex.org/title/a77742b1-befd-49a8-b599-2214b7a80289

Alt Titles:
  en: Chainsaw Man
  ja: チェンソーマン
  es-la: Chainsaw Man

Description:
Denji's life of poverty is changed forever when he merges with his pet chainsaw dog, Pochita...

Content Rating: suggestive
Publication: shounen | Status: ongoing
Year: 2018 → ?

Authors:
  Fujimoto Tatsuki (author, artist)

Tags: Action, Comedy, Drama, Horror, Supernatural, Gore, Monsters, Police

Cover: https://uploads.mangadex.org/covers/a77742b1-.../cover.png.512.jpg

Links:
  AL: 107706 | MAL: 116778 | MU: 150669
```

---

### 3.3 Tool: `get_user_reading_list`

**Note:** This returns the flat "followed manga" list. Custom user-created lists (MDLists) via `GET /list` are planned for v1.1 (see Future Extensions).

**Title:** Get User Followed Manga
**Read-only:** yes
**Requires auth:** yes

**Description:** Fetch the authenticated user's followed manga list.

**Input Schema:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `number` (1-100) | 20 | Max results |
| `offset` | `number` (≥0) | 0 | Pagination offset |

**Handler logic:**
1. Call `GET /user/follows/manga?includes[]=cover_art`.
2. Format as manga list with reading status annotations if available.

> **Read-only mode:** If the server started without auth credentials, this tool is unavailable. Return MCP error: `Authentication required. Set MANGADEX_CLIENT_ID and related env vars.`

> **Note:** This returns the flat follow list (`/user/follows/manga`), not custom MDLists. Custom lists are a planned v1.1 feature.

---

### 3.4 Tool: `get_cover_art`

**Title:** Get Cover Art URLs
**Read-only:** yes

**Description:** Retrieve cover image URLs for a manga, including thumbnails.

**Input Schema:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `manga_id` | `string` (UUID) | - | Manga UUID |
| `size` | `"original" \| "256" \| "512"` | `"512"` | Desired size |

**Handler logic:**
1. Call `GET /cover?manga[]={id}` or use manga's cached cover_art relationship.
2. Construct URLs:
   - Original: `https://uploads.mangadex.org/covers/{manga-id}/{filename}`
   - 256px: `{original}.256.jpg`
   - 512px: `{original}.512.jpg`
3. Return formatted list.

**Example output:**
```
Cover Art for "Chainsaw Man"
────────────────────────────

Volume: 1 | Locale: ja
  Original: https://uploads.mangadex.org/covers/.../vol1.png
  256px:    https://uploads.mangadex.org/covers/.../vol1.png.256.jpg
  512px:    https://uploads.mangadex.org/covers/.../vol1.png.512.jpg

Volume: 2 | Locale: ja
  ...
```

---

## 4. Data Models

All interfaces live in `src/types.ts`.

### 4.1 Core Types

```typescript
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
  title: Record<string, string>;                 // {"en": "Title", "ja": "..."}
  altTitles: Record<string, string>[];           // [{"en": "Alt"}, {"ja-ro": "..."}]
  description: Record<string, string>;           // {"en": "Synopsis..."}
  isLocked: boolean;
  links: Record<string, string> | null;          // {"al": "...", "mal": "...", "mu": "..."}
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
  name: Record<string, string>;                  // {"en": "Action"}
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
  type: string;                                  // "author", "artist", "cover_art", "manga", etc.
  related?: string;                              // for related manga
  attributes?: Record<string, unknown>;          // inlined when using includes[]
}

// ─── Reading Status ───

export interface MdReadingStatus {
  mangaId: string;
  status: "reading" | "on_hold" | "dropped" | "plan_to_read" | "completed" | "re_reading" | null;
}

export interface MdReadingStatusMap {
  statuses: Record<string, string>;              // { "manga-uuid": "reading", ... }
}

// ─── Auth ───

export interface MdTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}
```

### 4.2 Type Guards

```typescript
export function isMdError(response: unknown): response is MdResponse<never> {
  return typeof response === "object" && response !== null && (response as MdResponse<never>).result === "error";
}
```

---

## 5. Filter Strategy

### 5.1 Native Server-Side Filtering (MangaDex Advantage)

Unlike the MAL MCP server - which fetches up to 500 results and filters **client-side** because MAL lacks certain query params - MangaDex supports **native server-side filtering** for nearly all criteria.

**Approach:** Pass filters directly to the API as query parameters. No client-side filtering is needed for standard search.

### 5.2 Tag Name → UUID Resolution

MangaDex tags are referenced by UUID, not name. The server maintains an in-memory map:

```typescript
// filters.ts
class TagCache {
  private map = new Map<string, string>(); // normalized name -> uuid
  private loaded = false;

  async load(client: MangaDexApiClient): Promise<void> {
    const tags = await client.getTags();
    for (const tag of tags) {
      const enName = tag.attributes.name["en"]?.toLowerCase();
      if (enName) this.map.set(enName, tag.id);
      // Also store aliases if available
    }
    this.loaded = true;
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
}
```

### 5.3 Query Parameter Builder

```typescript
function buildSearchParams(options: SearchOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (options.title) params.set("title", options.title);
  for (const tag of options.includedTags ?? []) params.append("includedTags[]", tag);
  for (const tag of options.excludedTags ?? []) params.append("excludedTags[]", tag);
  if (options.includedTagsMode) params.set("includedTagsMode", options.includedTagsMode);
  if (options.excludedTagsMode) params.set("excludedTagsMode", options.excludedTagsMode);
  for (const d of options.publicationDemographic ?? []) params.append("publicationDemographic[]", d);
  for (const s of options.status ?? []) params.append("status[]", s);
  for (const c of options.contentRating ?? ["safe", "suggestive"]) params.append("contentRating[]", c);
  for (const [field, dir] of Object.entries(options.order ?? {})) {
    params.set(`order[${field}]`, dir);
  }
  params.set("includes[]", "cover_art");
  params.set("limit", String(options.limit ?? 10));
  params.set("offset", String(options.offset ?? 0));
  return params;
}
```

### 5.4 Tag Mode Behavior

| Mode | API Param | Meaning |
|------|-----------|---------|
| AND | `includedTagsMode=AND` | Manga must have **all** included tags |
| OR | `includedTagsMode=OR` | Manga must have **at least one** included tag |

Same logic applies to `excludedTagsMode`.

---

## 6. Formatting

### 6.1 Design Principles (same pattern as MAL MCP)

- **Human-readable text output** - no JSON dumped to the user.
- **Consistent indentation** - 2-space hanging indents for sub-fields.
- **Consistent separators** - `═` or `─` lines to delimit sections.
- **Pagination hints** - always indicate if more results are available and provide the exact next offset.
- **Score formatting** - `★ 8.72` pattern.
- **Date formatting** - ISO dates trimmed to `YYYY-MM-DD` for readability.

### 6.2 Formatter Functions

Each formatter lives in `src/format.ts`:

```typescript
export function formatMangaList(
  items: MdManga[],
  options: { nextOffset?: number; total?: number }
): string;

export function formatMangaDetails(manga: MdManga): string;

export function formatCoverList(covers: MdCover[], mangaId: string): string;

export function formatTagList(tags: MdTag[]): string;
```

### 6.3 Pagination Hints

```typescript
function paginationHint(options: { nextOffset?: number; total?: number; returned: number }): string {
  const parts: string[] = [];
  if (options.total !== undefined) {
    parts.push(`Showing ${options.returned} of ${options.total} results.`);
  }
  if (options.nextOffset !== undefined) {
    parts.push(`More available - use offset=${options.nextOffset} to continue.`);
  }
  return parts.length > 0 ? `\n${parts.join(" ")}` : "";
}
```

---

## 7. Error Handling

### 7.1 Error Classification

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 400 | Bad Request | Return MCP error with API detail |
| 401 | Unauthorized | Trigger token refresh → retry once. If still 401, return auth error. |
| 403 | Forbidden | Return MCP error (insufficient permissions) |
| 404 | Not Found | Return "Resource not found" |
| 429 | Too Many Requests | Exponential backoff (1s, 2s, 4s) then retry. Max 3 retries. |
| 500+ | Server Error | Retry once after 2s, then return error. |
| Network | DNS/timeout | Retry once after 3s, then return error. |

### 7.2 Token Refresh + Retry Pattern

```typescript
async function requestWithAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
  await this.ensureTokenValid();

  try {
    return await this.rawRequest<T>(path, options);
  } catch (error) {
    if (error instanceof MangaDexApiError && error.status === 401) {
      await this.refreshToken();
      return await this.rawRequest<T>(path, options); // retry once
    }
    throw error;
  }
}
```

### 7.3 MCP Error Format

All tool handlers wrap execution in `handleToolError`:

```typescript
function toolResult(text: string, isError: boolean = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

async function handleToolError(fn: () => Promise<string>): Promise<ReturnType<typeof toolResult>> {
  try {
    const text = await fn();
    return toolResult(text);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return toolResult(`Error: ${message}`, true);
  }
}
```

---

## 8. Rate Limiting & Caching

### 8.1 Request Throttling

MangaDex does not publish hard rate limits, but conservative behavior is required.

| Rule | Value |
|------|-------|
| Max concurrent requests | **2** |
| Request spacing | **100ms** minimum between requests |
| Max sustained rate | **5 requests / second** |
| Burst allowance | 5 requests, then spacing enforced |

**Implementation:** Use a simple promise queue in `MangaDexApiClient`:

```typescript
private lastRequestTime = 0;
private readonly minSpacingMs = 100;

private async throttle(): Promise<void> {
  const now = Date.now();
  const wait = this.lastRequestTime + this.minSpacingMs - now;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  this.lastRequestTime = Date.now();
}
```

### 8.2 Caching Strategy

| Cache | Lifetime | Key |
|-------|----------|-----|
| Tag UUIDs | **Session** (loaded once at startup) | N/A |
| Cover URLs | **1 hour** | `cover:{mangaId}:{coverId}` |
| Manga details | **5 minutes** | `manga:{mangaId}` |

**Implementation:** Simple in-memory `Map` with TTL. No disk persistence.

```typescript
class TimedCache<T> {
  private store = new Map<string, { value: T; expiry: number }>();
  get(key: string): T | undefined { /* ... */ }
  set(key: string, value: T, ttlMs: number): void { /* ... */ }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests (Mocked)

**Framework:** Vitest (recommended) or Node.js built-in test runner.

**Coverage targets:**
- Tag name resolution (normalize casing, unknown tags)
- Query parameter builder (arrays, nested order objects)
- All formatters (empty input, long text, multi-language titles)
- Token expiry math (refresh triggered correctly)
- Rate limiter spacing

**Mock fixtures:**
```typescript
// tests/fixtures/manga.ts
export const mockManga: MdManga = {
  id: "a77742b1-befd-49a8-b599-2214b7a80289",
  type: "manga",
  attributes: { /* ... */ },
  relationships: [
    { id: "author-uuid", type: "author", attributes: { name: "Fujimoto Tatsuki" } },
    { id: "cover-uuid", type: "cover_art", attributes: { fileName: "cover.png" } },
  ],
};
```

### 9.2 Integration Tests (Live API)

**Rules:**
1. Use a **dedicated test account** with safe-rated manga only.
2. Keep request rate very low (≤ 1 req/sec during tests).
3. Run against real endpoints:
   - `GET /manga` with `title="One Piece"`
   - `GET /manga/{id}` with cover expansion
   - `GET /user/follows/manga` (auth test)
4. Skip integration tests in CI unless `MANGADEX_TEST_USERNAME` is set.

### 9.3 Test File Layout

```
tests/
├── unit/
│   ├── filters.test.ts
│   ├── format.test.ts
│   ├── client.test.ts
│   └── auth.test.ts
├── integration/
│   ├── search.test.ts
│   └── user-list.test.ts
└── fixtures/
    ├── manga.ts
    ├── chapter.ts
    └── tag.ts
```

---

## 10. Future Extensions

These are **out of scope for v1.0** but documented for roadmap planning.

| Feature | Description | API Endpoint | Deferred From |
|---------|-------------|--------------|---------------|
| **Chapter Feed** *(v1.1)* | List chapters for a manga, filtered by language and scanlation group. | `GET /manga/{id}/feed` | `get_chapters` |
| **Reading Status Writes** *(v1.1)* | Set or clear manga reading status for the authenticated user. Gated by `confirm_write`. | `POST /manga/{id}/status` | `update_reading_status` |
| **Tag-Only Discovery** *(v1.1)* | Browse manga by tag combinations without a title query. | `GET /manga` (no `title`) | `search_by_tag` |
| **Recent Updates** *(v1.1)* | Fetch manga with the most recent chapter uploads across the platform. | `GET /manga` with `order[latestUploadedChapter]=desc` | `get_recent_updates` |
| **Public OAuth Clients** | Support `authorization_code` grant for multi-user servers. Requires redirect URI handling. | `auth.mangadex.org` | - |
| **Chapter Reading Progress** | Track per-chapter read/unread status. | `POST /chapter/{id}/read` | - |
| **Scanlation Group Details** | Show group info in chapter listings. | `GET /group/{id}` + `includes[]=scanlation_group` | - |
| **Custom Lists (MDLists)** *(v1.1)* | Create, update, and manage user-created manga lists. | `GET/POST/PUT /list` | - |
| **Offline Sync** | Queue reading status changes when offline, sync on reconnect. | N/A (client feature) | - |
| **Image Proxy / At-Home** | Generate chapter image URLs and optionally proxy them. | `GET /at-home/server/{chapterId}` | - |
| **MangaDex@Home Reporting** | Report image load success/failure for CDN health. | `POST https://api.mangadex.network/report` | - |
| **Aggregate Endpoints** | Use `/manga/{id}/aggregate` for volume/chapter grouping. | `GET /manga/{id}/aggregate` | - |

---

## Appendix A: Endpoint-to-Tool Mapping (v1.0)

| Tool | HTTP Method | Endpoint | Auth | Key Params |
|------|-------------|----------|------|------------|
| `search_manga` | GET | `/manga` | Optional | `title`, `includedTags[]`, `excludedTags[]`, `order[]` |
| `get_manga_details` | GET | `/manga/{id}` | No | `includes[]=author&includes[]=artist&includes[]=cover_art` |
| `get_user_reading_list` | GET | `/user/follows/manga` | **Yes** | `includes[]=cover_art` |
| `get_cover_art` | GET | `/cover?manga[]={id}` | No | - |
| *(internal)* | GET | `/manga/tag` | No | Used at startup to populate tag cache |
| *(internal)* | POST | `/realms/mangadex/protocol/openid-connect/token` | No | `grant_type=password` or `refresh_token` |

### Deferred to v1.1

| Tool | HTTP Method | Endpoint | Auth | Key Params |
|------|-------------|----------|------|------------|
| `get_chapters` | GET | `/manga/{id}/feed` | No | `translatedLanguage[]`, `order[volume]`, `order[chapter]` |
| `update_reading_status` | POST | `/manga/{id}/status` | **Yes** | JSON body `{ status }` |
| `search_by_tag` | GET | `/manga` | Optional | `includedTags[]` (no `title`) |
| `get_recent_updates` | GET | `/manga` | No | `order[latestUploadedChapter]=desc` |

---

## Appendix B: Comparison with MAL MCP

| Aspect | MAL MCP (`mal-mcp-server`) | MangaDex MCP (this spec) |
|--------|---------------------------|--------------------------|
| **Auth** | Client ID header only (no user auth) | OAuth2 password grant + refresh tokens |
| **User data** | Read-only public data | Read-only follows list (write deferred to v1.1) |
| **Filtering** | Client-side scan up to 500 results | **Native server-side** filtering (tags, demographics, status, content rating) |
| **Tag system** | Genre names matched client-side | Tag UUIDs resolved via cached API map |
| **Multi-language** | Single title + alt titles | `Record<string, string>` titles/descriptions per language |
| **Cover art** | Single `main_picture` URL | Multiple covers per manga, thumbnail sizes (256/512) |
| **Rate limiting** | Unenforced | Enforced: 2 concurrent, 100ms spacing, 5 req/sec |
| **Chapter data** | Not available | Deferred to v1.1 (`get_chapters`) |
| **Content rating** | `nsfw` boolean | Granular: `safe`, `suggestive`, `erotica`, `pornographic` |
| **Manga UUIDs** | Integer IDs | **UUID v4** strings |
| **Relationship model** | Flat nested objects | `relationships[]` array with optional inline attributes |

---

## Appendix C: File Structure

```
mangadex-mcp-server/
├── src/
│   ├── index.ts          # Entry point, tool registration, server bootstrap
│   ├── client.ts         # MangaDexApiClient, auth, HTTP, rate limiting, caching
│   ├── filters.ts        # TagCache, query param builder, search options types
│   ├── format.ts         # All human-readable formatters
│   └── types.ts          # TypeScript interfaces for all API entities
├── tests/
│   ├── unit/
│   └── integration/
│   └── fixtures/
├── package.json
├── tsconfig.json
└── README.md
```

### package.json (v1.0)

```json
{
  "name": "mangadex-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for MangaDex - search, read, and manage manga",
  "type": "module",
  "main": "dist/index.js",
  "bin": { "mangadex-mcp-server": "dist/index.js" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "vitest"
  },
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0"
  }
}
```

---

## Appendix D: Key Code Snippets

### D.1 Auth-Aware Request Method

```typescript
// src/client.ts
export class MangaDexApiClient {
  private token?: { access: string; refresh: string; expiresAt: number };
  private tagCache = new TagCache();
  private cache = new TimedCache<unknown>();
  private lastRequestTime = 0;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private username: string,
    private password: string,
  ) {}

  async login(): Promise<void> {
    const data = await this.tokenRequest({
      grant_type: "password",
      username: this.username,
      password: this.password,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    this.setToken(data);
  }

  async refreshToken(): Promise<void> {
    if (!this.token) throw new Error("No refresh token available");
    const data = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: this.token.refresh,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    this.setToken(data);
  }

  private setToken(data: MdTokenResponse): void {
    this.token = {
      access: data.access_token,
      refresh: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60000, // 1 min buffer
    };
  }

  async ensureTokenValid(): Promise<void> {
    if (!this.token) await this.login();
    else if (Date.now() >= this.token.expiresAt) await this.refreshToken();
  }

  private async tokenRequest(body: Record<string, string>): Promise<MdTokenResponse> {
    const response = await fetch(
      "https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      }
    );
    if (!response.ok) throw new Error(`Auth failed: ${response.status}`);
    return response.json();
  }
}
```

### D.2 Tool Registration Pattern (from MAL, adapted)

```typescript
// src/index.ts
server.registerTool(
  "search_manga",
  {
    title: "Search Manga on MangaDex",
    description: `Search for manga by title/keywords...`,
    inputSchema: {
      title: z.string().min(2).max(200).optional().describe("Search text"),
      limit: z.number().int().min(1).max(100).default(10),
      offset: z.number().int().min(0).default(0),
      includedTags: z.array(z.string()).optional(),
      excludedTags: z.array(z.string()).optional(),
      includedTagsMode: z.enum(["AND", "OR"]).default("OR"),
      excludedTagsMode: z.enum(["AND", "OR"]).default("OR"),
      contentRating: z.array(z.enum(["safe", "suggestive", "erotica", "pornographic"])).default(["safe", "suggestive"]),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async (args) => {
    return handleToolError(async () => {
      const { items, total, nextOffset } = await client.searchManga(args);
      return formatMangaList(items, { total, nextOffset });
    });
  },
);
```

### D.3 Cover URL Builder

```typescript
function buildCoverUrl(mangaId: string, filename: string, size?: "256" | "512"): string {
  const base = `https://uploads.mangadex.org/covers/${mangaId}/${filename}`;
  if (size === "256") return `${base}.256.jpg`;
  if (size === "512") return `${base}.512.jpg`;
  return base;
}
```

### D.4 Reference Extraction from Relationships

```typescript
function getRelated<T extends { id: string; type: string; attributes?: Record<string, unknown> }>(
  manga: MdManga,
  type: string,
): T[] {
  return manga.relationships.filter((r) => r.type === type) as T[];
}

function getCoverFilename(manga: MdManga): string | undefined {
  const cover = getRelated<MdCover>(manga, "cover_art")[0];
  return cover?.attributes?.fileName as string | undefined;
}
```

---

## Implementation Checklist

- [ ] `src/types.ts` — all interfaces defined
- [ ] `src/client.ts` — `MangaDexApiClient` with auth, rate limiting, caching
- [ ] `src/filters.ts` — `TagCache`, param builder, tag resolution
- [ ] `src/format.ts` — formatters for all 4 core tools
- [ ] `src/index.ts` — tool registration (4 tools), env validation, server bootstrap
- [ ] Unit tests for filters, format, auth
- [ ] Integration tests against live API (safe manga only)
- [ ] `README.md` — setup instructions, env var table, tool list
- [ ] `package.json` — scripts, dependencies, bin entry
- [ ] Verify no tokens are persisted to disk
- [ ] Verify auth headers are NOT sent to uploads.mangadex.org

---

*End of specification.*
