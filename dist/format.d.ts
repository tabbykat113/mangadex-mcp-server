import { MdManga, MdCover, MdTag } from "./types.js";
export declare function formatMangaList(items: MdManga[], options?: {
    nextOffset?: number;
    total?: number;
    missingTags?: string[];
}): string;
export declare function formatMangaDetails(manga: MdManga): string;
export declare function formatCoverList(covers: MdCover[], mangaId: string, mangaTitle?: string): string;
export declare function formatTagList(tags: MdTag[]): string;
export declare function formatUserReadingList(items: MdManga[], options?: {
    nextOffset?: number;
    total?: number;
}): string;
//# sourceMappingURL=format.d.ts.map