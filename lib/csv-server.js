import { createHmac, timingSafeEqual } from "node:crypto";

export const csvFiles = {
  year1: "Year1.csv",
  year2: "Year2.csv",
  year3: "Year3.csv",
  upcomingtrips: "UpcomingTrips.csv",
};

const sessionCookieName = "overseas_csv_owner";
const sessionDurationSeconds = 8 * 60 * 60;

export function hasBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}

export function getOwnerPassword() {
  const password = process.env.CSV_OWNER_PASSWORD;
  return typeof password === "string" && password.length >= 32 ? password : null;
}

function parseCsv(text, fileName) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error(`${fileName} contains an unclosed quoted field.`);
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) throw new Error(`${fileName} has no data rows.`);

  const headers = rows[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) {
    throw new Error(`${fileName} contains a blank or duplicate column name.`);
  }
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(`${fileName} row ${rowIndex + 2} has ${cells.length} columns; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, cells[index].trim()]));
  });
}

export function validateUploadedCsv(text, fileKey, fileName) {
  const rows = parseCsv(text, fileName);
  const required = fileKey === "upcomingtrips"
    ? ["City", "Dates", "Total Students", "Year 1", "Year 2", "Notes"]
    : ["Student ID", "City", "SubCategory", "Course"];
  const missing = required.filter((column) => !Object.hasOwn(rows[0], column));
  if (missing.length) throw new Error(`${fileName} is missing required columns: ${missing.join(", ")}.`);

  const invalidIndex = fileKey === "upcomingtrips"
    ? rows.findIndex((trip) => (
      !trip.City || !trip.Dates
      || ["Total Students", "Year 1", "Year 2"].some((column) => !/^\d+$/.test(trip[column]))
    ))
    : rows.findIndex((student) => (
      !student["Student ID"] || !student.City || !student.SubCategory || !student.Course
    ));
  if (invalidIndex !== -1) {
    const message = fileKey === "upcomingtrips"
      ? "needs a city, date, and whole-number student counts."
      : "needs a Student ID, city, SubCategory, and Course.";
    throw new Error(`${fileName} row ${invalidIndex + 2} ${message}`);
  }
}

function signSession(expiration, password) {
  return createHmac("sha256", password).update(`owner:${expiration}`).digest("base64url");
}

export function createOwnerCookie(password, secure) {
  const expiration = Math.floor(Date.now() / 1000) + sessionDurationSeconds;
  const value = `${expiration}.${signSession(expiration, password)}`;
  return `${sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDurationSeconds}${secure ? "; Secure" : ""}`;
}

export function clearOwnerCookie(secure) {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function isOwnerRequest(request, password = getOwnerPassword()) {
  if (!password) return false;
  const cookieHeader = request.headers.cookie || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));
  if (!cookie) return false;

  const [expirationText, signature] = cookie.slice(sessionCookieName.length + 1).split(".");
  const expiration = Number(expirationText);
  if (!Number.isSafeInteger(expiration) || expiration <= Math.floor(Date.now() / 1000) || !signature) return false;

  const expected = Buffer.from(signSession(expiration, password));
  const provided = Buffer.from(signature);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function isSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https";
}

export function sendMethodNotAllowed(response, methods) {
  response.setHeader("Allow", methods.join(", "));
  return response.status(405).json({ error: "Method not allowed." });
}

export const maxCsvBytes = 2 * 1024 * 1024;
