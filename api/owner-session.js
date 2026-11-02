import { timingSafeEqual } from "node:crypto";
import {
  clearOwnerCookie,
  createOwnerCookie,
  getOwnerPassword,
  isOwnerRequest,
  isSameOrigin,
  isSecureRequest,
  sendMethodNotAllowed,
} from "../lib/csv-server.js";

function matchesPassword(provided, expected) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  const secure = isSecureRequest(request);
  if (request.method === "GET") {
    return response.status(200).json({ isOwner: isOwnerRequest(request) });
  }
  if (!["POST", "DELETE"].includes(request.method)) return sendMethodNotAllowed(response, ["GET", "POST", "DELETE"]);
  if (!isSameOrigin(request)) return response.status(403).json({ error: "Request origin was not accepted." });

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", clearOwnerCookie(secure));
    return response.status(200).json({ isOwner: false });
  }

  const expectedPassword = getOwnerPassword();
  if (!expectedPassword) {
    return response.status(503).json({ error: "Owner access is not configured. Set CSV_OWNER_PASSWORD to a random password of at least 32 characters in Vercel." });
  }
  const password = request.body?.password;
  if (typeof password !== "string" || !matchesPassword(password, expectedPassword)) {
    return response.status(401).json({ error: "The owner password is incorrect." });
  }

  response.setHeader("Set-Cookie", createOwnerCookie(expectedPassword, secure));
  return response.status(200).json({ isOwner: true });
}
