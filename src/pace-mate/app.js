const KM_PER_MILE = 1.609344;
const MIN_PACE_SEC_KM = 100;
const MAX_PACE_SEC_KM = 2400;
const STORAGE_KEY = "pace-mate-state-v1";

// Classic Riegel (^1.06) is calibrated on races up to the marathon. Beyond it,
// fatigue, fuelling and time on feet bite harder, so ultras use a steeper
// exponent. Predictions are a ratio of this shared curve, which keeps them
// consistent in both directions (5K -> 100M and 100M -> 5K).
const MARATHON_KM = 42.195;
const RIEGEL_EXPONENT = 1.06;
const ULTRA_EXPONENT = 1.2;

function enduranceFactor(km) {
  if (km <= MARATHON_KM) return Math.pow(km, RIEGEL_EXPONENT);
  return Math.pow(MARATHON_KM, RIEGEL_EXPONENT) * Math.pow(km / MARATHON_KM, ULTRA_EXPONENT);
}

function riegelPrediction(anchorKm, anchorSeconds, targetKm) {
  if (anchorKm <= 0 || anchorSeconds <= 0 || targetKm <= 0) return 0;
  return (anchorSeconds * enduranceFactor(targetKm)) / enduranceFactor(anchorKm);
}

const races = [
  { name: "400 m", km: 0.4 },
  { name: "800 m", km: 0.8 },
  { name: "1500 m", km: 1.5 },
  { name: "1 mile", km: KM_PER_MILE },
  { name: "3K", km: 3 },
  { name: "5K", km: 5 },
  { name: "10K", km: 10 },
  { name: "Half", km: 21.0975 },
  { name: "Marathon", km: 42.195 },
  { name: "50K", km: 50 },
  { name: "50M", km: 80.4672 },
  { name: "100K", km: 100 },
  { name: "100M", km: 160.9344 },
  { name: "200M", km: 321.8688 }
];

const compareRaces = races.filter((race) =>
  ["1 mile", "5K", "10K", "Half", "Marathon", "50K", "50M", "100M"].includes(race.name)
);

const targetPresets = [
  { maxKm: 0.5, goals: [45, 60, 75, 90, 120] },
  { maxKm: 0.9, goals: [120, 150, 180, 210, 240] },
  { maxKm: 2, goals: [240, 300, 360, 420, 480] },
  { maxKm: 3.1, goals: [480, 600, 720, 900, 1050] },
  { maxKm: 5.1, goals: [900, 1050, 1200, 1350, 1500, 1800] },
  { maxKm: 10.1, goals: [2100, 2400, 2700, 3000, 3600, 4200] },
  { maxKm: 21.2, goals: [4500, 5400, 6300, 7200, 8100, 9000] },
  { maxKm: 42.3, goals: [9000, 10800, 12600, 14400, 16200, 18000] },
  { maxKm: 50.1, goals: [14400, 18000, 21600, 25200, 28800] },
  { maxKm: 100.1, goals: [28800, 36000, 43200, 54000, 64800] },
  { maxKm: Infinity, goals: [54000, 64800, 72000, 86400, 108000] }
];

const targetSettings = [
  { name: "1 mile", km: KM_PER_MILE, seconds: 450 },
  { name: "5K", km: 5, seconds: 1425 },
  { name: "10K", km: 10, seconds: 3000 },
  { name: "Half", km: 21.0975, seconds: 6600 },
  { name: "Marathon", km: 42.195, seconds: 14400 },
  { name: "50K", km: 50, seconds: 18000 },
  { name: "50M", km: 80.4672, seconds: 36000 },
  { name: "100K", km: 100, seconds: 43200 },
  { name: "100M", km: 160.9344, seconds: 86400 }
];

const worldRecordPairs = [
  { name: "400 m", km: 0.4, men: { athlete: "Wayde van Niekerk", seconds: 43.03, note: "400 m track WR" }, women: { athlete: "Marita Koch", seconds: 47.60, note: "400 m track WR" } },
  { name: "800 m", km: 0.8, men: { athlete: "David Rudisha", seconds: 100.91, note: "800 m track WR" }, women: { athlete: "Jarmila Kratochvilova", seconds: 113.28, note: "800 m track WR" } },
  { name: "1500 m", km: 1.5, men: { athlete: "Hicham El Guerrouj", seconds: 206.00, note: "1500 m track WR" }, women: { athlete: "Faith Kipyegon", seconds: 228.68, note: "1500 m track WR" } },
  { name: "1 mile", km: KM_PER_MILE, men: { athlete: "Hicham El Guerrouj", seconds: 223.13, note: "mile track WR" }, women: { athlete: "Faith Kipyegon", seconds: 247.64, note: "mile track WR" } },
  { name: "3K", km: 3, men: { athlete: "Daniel Komen", seconds: 437.55, note: "3000 m track WR" }, women: { athlete: "Wang Junxia", seconds: 486.11, note: "3000 m track WR" } },
  { name: "5K", km: 5, men: { athlete: "Berihu Aregawi", seconds: 769, note: "5 km road WR" }, women: { athlete: "Beatrice Chebet", seconds: 834, note: "5 km road WR" } },
  { name: "10K", km: 10, men: { athlete: "Rhonex Kipruto", seconds: 1584, note: "10 km road WR" }, women: { athlete: "Agnes Ngetich", seconds: 1726, note: "10 km road WR" } },
  { name: "Half", km: 21.0975, men: { athlete: "Jacob Kiplimo", seconds: 3440, note: "half marathon road WR" }, women: { athlete: "Letesenbet Gidey", seconds: 3772, note: "half marathon mixed-race WR" } },
  { name: "Marathon", km: 42.195, men: { athlete: "Sabastian Sawe", seconds: 7170, note: "marathon road WR" }, women: { athlete: "Ruth Chepngetich", seconds: 7796, note: "marathon mixed-race WR" } },
  { name: "50K", km: 50, men: { athlete: "CJ Albertson", seconds: 9523, note: "50 km road WR" }, women: { athlete: "Des Linden", seconds: 10794, note: "50 km ultra WR" } },
  { name: "50M", km: 50 * KM_PER_MILE, men: { athlete: "Charles Lawrence", seconds: 17301, note: "50 mile ultra WR" }, women: { athlete: "Courtney Olsen", seconds: 19917, note: "50 mile ultra WR" } },
  { name: "100K", km: 100, men: { athlete: "Aleksandr Sorokin", seconds: 21935, note: "100 km road WR" }, women: { athlete: "Tomoe Abe", seconds: 23591, note: "100 km ultra WR" } },
  { name: "100M", km: 100 * KM_PER_MILE, men: { athlete: "Aleksandr Sorokin", seconds: 39099, note: "100 mile ultra WR" }, women: { athlete: "Ashley Paulson", seconds: 44374, note: "100 mile best, pending ratification" } }
];

