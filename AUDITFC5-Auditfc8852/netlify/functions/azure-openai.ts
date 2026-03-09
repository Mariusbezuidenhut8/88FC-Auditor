import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview";

  console.log("Endpoint exists:", !!endpoint);
  console.log("API key exists:", !!apiKey);
  console.log("Deployment exists:", !!deployment);
  console.log("API version:", apiVersion);

  if (!endpoint || !apiKey || !deployment) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "AZURE_OPENAI_ENV_VARS_MISSING" }),
    };
  }

  // Parse body safely
  let payload: any;
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "INVALID_JSON_BODY",
        details: String(e),
        received: event.body?.slice(0, 500) ?? null,
      }),
    };
  }

  if (!Array.isArray(payload.messages)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing 'messages' array" }),
    };
  }

  const url =
    `${endpoint.replace(/\/$/, "")}` +
    `/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  // Prevent hanging
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        messages: payload.messages,
        temperature: 0.2,
        // max_tokens: 300, // optional
      }),
      signal: controller.signal,
    });

    const text = await resp.text();

    // Try JSON, but don't fail if Azure returns non-JSON
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return {
      statusCode: resp.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Upstream timeout calling Azure OpenAI"
        : err?.message || String(err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: msg }),
    };
  } finally {
    clearTimeout(timeout);
  }
};

