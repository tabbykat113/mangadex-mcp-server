import { describe, it, expect, beforeAll } from "vitest";
import { MangaDexApiClient } from "../../src/client.js";

describe("Integration: get_user_reading_list", () => {
  let client: MangaDexApiClient;

  beforeAll(() => {
    const clientId = process.env.MANGADEX_CLIENT_ID;
    const clientSecret = process.env.MANGADEX_CLIENT_SECRET;
    const username = process.env.MANGADEX_USERNAME;
    const password = process.env.MANGADEX_PASSWORD;

    if (!clientId || !clientSecret || !username || !password) {
      console.log("No auth credentials — skipping user list integration tests");
      return;
    }

    client = new MangaDexApiClient(clientId, clientSecret, username, password);
  });

  it("fetches the user reading list when authenticated", async () => {
    if (!client) {
      console.log("Skipping — no auth credentials");
      return;
    }

    const result = await client.getUserReadingList({ limit: 10 });
    // Should succeed even if list is empty
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});