const benchmarkMarks = [
  { group: "Elite & Legendary", name: "Roger Bannister", km: KM_PER_MILE, seconds: 239.4, note: "Historic first sub-4 mile" },
  { group: "Elite & Legendary", name: "Kelvin Kiptum", km: 42.195, seconds: 7235, note: "Historic marathon world record" },
  { group: "Elite & Legendary", name: "Eliud Kipchoge", km: 42.195, seconds: 7269, note: "Historic marathon world record" },
  { group: "Elite & Legendary", name: "Camille Herron", km: 200 * KM_PER_MILE, seconds: 120931, note: "200 mile track best" },
  { group: "Celebrities & Public Figures", name: "Mark Zuckerberg", km: 5, seconds: 19 * 60 + 34, note: "Stanford Medicine 5K, 2023" },
  { group: "Celebrities & Public Figures", name: "Kevin Hart", km: 5, seconds: 20 * 60 + 3, note: "public celebrity 5K mark" },
  { group: "Celebrities & Public Figures", name: "Harry Styles", km: 42.195, seconds: 2 * 3600 + 59 * 60 + 13, note: "Berlin Marathon, 2025" },
  { group: "Celebrities & Public Figures", name: "Oprah Winfrey", km: 42.195, seconds: 4 * 3600 + 29 * 60 + 20, note: "Marine Corps Marathon, 1994" },
  { group: "Influencers & YouTubers", name: "Ben Parkes", km: 5, seconds: 15 * 60 + 27, note: "running creator 5K PB" },
  { group: "Influencers & YouTubers", name: "Nick Bare", km: 42.195, seconds: 2 * 3600 + 39 * 60, note: "hybrid athlete marathon PB" },
  { group: "Influencers & YouTubers", name: "Sally McRae", km: 239.66 * KM_PER_MILE, seconds: 310713, note: "Moab 240 champion and creator" }
];

const defaultTargetTimes = Object.fromEntries(targetSettings.map((target) => [String(target.km), target.seconds]));

function storedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function storedBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function defaultDisplayUnit() {
  // First visit: follow the browser region — miles for the US/UK (and the
  // other mile-running regions), kilometres everywhere metric.
  try {
    const locale = new Intl.Locale(navigator.language || "en");
    const region = locale.region ?? locale.maximize().region;
    return ["US", "GB", "LR", "MM"].includes(region) ? "imperial" : "metric";
  } catch {
    return "metric";
  }
}

function storedDisplayUnit(value) {
  if (value === "imperial" || value === "metric") return value;
  return defaultDisplayUnit();
}

function storedAppearance(value) {
  return ["system", "light", "dark"].includes(value) ? value : "system";
}

function storedTargetTimes(value) {
  const saved = value && typeof value === "object" ? value : {};
  const merged = { ...defaultTargetTimes };

  targetSettings.forEach((target) => {
    const key = String(target.km);
    const seconds = Number(saved[key]);
    if (Number.isFinite(seconds)) {
      merged[key] = Math.max(1, Math.min(99 * 3600 + 59 * 60 + 59, seconds));
    }
  });

  return merged;
}

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const storedState = readStoredState();

