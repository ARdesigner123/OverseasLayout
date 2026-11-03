const yearKeys = ["year1", "year2", "year3"];
const yearLabels = { all: "All years", year1: "Year 1", year2: "Year 2", year3: "Year 3" };
const yearColors = { year1: "#d3a547", year2: "#4d9c71", year3: "#708ac4" };
const dataFiles = {
  year1: "Year1.csv",
  year2: "Year2.csv",
  year3: "Year3.csv",
  upcomingtrips: "UpcomingTrips.csv",
};
const chart = document.querySelector("#bar-chart");
const filter = document.querySelector("#year-filter");
const chartTotal = document.querySelector("#chart-total");
const chartPeriod = document.querySelector("#chart-period");
const chartDescription = document.querySelector("#chart-description");
const detail = document.querySelector("#subcategory-detail");
const courseChart = document.querySelector("#course-chart");
const courseHeading = document.querySelector("#course-heading");
const courseDescription = document.querySelector("#course-description");
const courseTotal = document.querySelector("#course-total");
const dataStatus = document.querySelector("#data-status");
const refreshButton = document.querySelector("#refresh-button");
const downloadToggle = document.querySelector("#download-toggle");
const downloadOptions = document.querySelector("#download-options");
const uploadOpen = document.querySelector("#upload-open");
const uploadDialog = document.querySelector("#upload-dialog");
const uploadForm = document.querySelector("#upload-form");
const uploadFileKey = document.querySelector("#upload-file-key");
const uploadFile = document.querySelector("#upload-file");
const uploadFeedback = document.querySelector("#upload-feedback");
const uploadSubmit = document.querySelector("#upload-submit");
const uploadBackendHelp = document.querySelector("#upload-backend-help");
const ownerLoginForm = document.querySelector("#owner-login-form");
const ownerPassword = document.querySelector("#owner-password");
const ownerFeedback = document.querySelector("#owner-feedback");
const ownerLoginSubmit = document.querySelector("#owner-login-submit");
const ownerControls = document.querySelector("#owner-controls");
const pendingSubmissions = document.querySelector("#pending-submissions");
const liveCsvList = document.querySelector("#live-csv-list");
const dashboardData = { students: {}, trips: [], sourceFiles: {} };
let selectedYear = "all";
let selectedSubcategory = null;
let refreshInProgress = false;
let ownerSignedIn = false;
let navScrollFrame = 0;
let pendingNavigationItem = null;
let navSettleTimeout = 0;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
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

function normalizeStudentRows(rows, yearLabel, fileName) {
  const required = ["Student ID", "City", "SubCategory", "Course"];
  const missing = required.filter((column) => !Object.hasOwn(rows[0], column));
  if (missing.length) {
    throw new Error(`${fileName} is missing required columns: ${missing.join(", ")}.`);
  }

  return rows.map((row, index) => {
    const studentId = row["Student ID"].trim();
    const subcategory = row.SubCategory.replace(/\s+/g, " ").trim();
    const rawCourse = row.Course.replace(/\s+/g, " ").trim();
    const course = ["DIT", "DCS"].includes(rawCourse.toUpperCase()) ? "DIT/DCS" : rawCourse;
    if (!studentId || !subcategory || !course) {
      throw new Error(`${fileName} row ${index + 2} is missing a Student ID, SubCategory, or Course.`);
    }
    return {
      studentId,
      city: row.City.replace(/\s+/g, " ").trim() || "Not specified",
      subcategory,
      course,
      year: yearLabel,
    };
  });
}

function uniqueCount(rows) {
  return new Set(rows.map((row) => row.studentId)).size;
}

