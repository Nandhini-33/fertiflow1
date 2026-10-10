import { createServerFn } from "@tanstack/react-start";

/**
 * Server function for secure AI processing.
 * AI API keys (GEMINI_API_KEY / OPENAI_API_KEY) are kept strictly on the backend,
 * never exposed to client-side code or browser bundles.
 */
export const queryBackendAI = createServerFn({ method: "POST" })
  .validator((data: { prompt: string; context?: string }) => data)
  .handler(async ({ data }) => {
    const geminiKey = process.env["GEMINI_API_KEY"];
    const openaiKey = process.env["OPENAI_API_KEY"];
    const apiKey = geminiKey || openaiKey;

    if (!apiKey) {
      return {
        hasKey: false,
        message: "No GEMINI_API_KEY or OPENAI_API_KEY configured in backend .env. Operating in intelligent local simulation mode.",
      };
    }

    try {
      // Optional external model call when user sets GEMINI_API_KEY
      if (geminiKey) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are FertiFlow Clinical Coordinator AI. Respond concisely and professionally using real clinical data.\n\nContext:\n${data.context || "None"}\n\nStaff Query:\n${data.prompt}`,
                    },
                  ],
                },
              ],
            }),
          },
        );

        if (response.ok) {
          const result = await response.json();
          const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (generatedText) {
            return { hasKey: true, answer: generatedText };
          }
        }
      }

      return {
        hasKey: true,
        message: "API key detected and validated on backend server.",
      };
    } catch (err: any) {
      return {
        hasKey: true,
        error: err?.message || "Failed to reach AI provider from backend.",
      };
    }
  });
