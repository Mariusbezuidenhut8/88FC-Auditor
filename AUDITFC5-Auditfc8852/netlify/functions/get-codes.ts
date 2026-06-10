import type { Handler } from "@netlify/functions";

const SUPABASE_URL = "https://fqelmxzyyzuoilxgyqjf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZWxteHp5eXp1b2lseGd5cWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNjY5NjIsImV4cCI6MjA5NjY0Mjk2Mn0.bES-bP-C28I_J2QqYj3J5vrkfSz2DNi7U3bms0pbtTo";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_data?key=eq.access_codes&select=value`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: `Supabase error: ${text}` }),
      };
    }

    const rows: { value: unknown }[] = await res.json();

    // rows is an array; we seeded one row so it should always have length 1
    const codes = rows.length > 0 ? rows[0].value : null;

    // Return null when the array is empty (no codes synced yet — client will use localStorage)
    const isEmpty = Array.isArray(codes) && codes.length === 0;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isEmpty ? null : codes),
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message || String(err) }),
    };
  }
};
