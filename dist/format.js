import { buildCoverUrl, getRelated, getCoverFilename } from "./client.js";
// ─── Helpers ───
function getPrimaryTitle(manga) {
    const attrs = manga.attributes;
    return (attrs.title["en"] ??
        attrs.title[attrs.originalLanguage] ??
        Object.values(attrs.title)[0] ??
        "Untitled");
}
function getAltTitles(manga) {
    const primary = getPrimaryTitle(manga);
    const seen = new Set([primary.toLowerCase()]);
    const results = [];
    for (const alt of manga.attributes.altTitles) {
        for (const [locale, title] of Object.entries(alt)) {
            const lower = title.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                results.push(`${locale}: ${title}`);
            }
        }
    }
    return results;
}
function getDescription(manga) {
    const desc = manga.attributes.description;
    return desc["en"] ?? Object.values(desc)[0] ?? "No description available.";
}
function getTagNames(manga) {
    return manga.attributes.tags
        .map((t) => t.attributes.name["en"] ?? Object.values(t.attributes.name)[0])
        .filter(Boolean);
}
function formatDate(iso) {
    if (!iso)
        return "?";
    try {
        return iso.slice(0, 10);
    }
    catch {
        return iso;
    }
}
function formatRating(rating) {
    if (rating == null)
        return "N/A";
    return `★ ${rating.toFixed(2)}`;
}
function paginationHint(options) {
    const parts = [];
    if (options.total !== undefined) {
        parts.push(`Showing ${options.returned} of ${options.total} results.`);
    }
    if (options.nextOffset !== undefined) {
        parts.push(`More available - use offset=${options.nextOffset} to continue.`);
    }
    return parts.length > 0 ? `\n${parts.join(" ")}` : "";
}
// ─── Manga List Formatter ───
export function formatMangaList(items, options = {}) {
    if (items.length === 0) {
        return "No manga found.";
    }
    const lines = [];
    for (let i = 0; i < items.length; i++) {
        const manga = items[i];
        const title = getPrimaryTitle(manga);
        const attrs = manga.attributes;
        const coverFilename = getCoverFilename(manga);
        const coverUrl = coverFilename
            ? buildCoverUrl(manga.id, coverFilename, "256")
            : undefined;
        const tagNames = getTagNames(manga);
        lines.push(`${i + 1}. ${title}`);
        lines.push(`   ID: ${manga.id} | Content: ${attrs.contentRating} | Status: ${attrs.status}`);
        lines.push(`   Demographic: ${attrs.publicationDemographic ?? "none"} | Year: ${attrs.year ?? "?"}`);
        if (tagNames.length > 0) {
            lines.push(`   Tags: ${tagNames.join(", ")}`);
        }
        if (coverUrl) {
            lines.push(`   Cover: ${coverUrl}`);
        }
        lines.push(`   https://mangadex.org/title/${manga.id}`);
        lines.push("");
    }
    lines.push(paginationHint({ nextOffset: options.nextOffset, total: options.total, returned: items.length }));
    if (options.missingTags && options.missingTags.length > 0) {
        lines.push(`\n⚠ Unknown tags ignored: ${options.missingTags.join(", ")}`);
    }
    return lines.join("\n").trim();
}
// ─── Manga Details Formatter ───
export function formatMangaDetails(manga) {
    const title = getPrimaryTitle(manga);
    const attrs = manga.attributes;
    const altTitles = getAltTitles(manga);
    const description = getDescription(manga);
    const tagNames = getTagNames(manga);
    const authors = getRelated(manga, "author");
    const artists = getRelated(manga, "artist");
    const authorNames = new Map();
    for (const a of authors) {
        const name = a.attributes?.name ?? a.id;
        const roles = authorNames.get(name) ?? [];
        roles.push("author");
        authorNames.set(name, roles);
    }
    for (const a of artists) {
        const name = a.attributes?.name ?? a.id;
        const roles = authorNames.get(name) ?? [];
        roles.push("artist");
        authorNames.set(name, roles);
    }
    const coverFilename = getCoverFilename(manga);
    const coverUrl = coverFilename
        ? buildCoverUrl(manga.id, coverFilename, "512")
        : undefined;
    const lines = [];
    lines.push(title);
    lines.push("═".repeat(Math.min(50, title.length + 10)));
    lines.push(`MangaDex ID: ${manga.id}`);
    lines.push(`URL: https://mangadex.org/title/${manga.id}`);
    lines.push("");
    if (altTitles.length > 0) {
        lines.push("Alt Titles:");
        for (const alt of altTitles.slice(0, 10)) {
            lines.push(`  ${alt}`);
        }
        if (altTitles.length > 10) {
            lines.push(`  ... and ${altTitles.length - 10} more`);
        }
        lines.push("");
    }
    lines.push("Description:");
    lines.push(description);
    lines.push("");
    lines.push(`Content Rating: ${attrs.contentRating}`);
    lines.push(`Publication: ${attrs.publicationDemographic ?? "none"} | Status: ${attrs.status}`);
    lines.push(`Year: ${attrs.year ?? "?"} → ${attrs.lastVolume ? `Vol. ${attrs.lastVolume}` : "?"}`);
    lines.push("");
    if (authorNames.size > 0) {
        lines.push("Authors:");
        for (const [name, roles] of authorNames) {
            lines.push(`  ${name} (${roles.join(", ")})`);
        }
        lines.push("");
    }
    if (tagNames.length > 0) {
        lines.push(`Tags: ${tagNames.join(", ")}`);
        lines.push("");
    }
    if (coverUrl) {
        lines.push(`Cover: ${coverUrl}`);
        lines.push("");
    }
    if (attrs.links) {
        const linkParts = [];
        for (const [key, value] of Object.entries(attrs.links)) {
            linkParts.push(`${key.toUpperCase()}: ${value}`);
        }
        if (linkParts.length > 0) {
            lines.push(`Links: ${linkParts.join(" | ")}`);
        }
    }
    return lines.join("\n").trim();
}
// ─── Cover Art Formatter ───
export function formatCoverList(covers, mangaId, mangaTitle) {
    if (covers.length === 0) {
        return "No cover art found for this manga.";
    }
    const lines = [];
    const title = mangaTitle ?? "Manga";
    lines.push(`Cover Art for "${title}"`);
    lines.push("─".repeat(30));
    lines.push("");
    for (const cover of covers) {
        const attrs = cover.attributes;
        const vol = attrs.volume ?? "N/A";
        lines.push(`Volume: ${vol} | Locale: ${attrs.locale}`);
        lines.push(`  Original: ${buildCoverUrl(mangaId, attrs.fileName)}`);
        lines.push(`  256px:    ${buildCoverUrl(mangaId, attrs.fileName, "256")}`);
        lines.push(`  512px:    ${buildCoverUrl(mangaId, attrs.fileName, "512")}`);
        lines.push("");
    }
    return lines.join("\n").trim();
}
// ─── Tag List Formatter ───
export function formatTagList(tags) {
    if (tags.length === 0)
        return "No tags available.";
    const byGroup = new Map();
    for (const tag of tags) {
        const name = tag.attributes.name["en"] ?? Object.values(tag.attributes.name)[0] ?? tag.id;
        const group = tag.attributes.group;
        const list = byGroup.get(group) ?? [];
        list.push(name);
        byGroup.set(group, list);
    }
    const lines = [];
    lines.push("Available Tags");
    lines.push("─".repeat(20));
    lines.push("");
    for (const [group, names] of byGroup) {
        lines.push(`${group.charAt(0).toUpperCase() + group.slice(1)}:`);
        lines.push(`  ${names.sort().join(", ")}`);
        lines.push("");
    }
    return lines.join("\n").trim();
}
// ─── User Reading List Formatter ───
export function formatUserReadingList(items, options = {}) {
    if (items.length === 0) {
        return "Your reading list is empty.";
    }
    const lines = [];
    lines.push("Your Followed Manga");
    lines.push("═".repeat(25));
    lines.push("");
    for (let i = 0; i < items.length; i++) {
        const manga = items[i];
        const title = getPrimaryTitle(manga);
        const attrs = manga.attributes;
        const coverFilename = getCoverFilename(manga);
        const coverUrl = coverFilename
            ? buildCoverUrl(manga.id, coverFilename, "256")
            : undefined;
        lines.push(`${i + 1}. ${title}`);
        lines.push(`   Status: ${attrs.status} | Content: ${attrs.contentRating}`);
        if (coverUrl) {
            lines.push(`   Cover: ${coverUrl}`);
        }
        lines.push(`   https://mangadex.org/title/${manga.id}`);
        lines.push("");
    }
    lines.push(paginationHint({ nextOffset: options.nextOffset, total: options.total, returned: items.length }));
    return lines.join("\n").trim();
}
//# sourceMappingURL=format.js.map