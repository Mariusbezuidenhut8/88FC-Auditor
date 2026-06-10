import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const store = getStore({ name: "access-codes", consistency: "strong" });
    const codesJson = await store.get("codes");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      // null means "no data stored yet" — client will use localStorage fallback
      body: codesJson ?? "null",
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