function countBy(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row[key])) groups.set(row[key], new Set());
    groups.get(row[key]).add(row.studentId);
  });
  return [...groups.entries()]
    .map(([label, ids]) => ({ label, count: ids.size }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function visibleRows() {
  if (selectedYear === "all") return yearKeys.flatMap((year) => dashboardData.students[year] || []);
  return dashboardData.students[selectedYear] || [];
}

function setStatus(message, state) {
  dataStatus.textContent = message;
  dataStatus.dataset.state = state;
}

function formatCity(city) {
  return city.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase());
}

function renderBars(container, rows) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  container.innerHTML = rows.length
    ? rows.map((row, index) => `
      <div class="programme-row" role="listitem" style="--row-index:${index}">
        <span class="programme-name"><strong>${escapeHtml(row.label)}</strong></span>
        <span class="programme-track" aria-hidden="true">
          <span class="programme-fill" style="--programme-color:${yearColors[yearKeys[index % yearKeys.length]]}; width:${(row.count / max) * 100}%"></span>
        </span>
        <strong class="programme-value">${row.count}</strong>
      </div>
    `).join("")
    : '<p class="empty-chart">No matching student records.</p>';
}

function renderSubcategories(rows) {
  const categories = countBy(rows, "subcategory");
  const max = Math.max(...categories.map((category) => category.count), 1);
  chartTotal.textContent = uniqueCount(rows).toLocaleString();
  chartPeriod.textContent = `· ${yearLabels[selectedYear].toLowerCase()}`;
  chartDescription.textContent = selectedSubcategory
    ? `Student participation in ${selectedSubcategory}`
    : `Unique student participation across ${yearLabels[selectedYear].toLowerCase()}`;

  chart.innerHTML = categories.length
    ? categories.map(({ label, count }, index) => {
      const selected = label === selectedSubcategory;
      return `
        <button class="bar-row${selected ? " is-selected" : ""}" type="button" data-subcategory="${escapeHtml(label)}" aria-pressed="${selected}" aria-label="${escapeHtml(label)}: ${count} unique students. Select to see city and course breakdowns." style="--row-index:${index}">
          <span class="bar-label">${escapeHtml(label)}</span>
          <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
          <span class="bar-value">${count}</span>
        </button>
      `;
    }).join("")
    : '<p class="empty-chart">No student records are available for this year group.</p>';

  chart.querySelectorAll("[data-subcategory]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.subcategory;
      selectedSubcategory = selectedSubcategory === category ? null : category;
      renderDashboard();
    });
  });
}

function renderDetail(rows) {
  if (!selectedSubcategory) {
    detail.hidden = true;
    detail.innerHTML = "";
    return;
  }
  const categoryRows = rows.filter((row) => row.subcategory === selectedSubcategory);
  const cities = countBy(categoryRows, "city");
  const cityMax = Math.max(...cities.map((city) => city.count), 1);
  detail.innerHTML = `
    <div class="detail-heading">
      <div><span class="detail-eyebrow">SUBCATEGORY SELECTED</span><strong class="detail-subcategory">${escapeHtml(selectedSubcategory)}</strong></div>
      <div class="detail-total"><strong>${uniqueCount(categoryRows)}</strong><span>unique students</span></div>
      <button class="detail-clear" type="button">Show all</button>
    </div>
    <div class="detail-grid">
      <section class="detail-breakdown" aria-label="Students by city">
        <h3>Cities</h3>
        ${cities.length ? cities.map(({ label, count }) => `
          <div class="programme-row">
            <span class="programme-name"><strong>${escapeHtml(formatCity(label))}</strong></span>
            <span class="programme-track" aria-hidden="true"><span class="programme-fill" style="width:${(count / cityMax) * 100}%"></span></span>
            <strong class="programme-value">${count}</strong>
          </div>
        `).join("") : '<p class="empty-chart">No city records available.</p>'}
      </section>
      <section class="detail-course" aria-label="Student courses">
        <h3>Courses</h3>
        <p>Course counts for this subcategory are shown in the course chart.</p>
      </section>
    </div>
  `;
  detail.hidden = false;
  detail.querySelector(".detail-clear").addEventListener("click", () => {
    selectedSubcategory = null;
    renderDashboard();
  });
}

