// ─── MangaDex API Response Wrappers ───
// ─── Type Guards ───
export function isMdError(response) {
    return (typeof response === "object" &&
        response !== null &&
        response.result === "error");
}
//# sourceMappingURL=types.js.map