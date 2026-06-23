export default async function handler(req: any, res: any) {
  try {
    // Dynamically import the Express app from server.ts
    const serverModule = await import("../server.js");
    const app = serverModule.default;
    
    // Delegate the request handling to the Express app
    return app(req, res);
  } catch (err: any) {
    console.error("[VERCEL CRITICAL SHUTDOWN ERROR]:", err);
    res.status(500).json({
      ok: false,
      error: "Vercel Serverless Function Crash on Startup",
      message: err?.message || String(err),
      stack: err?.stack || "No stack trace available",
      tips: [
        "Check if all required environment variables are set in your Vercel Dashboard.",
        "Ensure there are no missing dependencies in package.json.",
        "Inspect the server.ts file for syntax errors or code that runs synchronously on module load."
      ]
    });
  }
}