function renderCourses(rows) {
  const courseRows = selectedSubcategory
    ? rows.filter((row) => row.subcategory === selectedSubcategory)
    : rows;
  const courses = countBy(courseRows, "course");
  const label = selectedSubcategory ? `Courses in ${selectedSubcategory}` : "Students by course";
  courseHeading.textContent = label;
  courseDescription.textContent = selectedSubcategory
    ? "Unique students by course in the selected subcategory"
    : "Unique students in each course";
  courseTotal.textContent = uniqueCount(courseRows).toLocaleString();
  renderBars(courseChart, courses);
  const courseDetail = detail.querySelector(".detail-course");
  if (courseDetail) {
    courseDetail.innerHTML = `
      <h3>Courses</h3>
      ${courses.length ? courses.map(({ label: name, count }) => `
        <div class="detail-course-row"><span>${escapeHtml(name)}</span><strong>${count}</strong></div>
      `).join("") : '<p class="empty-chart">No course records available.</p>'}
    `;
  }
}

function renderSummary(rows) {
  const yearRows = yearKeys.map((year) => [year, uniqueCount(dashboardData.students[year] || [])]);
  const allCourses = countBy(rows, "course");
  document.querySelector("#grand-total").textContent = uniqueCount(rows).toLocaleString();
  document.querySelector("#total-period").textContent = yearLabels[selectedYear];
  document.querySelectorAll("[data-year-total]").forEach((element) => {
    element.textContent = yearRows.find(([year]) => year === element.dataset.yearTotal)[1].toLocaleString();
  });
  const topCourse = allCourses[0];
  document.querySelector("#top-course").textContent = topCourse?.label || "—";
  document.querySelector("#top-course-count").textContent = topCourse
    ? `${topCourse.count.toLocaleString()} students · ${yearLabels[selectedYear].toLowerCase()}`
    : "No course records";
  document.querySelectorAll(".year-card").forEach((card) => {
    const active = card.dataset.yearSelection === selectedYear;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-pressed", String(active));
  });
}

function renderKpis() {
  const programmeCategories = {
    ost: "Overseas Study Trip (OST)",
    lex: "Learning Express (LeX)",
  };
  yearKeys.forEach((year) => {
    const rows = dashboardData.students[year] || [];
    const ostRows = rows.filter((row) => row.subcategory === programmeCategories.ost);
    const lexRows = rows.filter((row) => row.subcategory === programmeCategories.lex);
    const ostStudents = new Set(ostRows.map((row) => row.studentId));
    const lexStudents = new Set(lexRows.map((row) => row.studentId));
    const bothCount = [...ostStudents].filter((studentId) => lexStudents.has(studentId)).length;
    const ostOnlyCount = ostStudents.size - bothCount;
    const lexOnlyCount = lexStudents.size - bothCount;
    const totalStudents = uniqueCount(rows);
    const participationCount = ostOnlyCount + lexOnlyCount + bothCount;
    const percentage = totalStudents ? (participationCount / totalStudents) * 100 : null;
    const card = document.querySelector(`[data-kpi-card="${year}"]`);

    card.querySelector("[data-kpi-percentage]").textContent = percentage === null
      ? "N/A"
      : `${percentage.toFixed(1)}%`;
    card.querySelector("[data-kpi-numerator]").textContent = participationCount.toLocaleString();
    card.querySelector("[data-kpi-denominator]").textContent = totalStudents.toLocaleString();
    card.querySelector("[data-kpi-ost-only]").textContent = ostOnlyCount.toLocaleString();
    card.querySelector("[data-kpi-lex-only]").textContent = lexOnlyCount.toLocaleString();
    card.querySelector("[data-kpi-both]").textContent = bothCount.toLocaleString();
    card.style.setProperty("--kpi-progress", `${Math.min(percentage ?? 0, 100)}%`);
  });
}

function renderTrips(trips) {
  const grid = document.querySelector("#upcoming-trip-grid");
  validateTrips(trips);
  grid.innerHTML = trips.map((trip, index) => `
    <article class="trip-card trip-color-${index % 4}">
      <div class="trip-card-heading">
        <div><span class="trip-eyebrow">UPCOMING</span><h3>${escapeHtml(formatCity(trip.City))}</h3></div>
        <span class="trip-date">${escapeHtml(trip.Dates)}</span>
      </div>
      <div class="trip-total"><strong>${Number(trip["Total Students"]).toLocaleString()}</strong><span>students</span></div>
      <div class="trip-year-counts">
        <span><strong>${Number(trip["Year 1"]).toLocaleString()}</strong> Year 1</span>
        <span><strong>${Number(trip["Year 2"]).toLocaleString()}</strong> Year 2</span>
      </div>
      <p class="trip-notes">${escapeHtml(
    trip.Notes || (trip.City.trim().toLowerCase() === "batam" ? "No additional note." : "No additional notes."),
  )}</p>
    </article>
  `).join("");
}

