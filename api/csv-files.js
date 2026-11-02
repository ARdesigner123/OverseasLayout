import { list } from "@vercel/blob";

const fileNames = {
  year1: "Year1.csv",
  year2: "Year2.csv",
  year3: "Year3.csv",
  upcomingtrips: "UpcomingTrips.csv",
};

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const blobStorageConfigured = Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID,
  );
  const uploadEnabled = blobStorageConfigured && (process.env.UPLOAD_PASSWORD?.length || 0) >= 24;
  if (!blobStorageConfigured) {
    return response.status(200).json({
      sources: Object.fromEntries(Object.entries(fileNames).map(([key, fileName]) => [key, fileName])),
      uploadEnabled: false,
    });
  }

  try {
    const { blobs } = await list({ prefix: "dashboard-data/", limit: 100 });
    const sources = Object.fromEntries(Object.entries(fileNames).map(([key, fileName]) => {
      const uploaded = blobs.find((blob) => blob.pathname === `dashboard-data/${fileName}`);
      return [key, uploaded?.url || fileName];
    }));
    return response.status(200).json({ sources, uploadEnabled });
  } catch (error) {
    console.error("Unable to list dashboard CSV files in Vercel Blob.", error);
    return response.status(503).json({
      error: "CSV storage is unavailable. Connect a Vercel Blob store to this project and redeploy.",
    });
  }
}
