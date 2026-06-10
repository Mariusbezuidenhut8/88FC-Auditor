import type { Handler } from "@netlify/functions";

const SUPABASE_URL = "https://fqelmxzyyzuoilxgyqjf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWxteHp5eXp1b2lseGd5cWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNjY5NjIsImV4cCI6MjA5NjY0Mjk2Mn0.bES-bP-C28I_J2QqYj3J5vrkfSz2DNi7U3bms0pbtTo";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let codes: unknown;
  try {
    codes = event.body ? JSON.parse(event.body) : null;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!Array.isArray(codes)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Expected an array of access codes" }) };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_data`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        // Upsert: insert or update if key already exists
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        key: "access_codes",
        value: codes,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Supabase error: ${text}` }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