function validateTrips(trips) {
  const required = ["City", "Dates", "Total Students", "Year 1", "Year 2", "Notes"];
  const missing = required.filter((column) => !Object.hasOwn(trips[0], column));
  if (missing.length) throw new Error(`UpcomingTrips.csv is missing required columns: ${missing.join(", ")}.`);
  const invalidIndex = trips.findIndex((trip) => (
    !trip.City || !trip.Dates
    || ["Total Students", "Year 1", "Year 2"].some((column) => !/^\d+$/.test(trip[column]))
  ));
  if (invalidIndex !== -1) {
    throw new Error(`UpcomingTrips.csv row ${invalidIndex + 2} needs a city, date, and whole-number student counts.`);
  }
}

function renderDashboard() {
  const rows = visibleRows();
  if (selectedSubcategory && !rows.some((row) => row.subcategory === selectedSubcategory)) {
    selectedSubcategory = null;
  }
  filter.value = selectedYear;
  renderSummary(rows);
  renderKpis();
  renderSubcategories(rows);
  renderDetail(rows);
  renderCourses(rows);
}

async function readApiResponse(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

async function getCsvSources() {
  const fallbackSources = Object.fromEntries(
    Object.entries(dataFiles).map(([key, fileName]) => [key, fileName]),
  );
  if (window.location.protocol === "file:") {
    return {
      sources: fallbackSources,
      publishedCount: 0,
      uploadEnabled: false,
      uploadMessage: "Uploads require the deployed Vercel site with its Blob store connected.",
    };
  }
  const response = await fetch("/api/csv-files", { cache: "no-store" });
  if (response.status === 404) {
    return {
      sources: fallbackSources,
      publishedCount: 0,
      uploadEnabled: false,
      uploadMessage: "Vercel upload functions are unavailable. Deploy this project to Vercel to enable submissions.",
    };
  }
  const result = await readApiResponse(response);
  if (!result.sources || typeof result.sources !== "object") throw new Error("The CSV source listing is invalid.");
  return {
    sources: { ...fallbackSources, ...result.sources },
    publishedCount: Number(result.publishedCount) || 0,
    uploadEnabled: result.uploadEnabled === true,
    uploadMessage: result.uploadMessage,
  };
}

function setUploadBackendStatus(available, message) {
  uploadBackendHelp.hidden = available;
  uploadBackendHelp.textContent = available
    ? ""
    : message || "Vercel uploads are not configured. Check the Blob store connection and redeploy.";
}

async function loadDashboardData() {
  if (refreshInProgress) return false;
  refreshInProgress = true;
  refreshButton.disabled = true;
  setStatus("Refreshing live CSV files…", "loading");
  try {
    const { sources, publishedCount, uploadEnabled, uploadMessage } = await getCsvSources();
    setUploadBackendStatus(uploadEnabled, uploadMessage);
    const entries = await Promise.all(Object.entries(dataFiles).map(async ([key, fileName]) => {
      const url = new URL(sources[key], window.location.href);
      url.searchParams.set("updated", Date.now());
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${fileName} request failed (${response.status} ${response.statusText}).`);
      return [key, { fileName, text: await response.text(), url: sources[key] }];
    }));
    const files = Object.fromEntries(entries);
    const students = {};
    for (const year of yearKeys) {
      const file = files[year];
      students[year] = normalizeStudentRows(parseCsv(file.text, file.fileName), year, file.fileName);
    }
    const tripFile = files.upcomingtrips;
    const trips = parseCsv(tripFile.text, tripFile.fileName);
    renderTrips(trips);
    Object.assign(dashboardData, { students, trips, sourceFiles: files });
    renderDashboard();
    renderCurrentCsvList();
    const refreshedAt = new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" }).format(new Date());
    const sourceLabel = publishedCount ? `Approved Vercel CSVs · ${publishedCount}/4 updated` : "Bundled CSVs";
    setStatus(`${sourceLabel} · refreshed ${refreshedAt}`, "connected");
    document.querySelectorAll("[data-download]").forEach((button) => { button.disabled = false; });
    return true;
  } catch (error) {
    console.error("Unable to load overseas programme CSV data.", error);
    setUploadBackendStatus(false, `Vercel CSV services are unavailable: ${error.message}`);
    setStatus(`Could not load CSV data. ${error.message}`, "error");
    return false;
  } finally {
    refreshInProgress = false;
    refreshButton.disabled = false;
  }
}

function downloadCsv(fileKey) {
  const file = dashboardData.sourceFiles[fileKey];
  if (!file) return;
  const blob = new Blob([file.text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderCurrentCsvList() {
  liveCsvList.replaceChildren();
  for (const [fileKey, fileName] of Object.entries(dataFiles)) {
    const file = dashboardData.sourceFiles[fileKey];
    const count = fileKey === "upcomingtrips"
      ? `${dashboardData.trips.length} trip records`
      : `${uniqueCount(dashboardData.students[fileKey] || [])} unique students`;
    const button = document.createElement("button");
    button.className = "live-csv-item";
    button.type = "button";
    button.dataset.csvTarget = fileKey;
    button.setAttribute("aria-pressed", String(uploadFileKey.value === fileKey));
    const name = document.createElement("strong");
    name.textContent = fileName;
    const status = document.createElement("span");
    status.textContent = file?.url?.startsWith("/api/csv-files") ? "Owner-approved live file" : "Bundled live file";
    const details = document.createElement("small");
    details.textContent = count;
    button.append(name, status, details);
    liveCsvList.append(button);
  }
}

function updateSelectedCsvTarget() {
  document.querySelectorAll("[data-csv-target]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.csvTarget === uploadFileKey.value));
  });
}

async function handleCsvUpload(event) {
  event.preventDefault();
  const file = uploadFile.files[0];
  const fileKey = uploadFileKey.value;
  if (!file || !dataFiles[fileKey]) {
    uploadFeedback.textContent = "Choose a CSV file and the dataset it should update.";
    return;
  }
  if (file.name.toLowerCase() !== dataFiles[fileKey].toLowerCase()) {
    uploadFeedback.textContent = `The file must be named ${dataFiles[fileKey]} to update this dataset.`;
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    uploadFeedback.textContent = "CSV files must be no larger than 2 MB.";
    return;
  }

  uploadSubmit.disabled = true;
  uploadFeedback.textContent = "Checking CSV…";
  try {
    const text = await file.text();
    const rows = parseCsv(text, dataFiles[fileKey]);
    if (fileKey === "upcomingtrips") validateTrips(rows);
    else normalizeStudentRows(rows, fileKey, dataFiles[fileKey]);

    uploadFeedback.textContent = "Sending for owner review…";
    const response = await fetch("/api/csv-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", fileKey, fileName: file.name, csv: text }),
    });
    await readApiResponse(response);
    uploadFeedback.textContent = `${dataFiles[fileKey]} was submitted privately for owner review. The live dashboard is unchanged until it is approved.`;
    uploadFile.value = "";
    if (ownerSignedIn) await loadPendingSubmissions();
  } catch (error) {
    console.error("Unable to submit the CSV file for review.", error);
    uploadFeedback.textContent = error.message;
  } finally {
    uploadSubmit.disabled = false;
  }
}

function setOwnerSignedIn(isOwner) {
  ownerSignedIn = isOwner;
  ownerLoginForm.hidden = isOwner;
  ownerControls.hidden = !isOwner;
  if (isOwner) loadPendingSubmissions();
}

async function loadPendingSubmissions() {
  pendingSubmissions.replaceChildren();
  try {
    const response = await fetch("/api/csv-submissions", { cache: "no-store" });
    const result = await readApiResponse(response);
    if (!result.submissions.length) {
      const empty = document.createElement("p");
      empty.className = "upload-help";
      empty.textContent = "No pending CSV submissions.";
      pendingSubmissions.append(empty);
      return;
    }
    for (const submission of result.submissions) {
      const item = document.createElement("article");
      item.className = "pending-submission";
      const details = document.createElement("div");
      const fileName = document.createElement("strong");
      fileName.textContent = submission.fileName;
      const date = document.createElement("small");
      date.textContent = new Intl.DateTimeFormat("en-SG", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(submission.uploadedAt));
      details.append(fileName, date);
      const actions = document.createElement("div");
      actions.className = "pending-submission-actions";
      const downloadButton = document.createElement("button");
      downloadButton.className = "upload-signout";
      downloadButton.type = "button";
      downloadButton.textContent = "Download";
      downloadButton.addEventListener("click", () => downloadSubmission(submission));
      const approveButton = document.createElement("button");
      approveButton.className = "upload-submit";
      approveButton.type = "button";
      approveButton.textContent = "Approve";
      approveButton.addEventListener("click", () => manageSubmission("approve", submission));
      const deleteButton = document.createElement("button");
      deleteButton.className = "upload-signout";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => manageSubmission("delete", submission));
      actions.append(downloadButton, approveButton, deleteButton);
      item.append(details, actions);
      pendingSubmissions.append(item);
    }
  } catch (error) {
    ownerFeedback.textContent = error.message;
  }
}

async function downloadSubmission(submission) {
  ownerFeedback.textContent = `Preparing ${submission.fileName} for download…`;
  try {
    const response = await fetch("/api/csv-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download", id: submission.id }),
    });
    const result = await readApiResponse(response);
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = result.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    ownerFeedback.textContent = `${result.fileName} downloaded.`;
  } catch (error) {
    ownerFeedback.textContent = error.message;
  }
}

async function manageSubmission(action, submission) {
  ownerFeedback.textContent = action === "approve" ? "Approving submission…" : "Deleting submission…";
  try {
    const response = await fetch("/api/csv-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id: submission.id }),
    });
    const result = await readApiResponse(response);
    ownerFeedback.textContent = action === "approve"
      ? `${result.fileName} approved. Refreshing dashboard data…`
      : `${submission.fileName} submission deleted.`;
    if (action === "approve") await loadDashboardData();
    await loadPendingSubmissions();
  } catch (error) {
    ownerFeedback.textContent = error.message;
  }
}

async function handleOwnerLogin(event) {
  event.preventDefault();
  ownerLoginSubmit.disabled = true;
  ownerFeedback.textContent = "Verifying owner access…";
  try {
    const response = await fetch("/api/owner-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: ownerPassword.value }),
    });
    const result = await readApiResponse(response);
    ownerPassword.value = "";
    ownerFeedback.textContent = "Owner access confirmed.";
    setOwnerSignedIn(result.isOwner === true);
  } catch (error) {
    ownerFeedback.textContent = error.message;
  } finally {
    ownerLoginSubmit.disabled = false;
  }
}

async function restoreOwnerSession() {
  try {
    const response = await fetch("/api/owner-session", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    if (result.isOwner) setOwnerSignedIn(true);
  } catch (error) {
    console.error("Unable to restore owner access.", error);
  }
}

async function signOutOwner() {
  try {
    const response = await fetch("/api/owner-session", { method: "DELETE" });
    await readApiResponse(response);
    setOwnerSignedIn(false);
    ownerLoginForm.reset();
    ownerFeedback.textContent = "";
  } catch (error) {
    ownerFeedback.textContent = error.message;
  }
}
function setYear(year) {
  selectedYear = selectedYear === year ? "all" : year;
  renderDashboard();
}

function updateDate() {
  const today = new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
  document.querySelector("#as-of-date").textContent = `As of ${today}`;
  document.querySelector("#intro-date").textContent = `AS OF ${today.toUpperCase()}`;
}

function activateNavigationItem(item) {
  const navigation = document.querySelector(".navigation");
  const navItems = [...document.querySelectorAll(".navigation .nav-item")];
  navItems.forEach((navItem) => {
    const active = navItem === item;
    navItem.classList.toggle("active", active);
    if (active) navItem.setAttribute("aria-current", "page");
    else navItem.removeAttribute("aria-current");
  });
  const indicator = document.querySelector("#nav-indicator");
  navigation.classList.toggle("has-active", Boolean(item));
  if (indicator && item) {
    const top = item.offsetTop + (item.offsetHeight - indicator.offsetHeight) / 2;
    indicator.style.transform = `translateY(${top}px)`;
  }
}

function updateNavigationFromScroll() {
  navScrollFrame = 0;
  if (pendingNavigationItem) {
    activateNavigationItem(pendingNavigationItem);
    return;
  }
  const items = [...document.querySelectorAll(".navigation .nav-item")];
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
    activateNavigationItem(items.at(-1));
    return;
  }
  const threshold = Math.min(window.innerHeight * 0.18, 120);
  let activeItem = items[0];
  let activeTop = Number.NEGATIVE_INFINITY;
  items.forEach((item) => {
    const target = document.querySelector(item.getAttribute("href"));
    const top = target?.getBoundingClientRect().top;
    if (top !== undefined && top <= threshold && top > activeTop) {
      activeItem = item;
      activeTop = top;
    }
  });
  activateNavigationItem(activeItem);
}

document.querySelectorAll(".navigation .nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    pendingNavigationItem = item;
    window.clearTimeout(navSettleTimeout);
    activateNavigationItem(item);
    const target = document.querySelector(item.getAttribute("href"));
    if (target) {
      target.classList.remove("section-arrival");
      window.requestAnimationFrame(() => target.classList.add("section-arrival"));
      window.setTimeout(() => target.classList.remove("section-arrival"), 900);
    }
    navSettleTimeout = window.setTimeout(() => {
      pendingNavigationItem = null;
      updateNavigationFromScroll();
    }, 180);
  });
});
window.addEventListener("scroll", () => {
  if (pendingNavigationItem) {
    window.clearTimeout(navSettleTimeout);
    navSettleTimeout = window.setTimeout(() => {
      pendingNavigationItem = null;
      updateNavigationFromScroll();
    }, 180);
  }
  if (!navScrollFrame) navScrollFrame = window.requestAnimationFrame(updateNavigationFromScroll);
}, { passive: true });
window.addEventListener("resize", () => {
  pendingNavigationItem = null;
  window.clearTimeout(navSettleTimeout);
  updateNavigationFromScroll();
});
window.addEventListener("hashchange", () => {
  if (pendingNavigationItem) activateNavigationItem(pendingNavigationItem);
  else updateNavigationFromScroll();
});

filter.addEventListener("change", (event) => {
  selectedYear = event.target.value;
  renderDashboard();
});
document.querySelectorAll(".year-card").forEach((card) => {
  card.addEventListener("click", () => setYear(card.dataset.yearSelection));
});
refreshButton.addEventListener("click", loadDashboardData);
downloadToggle.addEventListener("click", () => {
  const expanded = downloadToggle.getAttribute("aria-expanded") === "true";
  downloadToggle.setAttribute("aria-expanded", String(!expanded));
  downloadOptions.classList.toggle("is-open", !expanded);
});
document.querySelectorAll("[data-download]").forEach((button) => {
  button.addEventListener("click", () => {
    downloadCsv(button.dataset.download);
    downloadToggle.setAttribute("aria-expanded", "false");
    downloadOptions.classList.remove("is-open");
  });
});
document.querySelector("#upload-open").addEventListener("click", () => {
  downloadToggle.setAttribute("aria-expanded", "false");
  downloadOptions.classList.remove("is-open");
  uploadFeedback.textContent = "";
  updateSelectedCsvTarget();
  uploadDialog.showModal();
});
document.querySelector("#upload-close").addEventListener("click", () => uploadDialog.close());
uploadForm.addEventListener("submit", handleCsvUpload);
ownerLoginForm.addEventListener("submit", handleOwnerLogin);
document.querySelector("#owner-signout").addEventListener("click", signOutOwner);
uploadFileKey.addEventListener("change", updateSelectedCsvTarget);
liveCsvList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-csv-target]");
  if (!button) return;
  uploadFileKey.value = button.dataset.csvTarget;
  updateSelectedCsvTarget();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".download-menu")) {
    downloadToggle.setAttribute("aria-expanded", "false");
    downloadOptions.classList.remove("is-open");
  }
});

updateDate();
updateNavigationFromScroll();
restoreOwnerSession();
loadDashboardData();
window.setInterval(loadDashboardData, 60_000);