const state = {
  distanceKm: storedNumber(storedState.distanceKm, 5, 0.1, 500),
  paceSecKm: storedNumber(storedState.paceSecKm, 285, MIN_PACE_SEC_KM, MAX_PACE_SEC_KM),
  timeSec: storedNumber(storedState.timeSec, 5 * 285, 1, 99 * 3600 + 59 * 60 + 59),
  activeInput: "pace",
  displayUnit: storedDisplayUnit(storedState.displayUnit),
  useTargetsAsDefaults: storedBoolean(storedState.useTargetsAsDefaults, true),
  targetTimes: storedTargetTimes(storedState.targetTimes),
  racePredicted: storedBoolean(storedState.racePredicted, true),
  appearance: storedAppearance(storedState.appearance)
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
let renderPending = false;

const elements = {
  distanceValue: $("#distance-value"),
  distanceUnit: $("#distance-unit"),
  paceMin: $("#pace-min"),
  paceSec: $("#pace-sec"),
  paceUnit: $("#pace-unit"),
  speedValue: $("#speed-value"),
  speedUnit: $("#speed-unit"),
  timeHours: $("#time-hours"),
  timeMin: $("#time-min"),
  timeSec: $("#time-sec"),
  paceSlider: $("#pace-slider"),
  raceSlider: $("#race-pace-slider"),
  raceSelect: $("#race-select"),
  currentRaceOption: $("#current-race-option"),
  presetSelect: $("#preset-select"),
  convertPaceKmMin: $("#convert-pace-km-min"),
  convertPaceKmSec: $("#convert-pace-km-sec"),
  convertPaceMiMin: $("#convert-pace-mi-min"),
  convertPaceMiSec: $("#convert-pace-mi-sec"),
  convertSpeedKm: $("#convert-speed-km"),
  convertSpeedMi: $("#convert-speed-mi"),
  convertKm: $("#convert-km"),
  convertMi: $("#convert-mi"),
  useTargetDefaults: $("#use-target-defaults"),
  targetSettingsList: $("#target-settings-list"),
  recordToggle: $("#record-toggle"),
  recordModal: $("#record-modal"),
  recordModalClose: $("#record-modal-close"),
  recordModalBackdrop: $("#record-modal-backdrop"),
  recordToggleLabel: $("#record-toggle-label"),
  recordPanel: $("#record-panel")
};

function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function saveAppState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      distanceKm: state.distanceKm,
      paceSecKm: state.paceSecKm,
      timeSec: state.timeSec,
      displayUnit: state.displayUnit,
      useTargetsAsDefaults: state.useTargetsAsDefaults,
      targetTimes: state.targetTimes,
      racePredicted: state.racePredicted,
      appearance: state.appearance
    }));
  } catch {
    // Private browsing or storage quota errors should not break the calculator.
  }
}

function formatPace(totalSeconds) {
  const safe = Math.max(1, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatGoalTime(totalSeconds) {
  const safe = Math.round(totalSeconds);
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return secs > 0 ? `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${hours}:${String(mins).padStart(2, "0")}`;
  }

  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function secondsToParts(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds));
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60
  };
}

function paceForUnit(secKm, unit) {
  return unit === "mi" ? secKm * KM_PER_MILE : secKm;
}

function setPaceInputs(secKm, unit = elements.paceUnit.value) {
  const seconds = Math.round(paceForUnit(secKm, unit));
  elements.paceMin.value = Math.floor(seconds / 60);
  elements.paceSec.value = String(seconds % 60).padStart(2, "0");
}

function setTimeInputs(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds));
  elements.timeHours.value = Math.floor(safe / 3600);
  elements.timeMin.value = Math.floor((safe % 3600) / 60);
  elements.timeSec.value = safe % 60;
}

function formatDistance(km, unit) {
  if (unit === "mi") {
    return `${(km / KM_PER_MILE).toFixed(km >= 10 ? 1 : 2)} mi`;
  }

  return `${km.toFixed(km >= 10 ? 1 : 2)} km`;
}

function formatSplitDistance(km, unit) {
  if (unit === "mi") {
    const miles = km / KM_PER_MILE;
    return miles < 1 ? `${miles.toFixed(2)} mi` : `${miles.toFixed(miles >= 10 ? 0 : 1)} mi`;
  }

  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }

  return `${km.toFixed(km >= 10 ? 0 : 1).replace(".0", "")} km`;
}

function worldRecordPairFor(km) {
  return worldRecordPairs.find((record) => Math.abs(record.km - km) < 0.02) ?? null;
}

function benchmarkToleranceFor(km) {
  if (km < 2) return 0.002;
  if (km < 15) return 0.03;
  if (km < 110) return 0.12;
  return 0.35;
}

function benchmarkMatches(mark, selectedKm) {
  if (Math.abs(selectedKm - 200 * KM_PER_MILE) < 0.5) {
    const markMiles = mark.km / KM_PER_MILE;
    return markMiles >= 200 && markMiles <= 260;
  }

  return Math.abs(mark.km - selectedKm) < benchmarkToleranceFor(selectedKm);
}

function benchmarkSelectionFor(km) {
  const worldRecord = worldRecordPairFor(km);
  const currentRecords = worldRecord ? [worldRecord.men, worldRecord.women] : [];

  return benchmarkMarks.find((mark) => {
    const duplicatesRecord = currentRecords.some((record) =>
      mark.name === record.athlete && Math.abs(mark.seconds - record.seconds) < 0.5
    );
    return benchmarkMatches(mark, km) && !duplicatesRecord;
  }) ?? null;
}

function comparisonGapText(userSeconds, benchmarkSeconds) {
  const gap = userSeconds - benchmarkSeconds;
  if (Math.abs(gap) < 0.5) return "Same time";
  return gap > 0
    ? `${formatDuration(gap)} slower`
    : `${formatDuration(Math.abs(gap))} quicker`;
}

function defaultFastPaceFor(km) {
  if (km <= 1) return 105;
  if (km <= 2) return 125;
  if (km <= 5.1) return 150;
  if (km <= 10.1) return 160;
  if (km <= 42.3) return 170;
  if (km <= 100.1) return 200;
  return 240;
}

function realisticPaceRangeFor(km) {
  const record = worldRecordPairFor(km);
  const fastestKnownPace = record ? Math.min(record.men.seconds, record.women.seconds) / record.km : defaultFastPaceFor(km);
  const min = Math.max(75, fastestKnownPace * 0.9);
  let max;

  if (km <= 1) max = 540;
  else if (km <= 2) max = 600;
  else if (km <= 5.1) max = 780;
  else if (km <= 10.1) max = 840;
  else if (km <= 21.2) max = 960;
  else if (km <= 42.3) max = 1080;
  else if (km <= 50.1) max = 1200;
  else if (km <= 100.1) max = 1500;
  else max = 1800;

  return { min: Math.round(min), max };
}

