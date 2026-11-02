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
const uploadPassword = document.querySelector("#upload-password");
const uploadFeedback = document.querySelector("#upload-feedback");
const uploadSubmit = document.querySelector("#upload-submit");
const dashboardData = { students: {}, trips: [], sourceFiles: {} };
let selectedYear = "all";
let selectedSubcategory = null;
let refreshInProgress = false;

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
      <p class="trip-notes">${escapeHtml(trip.Notes || "No additional notes.")}</p>
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
  renderSubcategories(rows);
  renderDetail(rows);
  renderCourses(rows);
}

async function getCsvSources() {
  if (window.location.protocol === "file:") {
    return {
      sources: Object.fromEntries(Object.entries(dataFiles).map(([key, fileName]) => [key, fileName])),
      uploadEnabled: false,
    };
  }
  const response = await fetch("/api/csv-files", { cache: "no-store" });
  if (response.status === 404) {
    return {
      sources: Object.fromEntries(Object.entries(dataFiles).map(([key, fileName]) => [key, fileName])),
      uploadEnabled: false,
    };
  }
  if (!response.ok) throw new Error(`CSV storage lookup failed (${response.status} ${response.statusText}).`);
  const result = await response.json();
  return {
    uploadEnabled: result.uploadEnabled === true,
    sources: Object.fromEntries(Object.entries(dataFiles).map(([key, fileName]) => [
      key,
      typeof result.sources?.[key] === "string" && result.sources[key] ? result.sources[key] : fileName,
    ])),
  };
}

async function loadDashboardData() {
  if (refreshInProgress) return false;
  refreshInProgress = true;
  refreshButton.disabled = true;
  setStatus("Refreshing live CSV files…", "loading");
  try {
    const { sources, uploadEnabled } = await getCsvSources();
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
    uploadOpen.disabled = !uploadEnabled;
    const refreshedAt = new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" }).format(new Date());
    setStatus(`Live CSV files · refreshed ${refreshedAt}`, "connected");
    document.querySelectorAll("[data-download]").forEach((button) => { button.disabled = false; });
    return true;
  } catch (error) {
    console.error("Unable to load overseas programme CSV data.", error);
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

async function handleCsvUpload(event) {
  event.preventDefault();
  const file = uploadFile.files[0];
  const fileKey = uploadFileKey.value;
  const password = uploadPassword.value;
  if (password.length < 24) {
    uploadFeedback.textContent = "The upload password must be at least 24 characters.";
    return;
  }
  if (!file || !dataFiles[fileKey] || !file.name.toLowerCase().endsWith(".csv")) {
    uploadFeedback.textContent = "Choose a CSV file and the matching dataset.";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    uploadFeedback.textContent = "CSV files must be no larger than 2 MB.";
    return;
  }

  uploadSubmit.disabled = true;
  uploadFeedback.textContent = "Validating CSV…";
  try {
    const text = await file.text();
    const rows = parseCsv(text, dataFiles[fileKey]);
    if (fileKey === "upcomingtrips") validateTrips(rows);
    else normalizeStudentRows(rows, fileKey, dataFiles[fileKey]);

    uploadFeedback.textContent = "Replacing the live CSV…";
    const response = await fetch("/api/upload-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileKey, password, csv: text }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Upload failed (${response.status}).`);

    uploadFeedback.textContent = `${dataFiles[fileKey]} replaced. Refreshing dashboard…`;
    uploadPassword.value = "";
    const refreshed = await loadDashboardData();
    uploadDialog.close();
    uploadForm.reset();
    if (refreshed) {
      setStatus(`${dataFiles[fileKey]} replaced · live data refreshed`, "connected");
    } else {
      setStatus(`${dataFiles[fileKey]} replaced, but the dashboard could not refresh. Try Refresh data.`, "error");
    }
  } catch (error) {
    console.error("Unable to replace the live CSV file.", error);
    uploadFeedback.textContent = error.message;
  } finally {
    uploadSubmit.disabled = false;
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
  uploadDialog.showModal();
});
document.querySelector("#upload-close").addEventListener("click", () => uploadDialog.close());
uploadForm.addEventListener("submit", handleCsvUpload);
document.addEventListener("click", (event) => {
  if (!event.target.closest(".download-menu")) {
    downloadToggle.setAttribute("aria-expanded", "false");
    downloadOptions.classList.remove("is-open");
  }
});

updateDate();
loadDashboardData();
window.setInterval(loadDashboardData, 60_000);
