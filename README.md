# MangaDex MCP Server

MCP server for [MangaDex](https://mangadex.org) — search, read, and manage manga.

## Tools

| Tool | Description | Auth |
|------|-------------|------|
| `search_manga` | Search by title with tag/demographic/status/content rating filters | Optional |
| `get_manga_details` | Full manga info with authors, artists, covers | No |
| `get_cover_art` | Cover image URLs with thumbnail sizes (256/512) | No |
| `get_user_reading_list` | Authenticated user's followed manga | Yes |

## Setup

```bash
npm install
npm run build
```

### Authentication (optional)

Create `.env` from `.env.example` and fill in your MangaDex personal client credentials:

```bash
cp .env.example .env
# Edit .env with your credentials
```

Without auth, the server runs in **read-only mode** — search and lookup work, but user lists are unavailable.

## Usage

### With mcporter

```bash
mcporter config add mangadex --command "node /path/to/dist/index.js" --env MANGADEX_CLIENT_ID=... --env MANGADEX_CLIENT_SECRET=... --env MANGADEX_USERNAME=... --env MANGADEX_PASSWORD=...
mcporter call mangadex.search_manga title="One Piece" limit=5
```

### Standalone

```bash
# With auth (full features)
source .env && node dist/index.js

# Without auth (read-only)
node dist/index.js
```

## Testing

```bash
npm test        # 32 tests (28 unit + 4 integration)
npx tsc --noEmit # TypeScript type check
```

## Docs

- [`docs/specification.md`](docs/specification.md) — Full implementation spec (v1.0)
- [`docs/research.md`](docs/research.md) — API research and design notes
- [`AGENTS.md`](AGENTS.md) — Development philosophy and agent coordination

## Status

✅ v1.0 implemented — 4 core tools, 32 tests passing

## Deferred to v1.1

- Chapter feeds (`get_chapters`)
- Reading status writes (`update_reading_status`)
- Tag-only discovery (`search_by_tag`)
- Recent updates (`get_recent_updates`)

## License

MIT
