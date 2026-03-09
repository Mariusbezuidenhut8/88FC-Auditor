export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";

  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Reply with OK" }],
        max_tokens: 10,
      }),
    });

    const text = await r.text();
    return {
      statusCode: r.status,
      headers: { "Content-Type": "application/json" },
      body: text,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(e) }),
    };
  }
}

