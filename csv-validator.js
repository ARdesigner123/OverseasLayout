const studentColumns = ["Student ID", "City", "SubCategory", "Course"];
const tripColumns = ["City", "Dates", "Total Students", "Year 1", "Year 2", "Notes"];

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
  if (fileKey === "upcomingtrips") {
    const rows = parseCsv(text, fileName);
    const missing = tripColumns.filter((column) => !Object.hasOwn(rows[0], column));
    if (missing.length) throw new Error(`${fileName} is missing required columns: ${missing.join(", ")}.`);
    const invalidIndex = rows.findIndex((row) => (
      !row.City || !row.Dates
      || ["Total Students", "Year 1", "Year 2"].some((column) => !/^\d+$/.test(row[column]))
    ));
    if (invalidIndex !== -1) {
      throw new Error(`${fileName} row ${invalidIndex + 2} needs a city, date, and whole-number student counts.`);
    }
    return;
  }

  const rows = parseCsv(text, fileName);
  const missing = studentColumns.filter((column) => !Object.hasOwn(rows[0], column));
  if (missing.length) throw new Error(`${fileName} is missing required columns: ${missing.join(", ")}.`);
  const invalidIndex = rows.findIndex((row) => (
    !row["Student ID"] || !row.SubCategory || !row.Course
  ));
  if (invalidIndex !== -1) {
    throw new Error(`${fileName} row ${invalidIndex + 2} needs a Student ID, SubCategory, and Course.`);
  }
}