function updateDistanceInputs() {
  if (elements.distanceUnit.value === "mi") {
    elements.distanceValue.value = (state.distanceKm / KM_PER_MILE).toFixed(2);
  } else {
    elements.distanceValue.value = state.distanceKm.toFixed(2);
  }
}

function recomputeFromPace() {
  state.timeSec = state.distanceKm * state.paceSecKm;
}

function recomputeFromTime() {
  state.paceSecKm = clamp(state.timeSec / Math.max(state.distanceKm, 0.01), MIN_PACE_SEC_KM, MAX_PACE_SEC_KM);
}

function scheduleRender() {
  saveAppState();
  if (renderPending) return;
  renderPending = true;
  window.requestAnimationFrame(() => {
    renderPending = false;
    render();
  });
}

function syncDisplayUnitButtons() {
  $$(".unit-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.displayUnit === state.displayUnit);
  });
}

function syncUnitInputsToDisplayUnit() {
  elements.distanceUnit.value = state.displayUnit === "metric" ? "km" : "mi";
  elements.paceUnit.value = state.displayUnit === "metric" ? "km" : "mi";
  elements.speedUnit.value = state.displayUnit === "metric" ? "kmh" : "mph";
  updateDistanceInputs();
  setPaceInputs(state.paceSecKm, elements.paceUnit.value);
}

function setDisplayUnit(unit) {
  state.displayUnit = unit === "imperial" ? "imperial" : "metric";
  syncDisplayUnitButtons();
  syncUnitInputsToDisplayUnit();
  saveAppState();
  render();
}

function initializeControls() {
  elements.useTargetDefaults.checked = state.useTargetsAsDefaults;
  syncDisplayUnitButtons();
  syncUnitInputsToDisplayUnit();
  setTimeInputs(state.timeSec);
}

function readDistance() {
  const value = clamp(numeric(elements.distanceValue.value, 5), 0.1, 500);
  state.distanceKm = elements.distanceUnit.value === "mi" ? value * KM_PER_MILE : value;
}

function readPace() {
  const minutes = clamp(numeric(elements.paceMin.value, 4), 1, 40);
  const seconds = clamp(numeric(elements.paceSec.value, 0), 0, 59);
  const raw = minutes * 60 + seconds;
  state.paceSecKm = elements.paceUnit.value === "mi" ? raw / KM_PER_MILE : raw;
  state.paceSecKm = clamp(state.paceSecKm, MIN_PACE_SEC_KM, MAX_PACE_SEC_KM);
}

function readTime() {
  const hours = clamp(numeric(elements.timeHours.value, 0), 0, 99);
  const minutes = clamp(numeric(elements.timeMin.value, 0), 0, 59);
  const seconds = clamp(numeric(elements.timeSec.value, 0), 0, 59);
  state.timeSec = hours * 3600 + minutes * 60 + seconds;
}

function readSpeed() {
  const raw = clamp(numeric(elements.speedValue.value, 12), 1.5, 45);
  const kmh = elements.speedUnit.value === "mph" ? raw * KM_PER_MILE : raw;
  state.paceSecKm = clamp(3600 / kmh, MIN_PACE_SEC_KM, MAX_PACE_SEC_KM);
}

function readConverterPace(unit) {
  const minInput = unit === "km" ? elements.convertPaceKmMin : elements.convertPaceMiMin;
  const secInput = unit === "km" ? elements.convertPaceKmSec : elements.convertPaceMiSec;
  const minutes = clamp(numeric(minInput.value, 4), 1, 60);
  const seconds = clamp(numeric(secInput.value, 0), 0, 59);
  const raw = minutes * 60 + seconds;
  state.paceSecKm = unit === "mi" ? raw / KM_PER_MILE : raw;
  state.paceSecKm = clamp(state.paceSecKm, MIN_PACE_SEC_KM, MAX_PACE_SEC_KM);
}

function readConverterSpeed(unit) {
  const input = unit === "kmh" ? elements.convertSpeedKm : elements.convertSpeedMi;
  const raw = clamp(numeric(input.value, 12), 1, 45);
  const kmh = unit === "mph" ? raw * KM_PER_MILE : raw;
  state.paceSecKm = clamp(3600 / kmh, MIN_PACE_SEC_KM, MAX_PACE_SEC_KM);
}

function speedKmh() {
  return 3600 / state.paceSecKm;
}

function syncActiveChip() {
  const match = $$(".chip").find((chip) => Math.abs(numeric(chip.dataset.km) - state.distanceKm) < 0.005);
  $$(".chip").forEach((chip) => chip.classList.toggle("active", chip === match));
  const presetMatch = Array.from(elements.presetSelect.options).find((option) => Math.abs(numeric(option.value, -1) - state.distanceKm) < 0.005);
  elements.presetSelect.value = match ? "" : presetMatch?.value ?? "";
}

function syncRaceSelect() {
  const match = Array.from(elements.raceSelect.options).find((option) => {
    if (option.value === "current") return false;
    return Math.abs(numeric(option.value, -1) - state.distanceKm) < 0.005;
  });

  if (match) {
    elements.currentRaceOption.hidden = true;
    elements.raceSelect.value = match.value;
    return;
  }

  elements.currentRaceOption.hidden = false;
  elements.currentRaceOption.textContent = `Current - ${formatSplitDistance(state.distanceKm, "km")}`;
  elements.raceSelect.value = "current";
}

