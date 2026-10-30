const yearKeys = ["year1", "year2", "year3"];
const yearColumns = { year1: "year_1", year2: "year_2", year3: "year_3" };
const yearLabels = { all: "All year groups", year1: "Year 1", year2: "Year 2", year3: "Year 3" };
const yearColors = { year1: "#a9bac5", year2: "#778d9c", year3: "#4b6475" };
const programmeColors = ["#4b6475", "#60798a", "#748d9d", "#8ba0ad", "#a7b7c1", "#c1cbd1"];
const config = window.SUPABASE_CONFIG;
const chart = document.querySelector("#bar-chart");
const filter = document.querySelector("#year-filter");
const chartTotal = document.querySelector("#chart-total");
const chartPeriod = document.querySelector("#chart-period");
const chartDescription = document.querySelector("#chart-description");
const detail = document.querySelector("#destination-detail");
const donut = document.querySelector("#donut-chart");
const donutTotal = document.querySelector("#donut-total");
const mixDescription = document.querySelector("#mix-description");
const programmeChart = document.querySelector("#programme-chart");
const programmeTotal = document.querySelector("#programme-total");
const programmeDescription = document.querySelector("#programme-description");
const programmeDonut = document.querySelector("#programme-donut");
const programmeMixLegend = document.querySelector("#programme-mix-legend");
const dataStatus = document.querySelector("#data-status");
const toast = document.querySelector("#toast");
const exportButton = document.querySelector("#export-button");
const dashboardData = {
  rows: [],
  destinations: [],
  programmes: [],
  genderCounts: {},
  destinationGenderCounts: {},
  yearTotals: { all: 0, year1: 0, year2: 0, year3: 0 },
};
let selectedYear = "all";
let selectedDestination = null;
let toastTimeout;

