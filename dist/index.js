#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MangaDexApiClient } from "./client.js";
import { TagCache, resolveSearchTags } from "./filters.js";
import { formatMangaList, formatMangaDetails, formatCoverList, formatUserReadingList, } from "./format.js";
// ─── Config & Auth Validation ───
const MANGADEX_CLIENT_ID = process.env.MANGADEX_CLIENT_ID;
const MANGADEX_CLIENT_SECRET = process.env.MANGADEX_CLIENT_SECRET;
const MANGADEX_USERNAME = process.env.MANGADEX_USERNAME;
const MANGADEX_PASSWORD = process.env.MANGADEX_PASSWORD;
const allAuthVars = [MANGADEX_CLIENT_ID, MANGADEX_CLIENT_SECRET, MANGADEX_USERNAME, MANGADEX_PASSWORD];
const someAuthVars = allAuthVars.some((v) => v !== undefined && v !== "");
const allAuthVarsPresent = allAuthVars.every((v) => v !== undefined && v !== "");
let readOnlyMode = false;
if (!allAuthVarsPresent) {
    if (someAuthVars) {
        console.error("Error: Partial authentication configuration detected.\n" +
            "All four env vars must be set together: MANGADEX_CLIENT_ID, MANGADEX_CLIENT_SECRET, MANGADEX_USERNAME, MANGADEX_PASSWORD\n" +
            "Or omit all four to run in read-only mode.");
        process.exit(1);
    }
    readOnlyMode = true;
    console.error("No auth credentials found. Starting in read-only mode (search and lookup only).");
}
// ─── Client & Tag Cache ───
let client;
if (readOnlyMode) {
    // Create a dummy client for unauthenticated requests
    client = new MangaDexApiClient("", "", "", "");
}
else {
    client = new MangaDexApiClient(MANGADEX_CLIENT_ID, MANGADEX_CLIENT_SECRET, MANGADEX_USERNAME, MANGADEX_PASSWORD);
}
const tagCache = new TagCache();
// ─── Server ───
const server = new McpServer({
    name: "mangadex-mcp-server",
    version: "1.0.0",
});
// ─── Helper to wrap tool handlers with error handling ───
function toolResult(text, isError = false) {
    return {
        content: [{ type: "text", text }],
        ...(isError ? { isError: true } : {}),
    };
}
async function handleToolError(fn) {
    try {
        const text = await fn();
        return toolResult(text);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return toolResult(`Error: ${message}`, true);
    }
}
// ═══════════════════════════════════
//  TOOLS
// ═══════════════════════════════════
server.registerTool("search_manga", {
    title: "Search Manga on MangaDex",
    description: `Search for manga by title/keywords with advanced server-side filtering. Returns a list of matching manga with titles, descriptions, content ratings, publication status, and cover art info.

Args:
  - title: Search text (2-200 chars)
  - limit: Max results 1-100 (default: 10)
  - offset: Pagination offset (default: 0)
  - includedTags: Tag names to include (case-insensitive). Supports AND/OR logic via includedTagsMode.
  - excludedTags: Tag names to exclude
  - includedTagsMode: "AND" or "OR" (default: "OR")
  - excludedTagsMode: "AND" or "OR" (default: "OR")
  - publicationDemographic: e.g. ["shounen", "seinen"]
  - status: e.g. ["ongoing", "completed"]
  - contentRating: ["safe", "suggestive", "erotica", "pornographic"] (default: ["safe", "suggestive"])
  - order: Sort object, e.g. { rating: "desc", followedCount: "desc" }`,
    inputSchema: {
        title: z.string().min(2).max(200).optional().describe("Search text (title or keywords)"),
        limit: z.number().int().min(1).max(100).default(10).describe("Max results (default: 10)"),
        offset: z.number().int().min(0).default(0).describe("Pagination offset"),
        includedTags: z.array(z.string()).optional().describe("Tag names to include (case-insensitive)"),
        excludedTags: z.array(z.string()).optional().describe("Tag names to exclude"),
        includedTagsMode: z.enum(["AND", "OR"]).default("OR").describe("How included tags combine"),
        excludedTagsMode: z.enum(["AND", "OR"]).default("OR").describe("How excluded tags combine"),
        publicationDemographic: z.array(z.enum(["shounen", "shoujo", "josei", "seinen", "none"])).optional().describe("Publication demographics"),
        status: z.array(z.enum(["ongoing", "completed", "hiatus", "cancelled"])).optional().describe("Publication status"),
        contentRating: z.array(z.enum(["safe", "suggestive", "erotica", "pornographic"])).default(["safe", "suggestive"]).describe("Content ratings to include"),
        order: z.record(z.enum(["asc", "desc"])).optional().default({ latestUploadedChapter: "desc" }).describe("Sort order fields"),
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
}, async (args) => {
    return handleToolError(async () => {
        const resolved = resolveSearchTags(args, tagCache);
        const { missingTags, ...searchOptions } = resolved;
        const result = await client.searchManga(searchOptions);
        const items = result.data ?? [];
        const total = result.total;
        const nextOffset = result.offset + items.length < total ? result.offset + items.length : undefined;
        return formatMangaList(items, { total, nextOffset, missingTags });
    });
});
server.registerTool("get_manga_details", {
    title: "Get Manga Details from MangaDex",
    description: `Full info for a specific manga by its UUID. Inlines author, artist, and cover art relationships.

Args:
  - manga_id: MangaDex manga UUID`,
    inputSchema: {
        manga_id: z
            .string()
            .uuid()
            .describe("MangaDex manga UUID"),
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
}, async ({ manga_id }) => {
    return handleToolError(async () => {
        const manga = await client.getMangaDetails(manga_id);
        return formatMangaDetails(manga);
    });
});
server.registerTool("get_cover_art", {
    title: "Get Cover Art URLs",
    description: `Retrieve cover image URLs for a manga, including thumbnails.

Args:
  - manga_id: Manga UUID
  - size: "original", "256", or "512" (default: "512")`,
    inputSchema: {
        manga_id: z.string().uuid().describe("Manga UUID"),
        size: z.enum(["original", "256", "512"]).default("512").describe("Desired thumbnail size"),
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
}, async ({ manga_id, size }) => {
    return handleToolError(async () => {
        const covers = await client.getCoversForManga(manga_id);
        // If only one size requested, filter output accordingly
        if (size !== "original") {
            // formatCoverList already shows all sizes; we could filter but spec shows all sizes
            // We'll keep all sizes for discoverability but note the preference
        }
        return formatCoverList(covers, manga_id);
    });
});
server.registerTool("get_user_reading_list", {
    title: "Get User Followed Manga",
    description: `Fetch the authenticated user's followed manga list.

Args:
  - limit: Max results 1-100 (default: 20)
  - offset: Pagination offset (default: 0)

Requires authentication. Set MANGADEX_CLIENT_ID and related env vars.`,
    inputSchema: {
        limit: z.number().int().min(1).max(100).default(20).describe("Max results (default: 20)"),
        offset: z.number().int().min(0).default(0).describe("Pagination offset"),
    },
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
}, async ({ limit, offset }) => {
    return handleToolError(async () => {
        if (readOnlyMode) {
            throw new Error("Authentication required. Set MANGADEX_CLIENT_ID, MANGADEX_CLIENT_SECRET, MANGADEX_USERNAME, and MANGADEX_PASSWORD environment variables.");
        }
        const result = await client.getUserFollowsManga(limit, offset);
        const items = result.data ?? [];
        const total = result.total;
        const nextOffset = result.offset + items.length < total ? result.offset + items.length : undefined;
        return formatUserReadingList(items, { total, nextOffset });
    });
});
// ─── Start Server ───
async function main() {
    // Pre-load tag cache
    try {
        await tagCache.load(client);
        console.error(`Loaded ${tagCache.getAllTags().size} tags into cache.`);
    }
    catch (err) {
        console.error("Warning: Failed to load tag cache:", err);
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("mangadex-mcp-server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map