function renderRaceTable() {
  $("#predict-label").textContent = state.racePredicted ? "Equivalent race times" : "Same pace held";
  $$(".predict-choice").forEach((button) => {
    button.classList.toggle("active", (button.dataset.predict === "true") === state.racePredicted);
  });

  const html = compareRaces
    .map((race) => {
      const seconds = state.racePredicted
        ? riegelPrediction(state.distanceKm, state.timeSec, race.km)
        : race.km * state.paceSecKm;
      const paceSecKm = seconds / Math.max(race.km, 0.01);
      const pace = state.displayUnit === "metric"
        ? `${formatPace(paceSecKm)} / km`
        : `${formatPace(paceSecKm * KM_PER_MILE)} / mi`;
      const current = Math.abs(race.km - state.distanceKm) < 0.01;
      return `
        <div class="table-row${current ? " current" : ""}">
          <span>${race.name}</span>
          <span>${formatDuration(seconds)}</span>
          <span>${pace}</span>
        </div>
      `;
    })
    .join("");
  $("#race-table").innerHTML = html;
}

function racePlanText() {
  const raceKm = state.distanceKm;
  const metric = state.displayUnit === "metric";
  const unitKm = metric ? 1 : KM_PER_MILE;
  const unitName = metric ? "km" : "mi";
  const stepUnits = raceKm > 42.3 ? 5 : 1;
  const stepKm = unitKm * stepUnits;

  const lines = [
    `Pace Mate race plan — ${raceNameForKm(raceKm)}`,
    `Goal ${formatDuration(state.timeSec)} · ${formatPace(state.paceSecKm)} /km · ${formatPace(state.paceSecKm * KM_PER_MILE)} /mi`,
    ""
  ];

  let units = stepUnits;
  let markKm = stepKm;
  while (markKm < raceKm - 0.01) {
    lines.push(`${units} ${unitName} — ${formatDuration(markKm * state.paceSecKm)}`);
    units += stepUnits;
    markKm += stepKm;
  }
  lines.push(`Finish — ${formatDuration(state.timeSec)}`);

  return lines.join("\n");
}

function renderRecordPanel() {
  const record = worldRecordPairFor(state.distanceKm);
  const benchmark = benchmarkSelectionFor(state.distanceKm);
  const rows = [];

  if (record) {
    rows.push({ label: "Men's WR", ...record.men });
    rows.push({ label: "Women's WR", ...record.women });
  }

  if (benchmark) {
    rows.push({
      label: benchmark.group,
      athlete: benchmark.name,
      seconds: benchmark.seconds,
      note: benchmark.note
    });
  }

  elements.recordToggleLabel.textContent = rows.length ? raceNameForKm(state.distanceKm) : "No benchmarks for distance";
  elements.recordPanel.innerHTML = rows.length
    ? rows.map((row) => `
        <button class="record-row" type="button" data-record-seconds="${row.seconds}">
          <span>
            <em>${row.label}</em>
            <strong>${row.athlete}</strong>
            <small>${row.note}</small>
          </span>
          <span class="record-time">
            <strong>${formatDuration(row.seconds)}</strong>
            <small>${comparisonGapText(state.timeSec, row.seconds)}</small>
          </span>
        </button>
      `).join("")
    : `<p class="record-empty">No world record or benchmark examples for ${raceNameForKm(state.distanceKm)}.</p>`;
}

function raceNameForKm(km) {
  const found = races.find((race) => Math.abs(race.km - km) < 0.01);
  if (found) return found.name;
  return formatSplitDistance(km, "km");
}

function targetGoalsFor(km) {
  return targetPresets.find((preset) => km <= preset.maxKm).goals;
}

function selectedRaceKm() {
  return elements.raceSelect.value === "current"
    ? state.distanceKm
    : numeric(elements.raceSelect.value, state.distanceKm);
}

function targetEntryForDistance(km) {
  return targetSettings.find((target) => Math.abs(target.km - km) < 0.005);
}

function targetTimeForDistance(km) {
  const target = targetEntryForDistance(km);
  return target ? state.targetTimes[String(target.km)] : null;
}

function applyTargetDefaultForDistance(km) {
  if (!state.useTargetsAsDefaults) return false;

  const targetTime = targetTimeForDistance(km);
  if (!targetTime) return false;

  state.timeSec = targetTime;
  state.paceSecKm = clamp(targetTime / Math.max(km, 0.01), MIN_PACE_SEC_KM, MAX_PACE_SEC_KM);
  state.activeInput = "time";
  return true;
}

function setDistanceFromPreset(km, useTarget = true) {
  state.distanceKm = km;
  state.activeInput = "pace";

  const usedTarget = useTarget && applyTargetDefaultForDistance(km);

  if (!usedTarget) {
    recomputeFromPace();
  }

  updateDistanceInputs();
  saveAppState();
  render();
}

function renderTargetTable() {
  const selectedKm = selectedRaceKm();
  const rows = targetGoalsFor(selectedKm)
    .map((goal) => {
      const paceSecKm = goal / selectedKm;
      return `
        <div class="table-row">
          <span>${formatGoalTime(goal)}</span>
          <span>${formatPace(paceSecKm)}</span>
          <span>${formatPace(paceSecKm * KM_PER_MILE)}</span>
        </div>
      `;
    })
    .join("");

  $("#target-race-label").textContent = `${raceNameForKm(selectedKm)} targets`;
  $("#target-table").innerHTML = rows;
}

