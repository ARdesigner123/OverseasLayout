import { get, list } from "@vercel/blob";
import { Readable } from "node:stream";
import { csvFiles, hasBlobStorage, sendMethodNotAllowed } from "../lib/csv-server.js";

function availableSources() {
  return Object.fromEntries(Object.entries(csvFiles).map(([key, fileName]) => [key, fileName]));
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") return sendMethodNotAllowed(response, ["GET"]);
  if (!hasBlobStorage()) {
    if (request.query.fileName) return response.status(404).send("No approved upload exists.");
    return response.status(200).json({ sources: availableSources(), publishedCount: 0, uploadEnabled: false });
  }

  try {
    const fileName = request.query.fileName;
    if (fileName) {
      if (!Object.values(csvFiles).includes(fileName)) return response.status(400).send("Unsupported CSV filename.");
      const blob = await get(`published/${fileName}`, { access: "private", useCache: false });
      if (!blob || blob.statusCode !== 200) return response.status(404).send("No approved upload exists.");
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader("X-Content-Type-Options", "nosniff");
      return Readable.fromWeb(blob.stream).pipe(response);
    }

    const { blobs } = await list({ prefix: "published/", limit: 100 });
    const published = new Set(blobs.map((blob) => blob.pathname.replace(/^published\//, "")));
    const sources = Object.fromEntries(Object.entries(csvFiles).map(([key, name]) => [
      key,
      published.has(name) ? `/api/csv-files?fileName=${encodeURIComponent(name)}` : name,
    ]));
    return response.status(200).json({
      sources,
      publishedCount: [...published].filter((name) => Object.values(csvFiles).includes(name)).length,
      uploadEnabled: true,
    });
  } catch (error) {
    console.error("Unable to read approved dashboard CSVs from Vercel Blob.", error);
    return response.status(503).json({ error: "CSV storage is unavailable. Check the Vercel Blob store configuration." });
  }
}
