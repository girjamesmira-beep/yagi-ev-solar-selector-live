(() => {
  "use strict";

  const CHARGE_EFFICIENCY = 0.90;
  const DIRECT_SOLAR_POWER_FACTOR = 0.75;
  const PANEL_KWP = 0.55;

  const EVS = {
    "atto1-30": { name: "BYD Seagull / Dolphin Surf · 30 kWh", battery: 30.0, consumption: 13.0, acLimit: 6.6 },
    "atto1-39": { name: "BYD Seagull / ATTO 1 · 38.88 kWh", battery: 38.88, consumption: 13.3, acLimit: 6.6 },
    "dolphin-45": { name: "BYD Dolphin · 44.9 kWh", battery: 44.9, consumption: 15.2, acLimit: 7.0 },
    "atto3-60": { name: "BYD ATTO 3 · 60.48 kWh", battery: 60.48, consumption: 16.0, acLimit: 7.0 }
  };

  const els = {
    form: document.querySelector("#selector-form"),
    preset: document.querySelector("#ev-preset"),
    battery: document.querySelector("#battery-capacity"),
    consumption: document.querySelector("#consumption"),
    dailyKm: document.querySelector("#daily-km"),
    dailyKmOutput: document.querySelector("#daily-km-output"),
    pvSize: document.querySelector("#pv-size"),
    evAcLimit: document.querySelector("#ev-ac-limit"),
    sunHours: document.querySelector("#sun-hours"),
    performanceRatio: document.querySelector("#performance-ratio"),
    gridOptions: document.querySelector("#grid-options"),
    reset: document.querySelector("#reset-button"),
    error: document.querySelector("#form-error"),
    status: document.querySelector("#result-status"),
    dailyEnergy: document.querySelector("#daily-energy"),
    coverage: document.querySelector("#solar-coverage"),
    coverageBar: document.querySelector("#coverage-bar"),
    progress: document.querySelector(".progress-track"),
    solarYield: document.querySelector("#solar-yield"),
    solarRange: document.querySelector("#solar-range"),
    solarTime: document.querySelector("#solar-time"),
    gridEnergy: document.querySelector("#grid-energy"),
    gridEnergyLabel: document.querySelector("#grid-energy-label"),
    gridTime: document.querySelector("#grid-time"),
    assumedSunHours: document.querySelector("#assumed-sun-hours"),
    assumedPerformance: document.querySelector("#assumed-performance"),
    fullChargeDays: document.querySelector("#full-charge-days"),
    energyNote: document.querySelector("#energy-note"),
    packageGrid: document.querySelector("#package-grid"),
    quoteLink: document.querySelector("#quote-link"),
    copyResult: document.querySelector("#copy-result"),
    toast: document.querySelector("#toast")
  };

  let gridSupport = 3.3;
  let lastSummary = "";
  let toastTimer;

  function finiteNumber(value) {
    if (String(value).trim() === "") return NaN;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function ceilToPanel(value) {
    return Math.max(PANEL_KWP, Math.ceil(value / PANEL_KWP - 1e-9) * PANEL_KWP);
  }

  function formatHours(hours) {
    if (!Number.isFinite(hours)) return "—";
    if (hours === 0) return "0 h";
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    return `${round(hours, 1).toFixed(1)} h`;
  }

  function formatDays(days) {
    if (!Number.isFinite(days)) return "—";
    if (days === 0) return "0 days";
    return `${round(days, 1).toFixed(1)} ${round(days, 1) === 1 ? "day" : "days"}`;
  }

  function readInputs() {
    const values = {
      batteryCapacity: finiteNumber(els.battery.value),
      consumption: finiteNumber(els.consumption.value),
      dailyKm: finiteNumber(els.dailyKm.value),
      pvSize: finiteNumber(els.pvSize.value),
      evAcLimit: finiteNumber(els.evAcLimit.value),
      sunHours: finiteNumber(els.sunHours.value),
      performanceRatio: finiteNumber(els.performanceRatio.value) / 100,
      gridSupport
    };

    const checks = [
      ["Battery capacity", values.batteryCapacity, 5, 200],
      ["EV consumption", values.consumption, 5, 50],
      ["Daily driving", values.dailyKm, 0, 300],
      ["PV size", values.pvSize, 0, 100],
      ["EV AC charge rate", values.evAcLimit, 1, 22],
      ["Peak-sun-hours", values.sunHours, 2, 8],
      ["PV performance factor", values.performanceRatio * 100, 50, 95]
    ];

    const invalid = checks.find(([, value, min, max]) => !Number.isFinite(value) || value < min || value > max);
    if (invalid) {
      els.error.textContent = `${invalid[0]} must be between ${invalid[2]} and ${invalid[3]}.`;
      els.error.hidden = false;
      return null;
    }

    els.error.hidden = true;
    return values;
  }

  function calculate(input, chargerPower = Math.min(input.evAcLimit, input.pvSize >= 5 ? 7 : 3.3)) {
    const tractionEnergy = input.dailyKm * input.consumption / 100;
    const wallEnergy = tractionEnergy / CHARGE_EFFICIENCY;
    const solarYield = input.pvSize * input.sunHours * input.performanceRatio;
    const solarToEv = Math.min(wallEnergy, solarYield);
    const gridNeed = Math.max(0, wallEnergy - solarYield);
    const coverage = wallEnergy === 0 ? 100 : Math.min(100, solarYield / wallEnergy * 100);
    const solarChargePower = Math.min(input.evAcLimit, chargerPower, input.pvSize * DIRECT_SOLAR_POWER_FACTOR);
    const solarTime = wallEnergy === 0 ? 0 : solarChargePower > 0 ? wallEnergy / solarChargePower : Infinity;
    const gridChargePower = Math.min(input.evAcLimit, chargerPower, input.gridSupport);
    const gridTime = gridNeed === 0 ? 0 : gridChargePower > 0 ? gridNeed / gridChargePower : Infinity;
    const fullBatteryWallEnergy = input.batteryCapacity / CHARGE_EFFICIENCY;
    const fullChargeDays = solarYield > 0 ? fullBatteryWallEnergy / solarYield : Infinity;
    const solarKm = input.consumption > 0 ? solarYield * CHARGE_EFFICIENCY / input.consumption * 100 : 0;

    return {
      tractionEnergy,
      wallEnergy,
      solarYield,
      solarToEv,
      gridNeed,
      coverage,
      solarChargePower,
      solarTime,
      gridChargePower,
      gridTime,
      fullBatteryWallEnergy,
      fullChargeDays,
      solarKm,
      chargerPower
    };
  }

  function inverterFor(pvKwp) {
    const sizes = [3.6, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80];
    const target = Math.max(3.6, pvKwp / 1.25);
    const inverterKw = sizes.find(size => size >= target) || Math.ceil(target / 10) * 10;
    const phase = inverterKw <= 8
      ? "230 V single-phase hybrid inverter"
      : "Three-phase hybrid inverter, subject to 3-phase service";
    return { inverterKw, phase };
  }

  function packageFor(input, kind) {
    const dailyWall = input.dailyKm * input.consumption / 100 / CHARGE_EFFICIENCY;
    const targets = {
      entry: {
        name: "Entry",
        subtitle: "Lowest practical cost; EEU fills more of the cloudy-day gap.",
        ratio: 0.60,
        minimumPv: 1.65,
        charger: Math.min(3.3, input.evAcLimit),
        battery: "No stationary battery required"
      },
      balanced: {
        name: "Balanced",
        subtitle: "Designed around one typical day of driving from solar.",
        ratio: 1.05,
        minimumPv: 3.30,
        charger: Math.min(3.3, input.evAcLimit),
        battery: "Battery-ready; 5 kWh optional for outages"
      },
      faster: {
        name: "Faster",
        subtitle: "More solar margin and faster AC charging where the service allows it.",
        ratio: 1.30,
        minimumPv: 5.50,
        charger: Math.min(7, input.evAcLimit),
        battery: "5–10 kWh optional for night or outage use"
      }
    };

    const target = targets[kind];
    const requiredPv = dailyWall === 0
      ? target.minimumPv
      : dailyWall * target.ratio / (input.sunHours * input.performanceRatio);
    const pvKwp = Math.max(target.minimumPv, ceilToPanel(requiredPv));
    const panelCount = Math.ceil(pvKwp / PANEL_KWP - 1e-9);
    const pkgInput = { ...input, pvSize: pvKwp };
    const calc = calculate(pkgInput, target.charger);
    const inverter = inverterFor(pvKwp);
    const gridPowerNote = input.gridSupport === 0
      ? "Off-grid operation requires a verified grid-forming system and charging controls"
      : target.charger > input.gridSupport
      ? `Dynamic EV charging control capped to the selected ${input.gridSupport.toFixed(1)} kW EEU import allowance`
      : `EV charger coordinated with the ${input.gridSupport.toFixed(1)} kW EEU allowance`;

    return {
      ...target, ...calc, ...inverter, pvKwp, panelCount, gridPowerNote,
      gridAvailable: input.gridSupport > 0,
      subtitle: input.gridSupport === 0 && kind === "entry"
        ? "Smallest PV option; check the daily energy shortfall before choosing."
        : target.subtitle,
      battery: input.gridSupport === 0
        ? "Battery requirement to be confirmed for the off-grid configuration"
        : target.battery
    };
  }

  function packageMarkup(pkg, recommended = false) {
    const gridText = pkg.gridNeed <= 0.05
      ? "0 kWh typical"
      : `${pkg.gridNeed.toFixed(1)} kWh/day`;
    const fullTime = pkg.solarChargePower > 0
      ? formatHours(pkg.fullBatteryWallEnergy / pkg.solarChargePower)
      : "—";

    return `
      <article class="package-card ${recommended ? "recommended" : ""}">
        ${recommended ? '<span class="recommended-tag">Recommended</span>' : ""}
        <div class="package-topline">
          <h3 class="package-title">${pkg.name}</h3>
          <span class="status-pill">${Math.round(pkg.coverage)}% solar</span>
        </div>
        <p class="package-subtitle">${pkg.subtitle}</p>
        <div class="package-power">
          <strong>${pkg.pvKwp.toFixed(2)}</strong>
          <span>kWp PV · ${pkg.panelCount} × 550 W</span>
        </div>
        <div class="package-stats">
          <div class="package-stat"><span>Daily solar</span><strong>${pkg.solarYield.toFixed(1)} kWh</strong></div>
          <div class="package-stat"><span>${pkg.gridAvailable ? "EEU top-up" : "Unmet energy"}</span><strong>${gridText}</strong></div>
          <div class="package-stat"><span>Daily charge time</span><strong>${formatHours(pkg.solarTime)}</strong></div>
          <div class="package-stat"><span>Full-battery time*</span><strong>${fullTime}</strong></div>
        </div>
        <ul class="package-list">
          <li>${pkg.inverterKw} kW ${pkg.phase}</li>
          <li>${pkg.charger.toFixed(1)} kW AC EV charger / EVSE</li>
          <li>Smart meter or CT commissioned to 0 W export</li>
          <li>${pkg.gridPowerNote}</li>
          <li>${pkg.battery}</li>
        </ul>
        <p class="package-footnote">*Equivalent charging hours at estimated direct-solar power; actual charging is spread across available daylight and weather.</p>
      </article>
    `;
  }

  function updateStatus(calc, input) {
    els.status.className = "status-pill";
    els.energyNote.className = "energy-note";

    if (input.dailyKm === 0) {
      els.status.textContent = "No daily driving";
      els.energyNote.textContent = "Enter the expected daily distance to size the system around real energy use.";
      return;
    }

    if (input.pvSize === 0 && input.gridSupport === 0) {
      els.status.textContent = "No charging source";
      els.status.classList.add("danger");
      els.energyNote.classList.add("danger");
      els.energyNote.textContent = "Neither PV nor EEU support is available. Add a charging source before selecting equipment.";
      return;
    }

    if (calc.gridNeed > 0.05 && input.gridSupport === 0) {
      els.status.textContent = "Daily shortfall";
      els.status.classList.add("danger");
      els.energyNote.classList.add("danger");
      els.energyNote.textContent = `PV is short by ${calc.gridNeed.toFixed(1)} kWh on the assumed solar day and no EEU support is selected. Increase PV, reduce daily distance, or accept multi-day charging.`;
      return;
    }

    if (calc.coverage >= 100) {
      els.status.textContent = "Solar sized";
      els.energyNote.textContent = input.gridSupport > 0
        ? "Estimated daily PV energy covers the selected driving need. Available EEU supply can supplement solar when weather or site loads reduce production."
        : "Estimated daily PV energy covers the selected driving need. With no EEU support, charging depends on daylight and a compatible off-grid configuration; battery and grid-forming requirements need verification.";
      return;
    }

    els.status.textContent = "Grid assisted";
    els.status.classList.add("warning");
    els.energyNote.classList.add("warning");
    els.energyNote.textContent = `Solar covers about ${Math.round(calc.coverage)}% of daily EV energy. EEU supplies the remaining ${calc.gridNeed.toFixed(1)} kWh without intentional PV export.`;
  }

  function buildSummary(input, calc, packages) {
    return [
      "Yagi GreenVision Ethiopia — EV solar pre-sizing",
      `Vehicle: ${EVS[els.preset.value]?.name || "Other EV / entered manually"}`,
      `EV battery: ${input.batteryCapacity.toFixed(1)} kWh`,
      `Daily driving: ${input.dailyKm.toFixed(0)} km`,
      `Daily charger energy: ${calc.wallEnergy.toFixed(1)} kWh`,
      `Entered PV: ${input.pvSize.toFixed(1)} kWp`,
      `Estimated daily solar: ${calc.solarYield.toFixed(1)} kWh (${Math.round(calc.coverage)}% coverage)`,
      `${input.gridSupport > 0 ? "Estimated EEU supplement" : "Unmet energy"}: ${calc.gridNeed.toFixed(1)} kWh/day`,
      `EEU support selected: ${input.gridSupport.toFixed(1)} kW`,
      `Recommended balanced package: ${packages[1].pvKwp.toFixed(2)} kWp PV, ${packages[1].inverterKw} kW hybrid inverter, ${packages[1].charger.toFixed(1)} kW EVSE, 0 W export control`,
      `Assumptions: 90% charging efficiency; ${input.sunHours.toFixed(1)} peak-sun-hours/day; ${Math.round(input.performanceRatio * 100)}% PV performance factor.`,
      "Indicative only — site survey and electrical verification required."
    ].join("\n");
  }

  function update() {
    const input = readInputs();
    els.dailyKmOutput.value = `${els.dailyKm.value} km`;
    els.dailyKmOutput.textContent = `${els.dailyKm.value} km`;
    if (!input) return;

    const calc = calculate(input);
    const packages = [
      packageFor(input, "entry"),
      packageFor(input, "balanced"),
      packageFor(input, "faster")
    ];

    els.dailyEnergy.textContent = calc.wallEnergy.toFixed(1);
    els.coverage.textContent = `${Math.round(calc.coverage)}%`;
    els.coverageBar.style.width = `${Math.min(100, calc.coverage)}%`;
    els.progress.setAttribute("aria-valuenow", Math.round(calc.coverage));
    els.solarYield.textContent = `${calc.solarYield.toFixed(1)} kWh`;
    els.solarRange.textContent = `≈ ${Math.round(calc.solarKm)} km/day`;
    els.solarTime.textContent = formatHours(calc.solarTime);
    els.gridEnergy.textContent = `${calc.gridNeed.toFixed(1)} kWh`;
    els.gridEnergyLabel.textContent = input.gridSupport > 0 ? "EEU supplement" : "Unmet energy";
    els.assumedSunHours.textContent = `${input.sunHours.toFixed(1)} PSH/day`;
    els.assumedPerformance.textContent = `${Math.round(input.performanceRatio * 100)}%`;
    els.gridTime.textContent = calc.gridNeed <= 0.05
      ? "No import needed"
      : Number.isFinite(calc.gridTime)
        ? `≈ ${formatHours(calc.gridTime)} at allowed grid power`
        : "No grid support selected";
    els.fullChargeDays.textContent = formatDays(calc.fullChargeDays);

    updateStatus(calc, input);
    els.packageGrid.innerHTML = packages.map((pkg, index) => packageMarkup(pkg, index === 1)).join("");

    lastSummary = buildSummary(input, calc, packages);
    const quoteMessage = encodeURIComponent(`EV solar selector result:\n\n${lastSummary}`);
    const vehicle = EVS[els.preset.value]?.name || "";
    els.quoteLink.href = `quotation.html?solution=ev&message=${quoteMessage}&vehicle=${encodeURIComponent(vehicle)}`;
  }

  function setGridSupport(value) {
    gridSupport = value;
    els.gridOptions.querySelectorAll("button").forEach(button => {
      const active = Number(button.dataset.grid) === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    update();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  async function copySummary() {
    if (!lastSummary) return;
    try {
      await navigator.clipboard.writeText(lastSummary);
      showToast("Recommendation copied");
    } catch {
      const area = document.createElement("textarea");
      area.value = lastSummary;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      showToast("Recommendation copied");
    }
  }

  els.preset.addEventListener("change", () => {
    const ev = EVS[els.preset.value];
    if (ev) {
      els.battery.value = ev.battery;
      els.consumption.value = ev.consumption;
      els.evAcLimit.value = ev.acLimit;
    }
    const manual = els.preset.value === "custom";
    els.battery.toggleAttribute("readonly", !manual);
    els.consumption.toggleAttribute("readonly", !manual);
    els.evAcLimit.toggleAttribute("readonly", !manual);
    update();
  });

  els.form.addEventListener("input", update);
  els.gridOptions.addEventListener("click", event => {
    const button = event.target.closest("button[data-grid]");
    if (button) setGridSupport(Number(button.dataset.grid));
  });
  els.copyResult.addEventListener("click", copySummary);
  els.reset.addEventListener("click", () => {
    els.form.reset();
    els.preset.value = "atto1-39";
    els.battery.value = "38.88";
    els.consumption.value = "13.3";
    els.evAcLimit.value = "6.6";
    els.battery.readOnly = true;
    els.consumption.readOnly = true;
    els.evAcLimit.readOnly = true;
    setGridSupport(3.3);
    showToast("Defaults restored");
  });

  window.YagiCalculator = Object.freeze({
    calculate,
    packageFor,
    constants: Object.freeze({
      chargeEfficiency: CHARGE_EFFICIENCY,
      directSolarPowerFactor: DIRECT_SOLAR_POWER_FACTOR,
      panelKwp: PANEL_KWP
    })
  });

  els.battery.readOnly = true;
  els.consumption.readOnly = true;
  els.evAcLimit.readOnly = true;
  update();
})();