function sumYears(record) {
  return yearKeys.reduce((sum, year) => sum + record[year], 0);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function rowCounts(row) {
  return Object.fromEntries(yearKeys.map((year) => [
    year,
    Number(row[yearColumns[year]]),
  ]));
}

function setStatus(message, state) {
  dataStatus.textContent = message;
  dataStatus.dataset.state = state;
}

function getVisibleTotal(record) {
  return selectedYear === "all" ? sumYears(record) : record[selectedYear];
}

function getYearBreakdown(record) {
  return Object.fromEntries(yearKeys.map((year) => [year, record[year]]));
}

function updateMix(breakdown) {
  const visibleYears = selectedYear === "all" ? yearKeys : [selectedYear];
  const total = visibleYears.reduce((sum, year) => sum + breakdown[year], 0);
  const segments = yearKeys.map((year) => ({
    year,
    share: total && visibleYears.includes(year) ? breakdown[year] / total : 0,
  }));
  let position = 0;
  const gradient = segments.map(({ year, share }) => {
    const start = position;
    position += share * 100;
    return `${yearColors[year]} ${start}% ${position}%`;
  }).join(", ");

  donut.style.setProperty("--donut-gradient", `conic-gradient(${gradient || "#e8ecef 0 100%"})`);
  donutTotal.textContent = total;
  mixDescription.textContent = selectedDestination
    ? `${selectedDestination.destination} students by year group`
    : selectedYear === "all"
      ? "Share of all participating students"
      : `${yearLabels[selectedYear]} participation`;
  donut.setAttribute("aria-label", segments
    .map(({ year, share }) => `${yearLabels[year]}: ${Math.round(share * 100)} percent`)
    .join(", "));

  document.querySelectorAll(".mix-row").forEach((row) => {
    const year = row.dataset.mixYear;
    const count = visibleYears.includes(year) ? breakdown[year] : 0;
    const share = total && count ? Math.round((count / total) * 100) : 0;
    row.querySelector(".mix-count").textContent = count;
    row.querySelector(".mix-share").textContent = `${share}%`;
    row.classList.toggle("is-muted", count === 0);
    row.classList.toggle("is-emphasized", selectedYear === year);
  });
}

function renderDestinationGender(destination) {
  const counts = dashboardData.destinationGenderCounts[destination.destination];
  if (!counts || !counts.Male || !counts.Female) {
    return `
      <div class="detail-gender-unavailable">
        Destination-specific gender counts are not in the table yet.
        Add Male and Female rows for this destination to show this breakdown.
      </div>
    `;
  }

  const male = selectedYear === "all"
    ? sumYears(counts.Male)
    : counts.Male[selectedYear];
  const female = selectedYear === "all"
    ? sumYears(counts.Female)
    : counts.Female[selectedYear];

  return `
    <div class="detail-gender" aria-label="Gender breakdown for ${escapeHtml(destination.destination)}">
      <div><span>Male</span><strong>${male}</strong></div>
      <div><span>Female</span><strong>${female}</strong></div>
    </div>
  `;
}

function renderDetail(destination) {
  if (!destination) {
    detail.hidden = true;
    detail.innerHTML = "";
    return;
  }

  const total = getVisibleTotal(destination);
  const yearRows = yearKeys.map((year) => `
    <div class="detail-year${selectedYear !== "all" && selectedYear !== year ? " is-muted" : ""}">
      <span class="detail-year-dot" style="--year-color:${yearColors[year]}"></span>
      <span>${yearLabels[year]}</span>
      <strong>${destination[year]}</strong>
    </div>
  `).join("");

  detail.innerHTML = `
    <div class="detail-heading">
      <div>
        <span class="detail-eyebrow">DESTINATION SELECTED</span>
        <strong class="detail-destination">${escapeHtml(destination.destination)}</strong>
      </div>
      <div class="detail-total"><strong>${total}</strong><span>students${selectedYear === "all" ? " in total" : ` · ${yearLabels[selectedYear]}`}</span></div>
      <button class="detail-clear" type="button" aria-label="Clear destination selection">Show all</button>
    </div>
    <div class="detail-breakdown" aria-label="Student breakdown by year">${yearRows}</div>
    <div class="detail-gender-heading">GENDER BREAKDOWN</div>
    ${renderDestinationGender(destination)}
  `;
  detail.hidden = false;
  detail.querySelector(".detail-clear").addEventListener("click", () => {
    selectedDestination = null;
    renderDashboard();
  });
}

function renderDestinations() {
  const rows = dashboardData.destinations.map((destination) => ({
    destination,
    count: getVisibleTotal(destination),
  }));
  const max = Math.max(...rows.map((row) => row.count), 1);

  chart.innerHTML = rows.map(({ destination, count }, index) => {
    const isSelected = selectedDestination?.destination === destination.destination;
    const isDimmed = selectedDestination && !isSelected;
    return `
      <button class="bar-row${isSelected ? " is-selected" : ""}${isDimmed ? " is-dimmed" : ""}" type="button" data-destination="${escapeHtml(destination.destination)}" aria-pressed="${isSelected}" aria-label="${escapeHtml(destination.destination)}: ${count} students. Select to see year and gender breakdowns.">
        <span class="bar-label">${escapeHtml(destination.destination)}</span>
        <span class="bar-track" aria-hidden="true">
          <span class="bar-fill" style="width: ${(count / max) * 100}%; animation-delay:${index * 55}ms"></span>
        </span>
        <span class="bar-value">${count}</span>
      </button>
    `;
  }).join("");

  chart.querySelectorAll("[data-destination]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.destination;
      selectedDestination = selectedDestination?.destination === name
        ? null
        : dashboardData.destinations.find((destination) => destination.destination === name);
      renderDashboard();
    });
  });
}

function renderProgrammes() {
  const rows = dashboardData.programmes.map((programme) => ({
    programme,
    count: getVisibleTotal(programme),
  }));
  const max = Math.max(...rows.map((row) => row.count), 1);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  let position = 0;
  const gradient = rows.map(({ count }, index) => {
    const start = position;
    position += total ? (count / total) * 100 : 0;
    return `${programmeColors[index % programmeColors.length]} ${start}% ${position}%`;
  }).join(", ");

  programmeTotal.textContent = total;
  programmeDescription.textContent = selectedYear === "all"
    ? "Participation across all year groups"
    : `Participation for ${yearLabels[selectedYear]}`;
  programmeChart.innerHTML = rows.map(({ programme, count }, index) => `
    <div class="programme-row" role="listitem">
      <span class="programme-name"><strong>${escapeHtml(programme.programme)}</strong></span>
      <span class="programme-track" aria-hidden="true">
        <span class="programme-fill" style="--programme-color:${programmeColors[index % programmeColors.length]}; width: ${(count / max) * 100}%; animation-delay:${index * 55}ms"></span>
      </span>
      <strong class="programme-value">${count}</strong>
    </div>
  `).join("");
  programmeDonut.style.setProperty("--programme-gradient", `conic-gradient(${gradient || "#e8ecef 0 100%"})`);
  programmeDonut.setAttribute("aria-label", rows
    .map(({ programme, count }) => `${programme.programme}: ${total ? Math.round((count / total) * 100) : 0} percent`)
    .join(", "));
  programmeMixLegend.innerHTML = rows.map(({ programme, count }, index) => `
    <div class="programme-mix-row">
      <span><i style="--programme-color:${programmeColors[index % programmeColors.length]}"></i>${escapeHtml(programme.programme)}</span>
      <strong>${total ? Math.round((count / total) * 100) : 0}%</strong>
    </div>
  `).join("");
}

