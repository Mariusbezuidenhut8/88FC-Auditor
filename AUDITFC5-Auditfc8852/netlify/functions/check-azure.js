export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT || "MISSING",
      apiKey: process.env.AZURE_OPENAI_API_KEY ? "OK" : "MISSING",
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "MISSING",
      version: process.env.AZURE_OPENAI_API_VERSION || "MISSING",
    }),
  };
}