function setMiniPaceInputs() {
  const kmPace = Math.round(state.paceSecKm);
  const miPace = Math.round(state.paceSecKm * KM_PER_MILE);

  if (![elements.convertPaceKmMin, elements.convertPaceKmSec].includes(document.activeElement)) {
    elements.convertPaceKmMin.value = Math.floor(kmPace / 60);
    elements.convertPaceKmSec.value = String(kmPace % 60).padStart(2, "0");
  }

  if (![elements.convertPaceMiMin, elements.convertPaceMiSec].includes(document.activeElement)) {
    elements.convertPaceMiMin.value = Math.floor(miPace / 60);
    elements.convertPaceMiSec.value = String(miPace % 60).padStart(2, "0");
  }
}

// The cheat sheet window stays anchored while tapping rows — only the
// highlight moves. It re-centres only when the pace leaves the window.
const CHEAT_STEP = 15;
const CHEAT_HALF_WINDOW = 3;
let cheatWindowCenter = null;

function snappedCheatPace(pace) {
  return Math.max(Math.round(pace / CHEAT_STEP) * CHEAT_STEP, 120 + CHEAT_STEP * CHEAT_HALF_WINDOW);
}

function renderCheatSheet() {
  if (
    cheatWindowCenter === null ||
    Math.abs(state.paceSecKm - cheatWindowCenter) > CHEAT_STEP * CHEAT_HALF_WINDOW + CHEAT_STEP / 2
  ) {
    cheatWindowCenter = snappedCheatPace(state.paceSecKm);
  }

  const rows = [];
  for (let i = -CHEAT_HALF_WINDOW; i <= CHEAT_HALF_WINDOW; i += 1) {
    rows.push(cheatWindowCenter + i * CHEAT_STEP);
  }

  $("#cheat-sheet").innerHTML = rows
    .map((pace) => {
      const current = Math.abs(pace - state.paceSecKm) < CHEAT_STEP / 2;
      return `
        <button class="cheat-row${current ? " current" : ""}" type="button" data-pace="${pace}">
          <span>${formatPace(pace)} / km</span>
          <em>&#8644;</em>
          <span>${formatPace(pace * KM_PER_MILE)} / mi</span>
        </button>
      `;
    })
    .join("");
}

function renderConvertTime() {
  $("#convert-time").textContent = formatDuration(state.timeSec);
  $("#convert-time-note").textContent = `${raceNameForKm(state.distanceKm)} · same in both units`;
}

function renderZones() {
  const zoneRows = [
    { name: "Easy", range: [1.18, 1.35], className: "easy" },
    { name: "Long", range: [1.08, 1.18], className: "long" },
    { name: "Tempo", range: [0.97, 1.04], className: "tempo" },
    { name: "Interval", range: [0.88, 0.94], className: "interval" }
  ];

  $("#zone-source").textContent = `From ${formatDuration(state.timeSec)} ${formatSplitDistance(state.distanceKm, "km")}`;
  $("#zone-list").innerHTML = zoneRows
    .map((zone) => {
      const low = state.paceSecKm * zone.range[0];
      const high = state.paceSecKm * zone.range[1];
      return `
        <div class="zone-row ${zone.className}">
          <span>${zone.name}</span>
          <strong>${formatPace(low)}-${formatPace(high)} / km</strong>
          <em>${formatPace(low * KM_PER_MILE)}-${formatPace(high * KM_PER_MILE)} / mi</em>
        </div>
      `;
    })
    .join("");
}

