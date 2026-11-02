import { del, get, list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import {
  csvFiles,
  getOwnerPassword,
  hasBlobStorage,
  isOwnerRequest,
  isSameOrigin,
  maxCsvBytes,
  sendMethodNotAllowed,
} from "../lib/csv-server.js";
import { validateUploadedCsv } from "../csv-validator.js";

const submissionPathPattern = /^pending\/([0-9a-f-]{36})--(year1|year2|year3|upcomingtrips)\.csv$/i;

async function findSubmission(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { blobs } = await list({ prefix: `pending/${id}--`, limit: 5 });
  return blobs.find((blob) => submissionPathPattern.test(blob.pathname)) || null;
}

function submissionsFrom(blobs) {
  return blobs.flatMap((blob) => {
    const match = blob.pathname.match(submissionPathPattern);
    if (!match) return [];
    return [{
      id: match[1],
      fileKey: match[2].toLowerCase(),
      fileName: csvFiles[match[2].toLowerCase()],
      uploadedAt: blob.uploadedAt,
    }];
  }).sort((left, right) => new Date(right.uploadedAt) - new Date(left.uploadedAt));
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(request.method)) return sendMethodNotAllowed(response, ["GET", "POST"]);
  if (!hasBlobStorage()) {
    return response.status(503).json({
      error: "CSV uploads are not configured. Connect a private Vercel Blob store to this project and redeploy.",
    });
  }

  if (request.method === "GET") {
    if (!isOwnerRequest(request)) return response.status(401).json({ error: "Sign in as the owner to view submissions." });
    try {
      const { blobs } = await list({ prefix: "pending/", limit: 100 });
      return response.status(200).json({ submissions: submissionsFrom(blobs) });
    } catch (error) {
      console.error("Unable to list pending CSV submissions.", error);
      return response.status(503).json({ error: "Could not load the pending CSV submissions." });
    }
  }

  if (!isSameOrigin(request)) return response.status(403).json({ error: "Request origin was not accepted." });
  const { action, fileKey, fileName: submittedFileName, csv, id } = request.body || {};
  if (!action || action === "submit") {
    if (typeof fileKey !== "string" || !Object.hasOwn(csvFiles, fileKey)) {
      return response.status(400).json({ error: "Choose a supported dashboard CSV." });
    }
    if (typeof csv !== "string" || Buffer.byteLength(csv, "utf8") > maxCsvBytes) {
      return response.status(413).json({ error: "CSV files must be no larger than 2 MB." });
    }
    const fileName = csvFiles[fileKey];
    if (typeof submittedFileName !== "string" || submittedFileName.toLowerCase() !== fileName.toLowerCase()) {
      return response.status(400).json({ error: `The uploaded file must be named ${fileName}.` });
    }
    try {
      validateUploadedCsv(csv, fileKey, fileName);
    } catch (error) {
      return response.status(400).json({ error: error.message || "The CSV file is invalid." });
    }
    try {
      const { blobs: pendingBlobs } = await list({ prefix: "pending/", limit: 25 });
      if (pendingBlobs.length >= 25) {
        return response.status(429).json({ error: "The review queue is full. Please try again later." });
      }
      const submissionId = randomUUID();
      await put(`pending/${submissionId}--${fileKey}.csv`, csv, {
        access: "private",
        addRandomSuffix: false,
        contentType: "text/csv; charset=utf-8",
      });
      return response.status(201).json({ id: submissionId, fileName, status: "pending-review" });
    } catch (error) {
      console.error("Unable to save a pending CSV submission.", error);
      return response.status(503).json({ error: "The CSV passed validation, but Vercel Blob could not store it." });
    }
  }

  if (!isOwnerRequest(request) || !getOwnerPassword()) {
    return response.status(401).json({ error: "Sign in as the owner to manage submissions." });
  }
  if (!isSameOrigin(request)) return response.status(403).json({ error: "Request origin was not accepted." });
  if (typeof id !== "string") return response.status(400).json({ error: "Choose a pending submission." });

  try {
    const submission = await findSubmission(id);
    if (!submission) return response.status(404).json({ error: "That pending submission no longer exists." });

    if (action === "delete") {
      await del(submission.url);
      return response.status(200).json({ status: "deleted" });
    }
    const pending = await get(submission.pathname, { access: "private" });
    if (!pending || pending.statusCode !== 200) return response.status(404).json({ error: "That pending submission could not be read." });
    const csv = await new Response(pending.stream).text();
    if (action === "preview") {
      return response.status(200).json({ fileName: csvFiles[submission.pathname.match(submissionPathPattern)[2].toLowerCase()], csv });
    }
    if (action !== "approve") return response.status(400).json({ error: "Unsupported submission action." });

    const match = submission.pathname.match(submissionPathPattern);
    const fileKey = match[2].toLowerCase();
    const fileName = csvFiles[fileKey];
    validateUploadedCsv(csv, fileKey, fileName);
    await put(`published/${fileName}`, csv, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/csv; charset=utf-8",
    });
    await del(submission.url);
    return response.status(200).json({ status: "approved", fileKey, fileName });
  } catch (error) {
    console.error("Unable to manage a pending CSV submission.", error);
    return response.status(503).json({ error: error.message || "Could not update the CSV submission." });
  }
}
