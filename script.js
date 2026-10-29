const destinations = [
  { name: "Chengdu", year1: 30, year2: 38, year3: 26 },
  { name: "Shenzhen", year1: 18, year2: 22, year3: 16 },
  { name: "Chongqing", year1: 16, year2: 32, year3: 30 },
  { name: "Jinan", year1: 24, year2: 31, year3: 31 },
  { name: "KL", year1: 20, year2: 34, year3: 17 },
  { name: "Batam", year1: 16, year2: 29, year3: 33 },
];

const yearTotals = { all: 124 + 186 + 153, year1: 124, year2: 186, year3: 153 };
const yearLabels = { all: "All year groups", year1: "Year 1", year2: "Year 2", year3: "Year 3" };
const yearKeys = ["year1", "year2", "year3"];
const yearColors = { year1: "#f6b6b3", year2: "#e2231a", year3: "#86211e" };
const chart = document.querySelector("#bar-chart");
const filter = document.querySelector("#year-filter");
const chartTotal = document.querySelector("#chart-total");
const chartPeriod = document.querySelector("#chart-period");
const chartDescription = document.querySelector("#chart-description");
const detail = document.querySelector("#destination-detail");
const donut = document.querySelector("#donut-chart");
const donutTotal = document.querySelector("#donut-total");
const donutCaption = document.querySelector("#donut-caption");
const mixDescription = document.querySelector("#mix-description");
const toast = document.querySelector("#toast");
let selectedYear = "all";
let selectedDestination = null;
let toastTimeout;

function getYearBreakdown(destination) {
  if (!destination) {
    return { ...yearTotals };
  }
  return {
    year1: destination.year1,
    year2: destination.year2,
    year3: destination.year3,
  };
}

function updateMix(breakdown) {
  const visibleYears = selectedYear === "all" ? yearKeys : [selectedYear];
  const total = visibleYears.reduce((sum, year) => sum + breakdown[year], 0);
  const segments = yearKeys.map((year) => {
    const share = total ? (visibleYears.includes(year) ? breakdown[year] / total : 0) : 0;
    return { year, share };
  });
  let position = 0;
  const gradient = segments.map(({ year, share }) => {
    const start = position;
    position += share * 100;
    return `${yearColors[year]} ${start}% ${position}%`;
  }).join(", ");

  donut.style.setProperty("--donut-gradient", `conic-gradient(${gradient})`);
  donutTotal.textContent = total;
  donutCaption.textContent = "STUDENTS";
  mixDescription.textContent = selectedDestination
    ? selectedYear === "all"
      ? `${selectedDestination.name} students by year group`
      : `${yearLabels[selectedYear]} students going to ${selectedDestination.name}`
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

function renderDetail(destination) {
  if (!destination) {
    detail.hidden = true;
    detail.innerHTML = "";
    return;
  }

  const breakdown = getYearBreakdown(destination);
  const total = selectedYear === "all" ? yearKeys.reduce((sum, year) => sum + breakdown[year], 0) : breakdown[selectedYear];
  const yearRows = yearKeys.map((year) => {
    const isFiltered = selectedYear !== "all" && selectedYear !== year;
    return `
      <button class="detail-year${isFiltered ? " is-muted" : ""}" type="button" data-year-selection="${year}" aria-label="Show ${yearLabels[year]} students going to ${destination.name}">
        <span class="detail-year-dot" style="--year-color:${yearColors[year]}"></span>
        <span>${yearLabels[year]}</span>
        <strong>${breakdown[year]}</strong>
      </button>
    `;
  }).join("");

  detail.innerHTML = `
    <div class="detail-heading">
      <div>
        <span class="detail-eyebrow">DESTINATION SELECTED</span>
        <strong class="detail-destination">${destination.name}</strong>
      </div>
      <div class="detail-total"><strong>${total}</strong><span>students${selectedYear === "all" ? " in total" : ` · ${yearLabels[selectedYear]}`}</span></div>
      <button class="detail-clear" type="button" aria-label="Clear destination selection">Show all</button>
    </div>
    <div class="detail-breakdown" aria-label="Student breakdown by year">${yearRows}</div>
  `;
  detail.hidden = false;
  detail.querySelector(".detail-clear").addEventListener("click", () => {
    selectedDestination = null;
    renderDashboard();
  });
  detail.querySelectorAll("[data-year-selection]").forEach((button) => {
    button.addEventListener("click", () => setYear(button.dataset.yearSelection));
  });
}

function renderChart() {
  const rows = destinations.map((destination) => ({
    destination,
    count: selectedYear === "all"
      ? destination.year1 + destination.year2 + destination.year3
      : destination[selectedYear],
  }));
  const max = Math.max(...rows.map((row) => row.count));

  chart.innerHTML = rows.map(({ destination, count }, index) => {
    const isSelected = selectedDestination?.name === destination.name;
    const isDimmed = selectedDestination && !isSelected;
    return `
      <button class="bar-row${isSelected ? " is-selected" : ""}${isDimmed ? " is-dimmed" : ""}" type="button" data-destination="${destination.name}" aria-pressed="${isSelected}" aria-label="${destination.name}: ${count} students. Select to see the year breakdown.">
        <span class="bar-label">${destination.name}</span>
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
      selectedDestination = selectedDestination?.name === name
        ? null
        : destinations.find((destination) => destination.name === name);
      renderDashboard();
    });
  });
}

function renderDashboard() {
  const destinationTotal = selectedDestination
    ? selectedYear === "all"
      ? yearKeys.reduce((sum, year) => sum + selectedDestination[year], 0)
      : selectedDestination[selectedYear]
    : yearTotals[selectedYear];
  chartTotal.textContent = destinationTotal;

  if (selectedDestination) {
    chartPeriod.textContent = `· ${selectedDestination.name}`;
    chartDescription.textContent = selectedYear === "all"
      ? `Year-group breakdown for ${selectedDestination.name}`
      : `${yearLabels[selectedYear]} students going to ${selectedDestination.name}`;
  } else {
    chartPeriod.textContent = `· ${yearLabels[selectedYear].toLowerCase()}`;
    chartDescription.textContent = selectedYear === "all"
      ? "Student participation across all year groups"
      : `Student participation for ${yearLabels[selectedYear]}`;
  }

  filter.value = selectedYear;
  document.querySelectorAll(".year-card").forEach((card) => {
    const isSelected = card.dataset.yearSelection === selectedYear;
    card.classList.toggle("is-active", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });

  renderChart();
  renderDetail(selectedDestination);
  updateMix(getYearBreakdown(selectedDestination));
}

function setYear(year) {
  selectedYear = selectedYear === year ? "all" : year;
  renderDashboard();
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

document.querySelector("#export-button").addEventListener("click", () => {
  const header = ["Destination", "Year 1", "Year 2", "Year 3", "Total"];
  const rows = destinations.map(({ name, year1, year2, year3 }) => [
    name, year1, year2, year3, year1 + year2 + year3,
  ]);
  const csv = [header, ...rows].map((row) => row.join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "overseas-study-trips-sample-data.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Sample trip data downloaded as CSV.");
});

renderDashboard();