function renderDashboard() {
  const selectedTotal = selectedDestination
    ? getVisibleTotal(selectedDestination)
    : dashboardData.yearTotals[selectedYear];
  const genderPeriod = selectedYear === "all" ? "All year groups" : yearLabels[selectedYear];
  const selectedGenderCounts = selectedDestination
    ? dashboardData.destinationGenderCounts[selectedDestination.destination]
    : dashboardData.genderCounts;
  const maleTotal = selectedGenderCounts?.Male
    ? getVisibleTotal(selectedGenderCounts.Male)
    : null;
  const femaleTotal = selectedGenderCounts?.Female
    ? getVisibleTotal(selectedGenderCounts.Female)
    : null;

  chartTotal.textContent = selectedTotal;
  chartPeriod.textContent = `· ${selectedDestination ? selectedDestination.destination : yearLabels[selectedYear].toLowerCase()}`;
  chartDescription.textContent = selectedDestination
    ? `Student participation for ${selectedDestination.destination}`
    : selectedYear === "all"
      ? "Student participation across all year groups"
      : `Student participation for ${yearLabels[selectedYear]}`;
  filter.value = selectedYear;
  document.querySelector("#grand-total").textContent = selectedTotal;
  document.querySelector("#total-period").textContent = selectedDestination
    ? selectedDestination.destination
    : genderPeriod;
  document.querySelectorAll("[data-year-total]").forEach((value) => {
    value.textContent = dashboardData.yearTotals[value.dataset.yearTotal];
  });
  document.querySelector("#male-total").textContent = maleTotal ?? "—";
  document.querySelector("#female-total").textContent = femaleTotal ?? "—";
  document.querySelector("#male-period").textContent = maleTotal === null
    ? selectedDestination ? "Not available for this destination" : "Gender totals not available"
    : `${selectedDestination ? selectedDestination.destination : genderPeriod} · ${selectedTotal ? Math.round((maleTotal / selectedTotal) * 100) : 0}%`;
  document.querySelector("#female-period").textContent = femaleTotal === null
    ? selectedDestination ? "Not available for this destination" : "Gender totals not available"
    : `${selectedDestination ? selectedDestination.destination : genderPeriod} · ${selectedTotal ? Math.round((femaleTotal / selectedTotal) * 100) : 0}%`;
  document.querySelectorAll(".year-card").forEach((card) => {
    const isSelected = card.dataset.yearSelection === selectedYear;
    card.classList.toggle("is-active", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });

  renderDestinations();
  renderProgrammes();
  renderDetail(selectedDestination);
  updateMix(selectedDestination ? getYearBreakdown(selectedDestination) : dashboardData.yearTotals);
}

function setYear(year) {
  selectedYear = selectedYear === year ? "all" : year;
  renderDashboard();
}

function buildDashboardData(rows) {
  if (!Array.isArray(rows)) {
    throw new Error("Supabase returned an invalid response; expected a list of table rows.");
  }
  if (!rows.length) {
    throw new Error("Supabase connected, but the anon role can see 0 rows. Run the anon SELECT grant and RLS policy in SUPABASE_SETUP.md, then reload.");
  }
  if (rows.some((row) => (
    yearKeys.some((year) => !Number.isInteger(Number(row[yearColumns[year]])) || Number(row[yearColumns[year]]) < 0)
  ))) {
    throw new Error("Supabase returned rows with missing or invalid year counts.");
  }

  const destinations = [];
  const programmes = [];
  const genderCounts = {};
  const destinationGenderCounts = {};
  const recordKeys = new Set();

  rows.forEach((row) => {
    const counts = rowCounts(row);
    if (row.destination && row.gender && !row.programme) {
      const key = `destination-gender:${row.destination}:${row.gender}`;
      if (recordKeys.has(key)) {
        throw new Error(`Duplicate ${row.gender} gender row for ${row.destination}. Remove duplicate rows in Supabase.`);
      }
      recordKeys.add(key);
      destinationGenderCounts[row.destination] ??= {};
      destinationGenderCounts[row.destination][row.gender] = counts;
    } else if (row.destination && !row.programme && !row.gender) {
      const key = `destination:${row.destination}`;
      if (recordKeys.has(key)) {
        throw new Error(`Duplicate destination row for ${row.destination}. Remove duplicate rows in Supabase.`);
      }
      recordKeys.add(key);
      destinations.push({ destination: row.destination, ...counts });
    } else if (row.programme && !row.destination && !row.gender) {
      const key = `programme:${row.programme}`;
      if (recordKeys.has(key)) {
        throw new Error(`Duplicate programme row for ${row.programme}. Remove duplicate rows in Supabase.`);
      }
      recordKeys.add(key);
      programmes.push({ programme: row.programme, ...counts });
    } else if (row.gender && !row.destination && !row.programme) {
      const key = `gender:${row.gender}`;
      if (recordKeys.has(key)) {
        throw new Error(`Duplicate overall gender row for ${row.gender}. Remove duplicate rows in Supabase.`);
      }
      recordKeys.add(key);
      genderCounts[row.gender] = counts;
    }
  });

  const yearTotals = { all: 0, year1: 0, year2: 0, year3: 0 };
  yearKeys.forEach((year) => {
    yearTotals[year] = destinations.reduce((sum, destination) => sum + destination[year], 0);
    yearTotals.all += yearTotals[year];
  });

  if (!destinations.length || !programmes.length) {
    throw new Error("Supabase must contain destination and programme rows with year counts.");
  }
  if (!genderCounts.Male || !genderCounts.Female) {
    throw new Error("Supabase must contain global Male and Female rows with year counts.");
  }

  return { rows, destinations, programmes, genderCounts, destinationGenderCounts, yearTotals };
}

async function loadDashboardData() {
  if (!config?.url || !config?.publishableKey) {
    setStatus("Add your Supabase project URL and anon/publishable key in supabase-config.js.", "error");
    return;
  }

  setStatus("Loading live data from Supabase…", "loading");
  exportButton.disabled = true;
  try {
    const endpoint = new URL("/rest/v1/overseas_student_statistics", config.url);
    endpoint.searchParams.set("select", "id,destination,programme,gender,year_1,year_2,year_3,total");
    endpoint.searchParams.set("order", "id.asc");
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
      },
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase table request failed (${response.status}): ${details}`);
    }

    const rows = await response.json();
    Object.assign(dashboardData, buildDashboardData(rows));
    setStatus("Connected to Supabase · live data", "connected");
    exportButton.disabled = false;
    renderDashboard();
  } catch (error) {
    console.error("Unable to load dashboard data from Supabase.", error);
    setStatus(`Could not load Supabase data. ${error.message}`, "error");
  }
}

filter.addEventListener("change", (event) => {
  selectedYear = event.target.value;
  renderDashboard();
});

document.querySelectorAll(".year-card").forEach((card) => {
  card.addEventListener("click", () => setYear(card.dataset.yearSelection));
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3000);
}

exportButton.addEventListener("click", () => {
  if (!dashboardData.rows.length) {
    showToast("Connect to Supabase before exporting data.");
    return;
  }
  const header = ["Destination", "Programme", "Gender", "Year 1", "Year 2", "Year 3", "Total"];
  const rows = dashboardData.rows.map((row) => [
    row.destination ?? "",
    row.programme ?? "",
    row.gender ?? "",
    ...yearKeys.map((year) => row[yearColumns[year]]),
    row.total ?? sumYears(rowCounts(row)),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "overseas-programmes.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Live dashboard data downloaded as CSV.");
});

loadDashboardData();
