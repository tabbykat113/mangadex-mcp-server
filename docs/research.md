# MangaDex API Research Summary

Research conducted from https://api.mangadex.org/docs/ on 2026-04-30.

---

## 1) Authentication (Personal Clients & Tokens)

MangaDex uses **OAuth 2.0**. Two client types are planned; only **personal clients** are fully available today.

### Personal Clients (Password Grant)
- **Use case**: scripts or personal tools where only the owner’s account is used.
- **Registration**: Go to https://mangadex.org/settings (while logged in) → API Clients section. Request a personal client; it may be auto-approved or require staff approval.
- **Credentials**:
  - `client_id`: displayed as `personal-client-...`
  - `client_secret`: revealed once via a **Get Secret** button. Treat it as a password—never share it.

### Getting Tokens
Send an **HTTP form** (`application/x-www-form-urlencoded`) to:
```
POST https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token
```
Fields:
- `grant_type=password`
- `username=<your_username>`
- `password=<your_password>`
- `client_id=<your_client_id>`
- `client_secret=<your_client_secret>`

Response JSON:
```json
{
  "access_token": "...",
  "refresh_token": "..."
}
```

### Token Usage & Lifetime
- `access_token`: authenticates API requests. Valid for **15 minutes**.
- `refresh_token`: used to obtain a new `access_token` without re-logging in.
- Pass the token in the `Authorization: Bearer <token>` header.

### Refreshing Tokens
```
POST https://auth.mangadex.org/realms/mangadex/protocol/openid-connect/token
```
Fields:
- `grant_type=refresh_token`
- `refresh_token=<your_refresh_token>`
- `client_id=<your_client_id>`
- `client_secret=<your_client_secret>`

### Security Notes
- **Do not** send `Authorization` headers to any domain other than `{api, auth}.mangadex.org`.
- **Never** send auth headers to `*.mangadex.network` or `uploads.mangadex.org` (image/CDN domains).
- Authenticated requests are **not cached**, so only send the header when required.

---

## 2) Key Endpoints for Manga Search & Details

Base API URL: `https://api.mangadex.org`

### Search Manga
```
GET /manga
```
Common query parameters:
- `title=<search_string>` — basic title search.
- `includedTags[]=<uuid>` / `excludedTags[]=<uuid>` — filter by tags. Tag UUIDs come from `GET /manga/tag`.
- `publicationDemographic[]=<value>` — e.g. `shounen`, `seinen`, `shoujo`, `josei`.
- `status[]=<value>` — e.g. `ongoing`, `completed`, `hiatus`, `cancelled`.
- `contentRating[]=<value>` — e.g. `safe`, `suggestive`, `erotica`, `pornographic`.
- `order[<field>]=asc|desc` — sorting. Example: `order[rating]=desc`, `order[followedCount]=desc`.

### Get Manga Details
```
GET /manga/{id}
```

### Reference Expansion
Many endpoints support `includes[]` to inline relationship data (reducing extra requests):
```
GET /manga/{id}?includes[]=author&includes[]=artist&includes[]=cover_art
```
- Requires `*.view` permissions on the types being expanded.
- Guests have most permissions by default; logged-in users can check permissions via `GET /auth/check`.

---

## 3) Chapter Listing

### Manga Chapter Feed
List all chapters for a specific manga:
```
GET /manga/{id}/feed
```
- Default filter: `publishAt <= NOW()` (hides not-yet-published chapters).
- Common filters:
  - `translatedLanguage[]=<lang>` — e.g. `en`, `ja`.
  - `includeEmptyPages` — `1` (require empty pages), `0` (exclude them).
  - `includeFuturePublishAt` — `1` (only future), `0` (only past/present).
  - `includeExternalUrl` — `1` or `0`.

### Other Feed Endpoints
- `GET /user/follows/manga/feed` — chapters for manga the logged-in user follows (requires auth).
- `GET /list/{id}/feed` — chapters for a specific custom list.

