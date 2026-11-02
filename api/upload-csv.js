import { timingSafeEqual } from "node:crypto";
import { put } from "@vercel/blob";
import { validateUploadedCsv } from "../csv-validator.js";

const fileNames = {
  year1: "Year1.csv",
  year2: "Year2.csv",
  year3: "Year3.csv",
  upcomingtrips: "UpcomingTrips.csv",
};
const maxFileSize = 2 * 1024 * 1024;

function matchesPassword(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const expectedPassword = process.env.UPLOAD_PASSWORD;
  if (!expectedPassword) {
    return response.status(503).json({ error: "CSV uploads are not configured. Set UPLOAD_PASSWORD in Vercel." });
  }
  if (expectedPassword.length < 24) {
    return response.status(503).json({ error: "Set UPLOAD_PASSWORD to a random value at least 24 characters long." });
  }

  const body = request.body;
  if (!body || typeof body !== "object") {
    return response.status(400).json({ error: "Expected a CSV upload request." });
  }
  const { fileKey, password, csv } = body;
  if (typeof password !== "string" || !matchesPassword(password, expectedPassword)) {
    return response.status(401).json({ error: "Incorrect upload password." });
  }
  if (!Object.hasOwn(fileNames, fileKey)) {
    return response.status(400).json({ error: "Choose a supported CSV file." });
  }
  if (typeof csv !== "string" || Buffer.byteLength(csv, "utf8") > maxFileSize) {
    return response.status(413).json({ error: "CSV files must be no larger than 2 MB." });
  }

  const fileName = fileNames[fileKey];
  try {
    validateUploadedCsv(csv, fileKey, fileName);
  } catch (error) {
    return response.status(400).json({ error: error.message || "The CSV file is invalid." });
  }

  try {
    const blob = await put(`dashboard-data/${fileName}`, csv, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      contentType: "text/csv; charset=utf-8",
    });
    return response.status(200).json({ fileName, url: blob.url });
  } catch (error) {
    console.error(`Unable to replace ${fileName} in Vercel Blob.`, error);
    return response.status(500).json({ error: "The CSV passed validation, but Vercel Blob could not store it." });
  }
}