function renderTargetSettings() {
  elements.targetSettingsList.innerHTML = targetSettings
    .map((target) => {
      const parts = secondsToParts(state.targetTimes[String(target.km)]);
      return `
        <div class="target-setting-row" data-target-km="${target.km}">
          <span>${target.name}</span>
          <div class="target-time-fields">
            <input class="target-hours" inputmode="numeric" type="number" min="0" max="99" value="${parts.hours}" aria-label="${target.name} target hours" />
            <em>h</em>
            <input class="target-minutes" inputmode="numeric" type="number" min="0" max="59" value="${parts.minutes}" aria-label="${target.name} target minutes" />
            <em>m</em>
            <input class="target-seconds" inputmode="numeric" type="number" min="0" max="59" value="${parts.seconds}" aria-label="${target.name} target seconds" />
            <em>s</em>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRaceHero() {
  const selectedKm = selectedRaceKm();
  const time = selectedKm * state.paceSecKm;
  $("#race-selected-time").textContent = formatDuration(time);
  $("#race-selected-sub").textContent = `${formatPace(state.paceSecKm)} / km - ${formatPace(state.paceSecKm * KM_PER_MILE)} / mi`;
  $("#race-pace-label").textContent = `${formatPace(state.paceSecKm)} / km`;
  renderTargetTable();
}

function render() {
  const kmh = speedKmh();
  const mph = kmh / KM_PER_MILE;
  const distanceMi = state.distanceKm / KM_PER_MILE;
  const primaryPace = state.displayUnit === "metric"
    ? `${formatPace(state.paceSecKm)} / km`
    : `${formatPace(state.paceSecKm * KM_PER_MILE)} / mi`;

  $("#summary-time").textContent = formatDuration(state.timeSec);
  $("#summary-pace").textContent = primaryPace;
  $("#summary-distance").textContent = state.displayUnit === "metric"
    ? formatDistance(state.distanceKm, "km")
    : formatDistance(state.distanceKm, "mi");
  $("#summary-distance-alt").textContent = state.displayUnit === "metric"
    ? formatDistance(state.distanceKm, "mi")
    : formatDistance(state.distanceKm, "km");
  $("#summary-speed").textContent = state.displayUnit === "metric" ? `${kmh.toFixed(1)} km/h` : `${mph.toFixed(1)} mph`;
  $("#distance-hint").textContent = elements.distanceUnit.value === "km"
    ? `${distanceMi.toFixed(2)} mi`
    : `${state.distanceKm.toFixed(2)} km`;
  $("#pace-hint").textContent = elements.paceUnit.value === "km"
    ? `${formatPace(state.paceSecKm * KM_PER_MILE)} / mi`
    : `${formatPace(state.paceSecKm)} / km`;
  $("#speed-hint").textContent = elements.speedUnit.value === "kmh"
    ? `${mph.toFixed(2)} mph`
    : `${kmh.toFixed(2)} km/h`;
  $("#speed-readout").textContent = `${kmh.toFixed(2)} km/h - ${mph.toFixed(2)} mph`;

  setMiniPaceInputs();

  if (document.activeElement !== elements.convertSpeedKm) {
    elements.convertSpeedKm.value = kmh.toFixed(1);
  }
  if (document.activeElement !== elements.convertSpeedMi) {
    elements.convertSpeedMi.value = mph.toFixed(1);
  }

  elements.paceSlider.value = Math.round(clamp(state.paceSecKm, MIN_PACE_SEC_KM, 900));
  const raceRange = realisticPaceRangeFor(state.distanceKm);
  elements.raceSlider.min = raceRange.min;
  elements.raceSlider.max = raceRange.max;
  elements.raceSlider.value = Math.round(clamp(state.paceSecKm, raceRange.min, raceRange.max));
  if (document.activeElement !== elements.convertKm) {
    elements.convertKm.value = state.distanceKm.toFixed(2);
  }
  if (document.activeElement !== elements.convertMi) {
    elements.convertMi.value = distanceMi.toFixed(2);
  }

  if (document.activeElement !== elements.speedValue) {
    elements.speedValue.value = elements.speedUnit.value === "kmh" ? kmh.toFixed(1) : mph.toFixed(1);
  }

  if (![elements.timeHours, elements.timeMin, elements.timeSec].includes(document.activeElement)) {
    setTimeInputs(state.timeSec);
  }
  if (document.activeElement !== elements.paceMin && document.activeElement !== elements.paceSec) {
    setPaceInputs(state.paceSecKm);
  }

  syncActiveChip();
  syncRaceSelect();
  renderRaceHero();
  renderRaceTable();
  renderRecordPanel();
  renderCheatSheet();
  renderConvertTime();
  renderZones();
}

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === tab.dataset.screen));
    render();
  });
});

$$(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    elements.presetSelect.value = "";
    setDistanceFromPreset(numeric(chip.dataset.km, 5));
  });
});

elements.presetSelect.addEventListener("change", () => {
  if (!elements.presetSelect.value) return;
  setDistanceFromPreset(numeric(elements.presetSelect.value, 5));
});

elements.distanceValue.addEventListener("input", () => {
  readDistance();
  state.activeInput = "pace";
  recomputeFromPace();
  scheduleRender();
});

elements.distanceUnit.addEventListener("change", () => {
  state.displayUnit = elements.distanceUnit.value === "mi" ? "imperial" : "metric";
  syncDisplayUnitButtons();
  updateDistanceInputs();
  saveAppState();
  render();
});

[elements.paceMin, elements.paceSec].forEach((input) => {
  input.addEventListener("input", () => {
    readPace();
    state.activeInput = "pace";
    recomputeFromPace();
    scheduleRender();
  });
});

elements.paceUnit.addEventListener("change", () => {
  state.displayUnit = elements.paceUnit.value === "mi" ? "imperial" : "metric";
  syncDisplayUnitButtons();
  setPaceInputs(state.paceSecKm, elements.paceUnit.value);
  saveAppState();
  render();
});

elements.speedValue.addEventListener("input", () => {
  readSpeed();
  state.activeInput = "pace";
  recomputeFromPace();
  setPaceInputs(state.paceSecKm);
  scheduleRender();
});

elements.speedUnit.addEventListener("change", () => {
  state.displayUnit = elements.speedUnit.value === "mph" ? "imperial" : "metric";
  syncDisplayUnitButtons();
  saveAppState();
  render();
});

[elements.convertPaceKmMin, elements.convertPaceKmSec].forEach((input) => {
  input.addEventListener("input", () => {
    readConverterPace("km");
    state.activeInput = "pace";
    recomputeFromPace();
    setPaceInputs(state.paceSecKm);
    scheduleRender();
  });
});

[elements.convertPaceMiMin, elements.convertPaceMiSec].forEach((input) => {
  input.addEventListener("input", () => {
    readConverterPace("mi");
    state.activeInput = "pace";
    recomputeFromPace();
    setPaceInputs(state.paceSecKm);
    scheduleRender();
  });
});

elements.convertSpeedKm.addEventListener("input", () => {
  readConverterSpeed("kmh");
  state.activeInput = "pace";
  recomputeFromPace();
  setPaceInputs(state.paceSecKm);
  scheduleRender();
});

elements.convertSpeedMi.addEventListener("input", () => {
  readConverterSpeed("mph");
  state.activeInput = "pace";
  recomputeFromPace();
  setPaceInputs(state.paceSecKm);
  scheduleRender();
});

[elements.timeHours, elements.timeMin, elements.timeSec].forEach((input) => {
  input.addEventListener("input", () => {
    readTime();
    state.activeInput = "time";
    recomputeFromTime();
    scheduleRender();
  });
});

elements.paceSlider.addEventListener("input", () => {
  state.paceSecKm = numeric(elements.paceSlider.value, 285);
  state.activeInput = "pace";
  recomputeFromPace();
  setPaceInputs(state.paceSecKm);
  scheduleRender();
});

elements.raceSlider.addEventListener("input", () => {
  state.paceSecKm = numeric(elements.raceSlider.value, 285);
  state.activeInput = "pace";
  recomputeFromPace();
  setPaceInputs(state.paceSecKm);
  scheduleRender();
});

elements.recordToggle.addEventListener("click", () => {
  elements.recordModal.classList.remove("hidden");
  elements.recordModalClose.focus();
});

function closeRecordModal() {
  elements.recordModal.classList.add("hidden");
  elements.recordToggle.focus();
}

elements.recordModalClose.addEventListener("click", closeRecordModal);
elements.recordModalBackdrop.addEventListener("click", closeRecordModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.recordModal.classList.contains("hidden")) {
    closeRecordModal();
  }
});

elements.recordPanel.addEventListener("click", (event) => {
  const row = event.target.closest(".record-row");
  if (!row) return;

  state.timeSec = numeric(row.dataset.recordSeconds, state.timeSec);
  state.activeInput = "time";
  recomputeFromTime();
  setPaceInputs(state.paceSecKm);
  setTimeInputs(state.timeSec);
  scheduleRender();
});

elements.raceSelect.addEventListener("change", () => {
  if (elements.raceSelect.value === "current") {
    renderRaceHero();
    return;
  }

  state.distanceKm = numeric(elements.raceSelect.value, 5);
  setDistanceFromPreset(state.distanceKm);
});

elements.useTargetDefaults.addEventListener("change", () => {
  state.useTargetsAsDefaults = elements.useTargetDefaults.checked;
  if (state.useTargetsAsDefaults && applyTargetDefaultForDistance(state.distanceKm)) {
    saveAppState();
    render();
    return;
  }

  saveAppState();
});

elements.targetSettingsList.addEventListener("input", (event) => {
  const row = event.target.closest(".target-setting-row");
  if (!row) return;

  const km = row.dataset.targetKm;
  const hours = clamp(numeric(row.querySelector(".target-hours").value, 0), 0, 99);
  const minutes = clamp(numeric(row.querySelector(".target-minutes").value, 0), 0, 59);
  const seconds = clamp(numeric(row.querySelector(".target-seconds").value, 0), 0, 59);
  const total = Math.max(1, hours * 3600 + minutes * 60 + seconds);
  state.targetTimes[km] = total;
  saveAppState();

  if (Math.abs(numeric(km) - state.distanceKm) < 0.005 && state.useTargetsAsDefaults) {
    applyTargetDefaultForDistance(state.distanceKm);
    scheduleRender();
  }
});

$$(".mode-choice").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.raceMode;
    $$(".mode-choice").forEach((item) => item.classList.toggle("active", item === button));
    $$(".race-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== mode));
    $$(".target-panel").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== mode));
    renderRaceHero();
  });
});

$$(".unit-choice").forEach((button) => {
  button.addEventListener("click", () => {
    setDisplayUnit(button.dataset.displayUnit);
  });
});

elements.convertKm.addEventListener("input", () => {
  state.distanceKm = clamp(numeric(elements.convertKm.value, 5), 0, 500);
  state.activeInput = "pace";
  recomputeFromPace();
  updateDistanceInputs();
  scheduleRender();
});

elements.convertMi.addEventListener("input", () => {
  state.distanceKm = clamp(numeric(elements.convertMi.value, 3.11), 0, 310) * KM_PER_MILE;
  state.activeInput = "pace";
  recomputeFromPace();
  updateDistanceInputs();
  scheduleRender();
});

$$(".predict-choice").forEach((button) => {
  button.addEventListener("click", () => {
    state.racePredicted = button.dataset.predict === "true";
    saveAppState();
    render();
  });
});

$("#share-plan").addEventListener("click", async () => {
  const text = racePlanText();
  const button = $("#share-plan");

  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      // Cancelled or unavailable — fall through to clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = "Share plan";
    }, 1600);
  } catch {
    // Clipboard unavailable (e.g. insecure context) — nothing else to try.
  }
});

$("#cheat-sheet").addEventListener("click", (event) => {
  const row = event.target.closest(".cheat-row");
  if (!row) return;

  state.paceSecKm = clamp(numeric(row.dataset.pace, state.paceSecKm), MIN_PACE_SEC_KM, MAX_PACE_SEC_KM);
  state.activeInput = "pace";
  recomputeFromPace();
  setPaceInputs(state.paceSecKm);
  scheduleRender();
});

const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const resolved = state.appearance === "system"
    ? (themeMedia.matches ? "dark" : "light")
    : state.appearance;
  document.documentElement.dataset.theme = resolved;
  $$(".appearance-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.appearance === state.appearance);
  });
}

themeMedia.addEventListener("change", () => {
  if (state.appearance === "system") applyTheme();
});

$$(".appearance-choice").forEach((button) => {
  button.addEventListener("click", () => {
    state.appearance = button.dataset.appearance;
    saveAppState();
    applyTheme();
  });
});

applyTheme();
initializeControls();
renderTargetSettings();
render();