### Retrieving Chapter Images
1. Get image delivery metadata:
```
GET /at-home/server/{chapterId}
```
Response provides:
- `baseUrl` — dynamically assigned CDN URL (geographically optimized).
- `chapter.hash` — chapter hash.
- `chapter.data` — array of original-quality filenames.
- `chapter.dataSaver` — array of compressed-quality filenames.

2. Construct image URLs:
```
{baseUrl}/{quality}/{chapterHash}/{filename}
```
- `quality` = `data` (original) or `data-saver` (compressed).
- **Base URLs are valid for ~15 minutes** (guaranteed minimum). Call `/at-home/server/{chapterId}` again if you get a 403.
- **Do NOT hardcode base URLs** and **do NOT send auth headers** when fetching images.

### MangaDex@Home Reporting
If an image request fails (or succeeds) from a base URL that does **not** contain `mangadex.org`, report it to help CDN health tracking:
```
POST https://api.mangadex.network/report
Content-Type: application/json
```
Body example:
```json
{
  "url": "https://.../data/{hash}/{filename}",
  "success": true,
  "bytes": 674687,
  "duration": 235,
  "cached": true
}
```

---

## 4) User Reading List Access

All following endpoints require authentication (`Authorization: Bearer <token>`).

### Reading Status
Set or update a manga’s reading status:
```
POST /manga/{id}/status
Content-Type: application/json
```
Body:
```json
{ "status": "reading" }
```
Allowed statuses: `reading`, `on_hold`, `dropped`, `plan_to_read`, `completed`, `re_reading`.

To **remove** a manga from the reading list, send `null`:
```json
{ "status": null }
```

Get a specific manga’s status:
```
GET /manga/{id}/status
```

Get **all** manga reading statuses for the logged-in user:
```
GET /manga/status
```

### Follows List
Follow a manga to receive updates:
```
POST /manga/{id}/follow
```

Get the logged-in user’s **followed manga list**:
```
GET /user/follows/manga
```

Check if a specific manga is followed:
```
GET /user/follows/manga/{id}
```

### Custom Lists
Create a custom list:
```
POST /list
```
Body:
```json
{
  "name": "My List",
  "visibility": "public"
}
```

Fetch a custom list:
```
GET /list/{id}
```

Update manga in a custom list (replace entire manga array):
```
PUT /list/{id}
```
Body:
```json
{
  "manga": ["uuid1", "uuid2"],
  "version": <current_version>
}
```
- You must fetch the list first to get the current `version` and existing manga IDs, modify locally, then `PUT` the full set back.

---

## 5) Cover Art URLs

### Direct URL Format
```
https://uploads.mangadex.org/covers/{manga-id}/{cover-filename}
```

### Thumbnails
Two pre-rendered thumbnail sizes are available by appending to the **full filename** (including its original extension):
- **256px**: `https://uploads.mangadex.org/covers/{manga-id}/{cover-filename}.256.jpg`
- **512px**: `https://uploads.mangadex.org/covers/{manga-id}/{cover-filename}.512.jpg`

Example:
- Original: `26dd2770-d383-42e9-a42b-32765a4d99c8.png`
- 256px thumb: `26dd2770-d383-42e9-a42b-32765a4d99c8.png.256.jpg`

### Finding the Cover Filename
1. **Main cover** (the one displayed on the site):
   - It exists in the manga’s `cover_art` relationship.
   - Use `includes[]=cover_art` when fetching the manga to inline the cover entity (including its `filename` attribute).
   - Or make a separate call to `GET /cover/{cover_id}`.

2. **All covers for a manga**:
   - Use the cover list endpoint:
   ```
   GET /cover?manga[]={manga-id}
   ```

---

## Quick Reference: Important Domains

| Purpose | Domain |
|---------|--------|
| API | `https://api.mangadex.org` |
| Auth (OAuth) | `https://auth.mangadex.org` |
| Image uploads / covers | `https://uploads.mangadex.org` |
| MangaDex@Home reports | `https://api.mangadex.network` |

---

*Sources: MangaDex API official docs (api.mangadex.org/docs), including Authentication, Manga Search, Chapter Feed, MDList, and Cover Art sections.*
