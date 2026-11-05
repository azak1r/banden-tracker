// ===== Simple data cache =====
const dataCache = {
  vehicles: null,
  tires: {},
  ts: 0
};
const CACHE_MS = 30_000;

function isCacheFresh() {
  return Date.now() - dataCache.ts < CACHE_MS;
}

async function getVehiclesCached() {
  if (dataCache.vehicles && isCacheFresh()) return dataCache.vehicles;
  dataCache.vehicles = await loadVehiclesFromApi();
  dataCache.ts = Date.now();
  return dataCache.vehicles;
}

async function getTiresCached(plate) {
  if (dataCache.tires[plate] && isCacheFresh()) return dataCache.tires[plate];
  const tires = await loadTiresFromApi(plate);
  dataCache.tires[plate] = tires;
  return tires;
}

function clearCache() {
  dataCache.vehicles = null;
  dataCache.tires = {};
  dataCache.ts = 0;
}

async function initApp() {
  if (!isLoggedIn()) {
    showLogin();
    return;
  }

  const user = getCurrentUser();
  if (user?.mustChangePassword) {
    document.getElementById("change-password-modal").style.display = "flex";
    return;
  }

  applyRoleUI();

  try {
    await renderVehicles();
    await updateAlertsBadge();
    // any other startup calls
  } catch (err) {
    console.error(err);
    // If the token is invalid/expired, force re-login
    if (err.message?.includes("401") || err.status === 401) {
      logout();
      showLogin();
    } else {
      alert("Kon de app niet starten. Controleer of PocketBase draait.");
    }
  }
}

// Call this on load instead of the old startup code
initApp();

// ===== Bottom navigation =====
const navItems = document.querySelectorAll(".nav-item");
const pages = {
  0: "page-dashboard",
  1: "page-vehicles",
  2: "page-alerts",
  3: "page-stock",
  4: "page-todo"
};

navItems.forEach((item, index) => {
  item.addEventListener("click", async () => {
    navItems.forEach(nav => nav.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    const page = document.getElementById(pages[index]);
    if (page) page.classList.add("active");

    if (index === 1) {
      const search = document.getElementById("vehicle-search");
      await renderVehiclesList(search ? search.value : "");
    }
    if (index === 2) {          // alerts tab
      await renderAlertsPage();
    }
  });
});

// ===== Theme =====
const themeToggle = document.getElementById("theme-toggle");

function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
    if (themeToggle) themeToggle.textContent = saved === "dark" ? "☀️" : "🌙";
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
    if (themeToggle) themeToggle.textContent = "☀️";
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const newTheme = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    themeToggle.textContent = newTheme === "dark" ? "☀️" : "🌙";
  });
}
loadTheme();

// ===== API mappers =====
function mapVehicle(record) {
  return {
    id: record.id,
    plate: record.plate,
    type: record.type,
    brand: record.brand || "",
    model: record.model || "",
    driver: record.driver || "",
    axles: record.axles || [],
    lastInspection: record.lastInspection || null,
    lastInspector: record.lastInspector || "",
    createdAt: record.createdAt || record.created
  };
}

function mapTire(record) {
  return {
    id: record.id,
    vehiclePlate: record.vehiclePlate,
    axleNumber: record.axleNumber,
    side: record.side,
    dualPosition: record.dualPosition || null,
    positionLabel: record.positionLabel,
    brand: record.brand || "",
    type: record.type || "",
    model: record.size || "",
    size: record.size || "",
    currentDepth: record.currentDepth,
    depthInside: record.depthInside ?? null,
    depthMiddle: record.depthMiddle ?? null,
    depthOutside: record.depthOutside ?? null,
    lowestPosition: record.lowestPosition || null,
    currentPressure: record.currentPressure,
    targetPressure: record.targetPressure,
    status: record.status || "unknown",
    regrooved: !!record.regrooved,
    canRegroove: !!record.canRegroove,
    installedAt: record.installedAt || null,
    mountedKm: record.mountedKm ?? null
  };
}

async function loadVehiclesFromApi() {
  const items = await apiGetAllVehicles();
  return items.map(mapVehicle);
}

async function loadTiresFromApi(plate) {
  const items = await apiGetTiresForVehicle(plate);
  return items.map(mapTire);
}

// ===== Helpers =====
function getTireDisplayStatus(tire, vehicle) {
  let level = "unknown";

  if (tire.currentDepth != null && tire.currentDepth > 0) {
    if (tire.currentDepth <= 1.6) level = "critical";
    else if (tire.currentDepth <= 2) level = "danger";
    else if (tire.currentDepth <= 4) level = "warning";
    else level = "good";
  }

  if (
    tire.currentPressure != null && tire.currentPressure > 0 &&
    tire.targetPressure != null && tire.targetPressure > 0
  ) {
    const diff = tire.currentPressure - tire.targetPressure;
    const absDiff = Math.abs(diff);
    const percentLow = (tire.targetPressure - tire.currentPressure) / tire.targetPressure;

    // Don't downgrade a critical depth status
    if (level === "critical") {
      // keep critical
    } else if (absDiff >= 2.0 || percentLow >= 0.20) {
      level = "danger";
    } else if (level !== "danger") {
      if (diff <= -0.1 || diff >= 1.0) {
        level = "warning";
      }
    }
  }

  // Still no real data after an inspection → keep unknown
  if (level === "unknown" && (!tire.currentDepth || tire.currentDepth === 0)) {
    return { class: "status-unknown", text: "Onbekend", level: "unknown" };
  }

  const text =
    level === "critical" ? "Kritiek" :
    level === "danger" ? t("statusDanger") :
    level === "warning" ? t("statusWarning") :
    level === "good" ? t("statusGood") : t("statusUnknown");

  return { class: `status-${level}`, text, level };
}

function getVehicleStatus(tires, vehicle) {
  if (!vehicle?.lastInspection) return { class: "status-new", text: t("statusNew") };
  if (!tires || tires.length === 0) return { class: "status-new", text: t("statusNew") };

  let hasDanger = false;
  let hasWarning = false;
  let hasData = false;

  for (const tire of tires) {
    const display = getTireDisplayStatus(tire, vehicle);
    if (display.level === "unknown") continue;
    hasData = true;
    if (display.level === "danger" || display.level === "critical") hasDanger = true;
    if (display.level === "warning") hasWarning = true;
  }

  if (!hasData) return { class: "status-new", text: t("statusNew") };
  if (hasDanger) return { class: "status-danger", text: t("statusCritical") };
  if (hasWarning) return { class: "status-warning", text: t("statusWarning") };
  return { class: "status-good", text: t("statusGood") };
}

function bindAddVehicleButtons() {
  const dashBtn = document.getElementById("btn-add-vehicle");
  const listBtn = document.getElementById("btn-add-vehicle-list");
  if (dashBtn) dashBtn.onclick = openAddVehiclePage;
  if (listBtn) listBtn.onclick = openAddVehiclePage;
}

function buildVehicleCard(vehicle, tires) {

  const countdown = inspectionCountdown(vehicle);
  const countdownHtml = vehicle.lastInspection
    ? `<div class="inspection-countdown ${countdown.level}">${countdown.text}</div>`
    : `<div class="inspection-countdown danger">Geen inspectie</div>`;

  const status = getVehicleStatus(tires, vehicle);
  const typeLabel =
    vehicle.type === "trekker" ? "Vrachtwagen" :
    vehicle.type === "oplegger" ? "Oplegger" : "Aanhangwagen";
  const isNew = status.class === "status-new";

  const card = document.createElement("div");
  card.className = "vehicle-card";
  card.dataset.id = vehicle.plate;
  card.innerHTML = `
    <div class="vehicle-left">
      <div class="vehicle-icon">${
        vehicle.type === "trekker" ? `<svg viewBox="0 0 48 48" width="28" height="28"><rect x="4" y="16" width="28" height="14" rx="2" fill="currentColor"/><rect x="32" y="20" width="12" height="10" rx="1" fill="currentColor" opacity="0.7"/><circle cx="12" cy="34" r="4" fill="currentColor"/><circle cx="28" cy="34" r="4" fill="currentColor"/><circle cx="40" cy="34" r="3" fill="currentColor" opacity="0.7"/></svg>` :
        vehicle.type === "oplegger" ? `<svg viewBox="0 0 48 48" width="28" height="28"><rect x="6" y="14" width="36" height="12" rx="1" fill="currentColor"/><rect x="4" y="26" width="8" height="4" fill="currentColor" opacity="0.6"/><circle cx="16" cy="34" r="4" fill="currentColor"/><circle cx="32" cy="34" r="4" fill="currentColor"/></svg>` :
        `<svg viewBox="0 0 48 48" width="28" height="28"><rect x="8" y="16" width="32" height="12" rx="1" fill="currentColor"/><circle cx="16" cy="34" r="4" fill="currentColor"/><circle cx="32" cy="34" r="4" fill="currentColor"/></svg>`
      }</div>
      <div>
        <div class="vehicle-plate">
          ${vehicle.plate}
          ${isNew ? '<span class="badge-new">Nieuw</span>' : ""}
        </div>
        <div class="vehicle-type">
          ${typeLabel} • ${vehicle.brand || ""} ${vehicle.model || ""}
          ${vehicle.driver ? ` • ${vehicle.driver}` : ""}
        </div>
        ${countdownHtml}
      </div>
    </div>
    <div class="vehicle-status ${status.class}">${status.text}</div>
  `;
  return card;
}

// ===== Dashboard =====
async function renderVehicles() {
  const vehicles = await getVehiclesCached();
  const container = document.querySelector("#page-dashboard .vehicles");
  if (!container) return;

  // ... header code stays the same ...

  if (vehicles.length === 0) {
    container.innerHTML += `<p class="placeholder">${t("noVehicles")}</p>`;
  } else {
    const tireLists = await Promise.all(
      vehicles.map(v => getTiresCached(v.plate))
    );

    const groups = {
      trekker: { label: "Vrachtwagens", items: [] },
      oplegger: { label: "Opleggers", items: [] },
      aanhangwagen: { label: "Aanhangwagens", items: [] }
    };

    vehicles.forEach((vehicle, i) => {
      const key = groups[vehicle.type] ? vehicle.type : "aanhangwagen";
      groups[key].items.push({ vehicle, tires: tireLists[i] });
    });

    for (const [key, group] of Object.entries(groups)) {
      if (!group.items.length) continue;

      const section = document.createElement("div");
      section.className = "vehicle-group";
      section.innerHTML = `
        <button type="button" class="vehicle-group-header">
          <span>${group.label} (${group.items.length})</span>
          <span class="chevron">▾</span>
        </button>
        <div class="vehicle-group-body"></div>
      `;

      const body = section.querySelector(".vehicle-group-body");
      group.items.forEach(({ vehicle, tires }) => {
        body.appendChild(buildVehicleCard(vehicle, tires));
      });

      section.querySelector(".vehicle-group-header").addEventListener("click", () => {
        const isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "";
        section.querySelector(".chevron").textContent = isOpen ? "▸" : "▾";
      });

      container.appendChild(section);
    }

    attachVehicleClickEvents();
  }

  bindAddVehicleButtons();
}

// ===== Vehicles list =====
async function renderVehiclesList(filter = "") {
  const container = document.getElementById("vehicles-list");
  if (!container) return;

  const vehicles = await getVehiclesCached();
  const q = filter.trim().toUpperCase();

  const filtered = q
    ? vehicles.filter(v =>
        v.plate.includes(q) ||
        (v.brand || "").toUpperCase().includes(q) ||
        (v.model || "").toUpperCase().includes(q)
      )
    : vehicles;

  filtered.sort((a, b) => a.plate.localeCompare(b.plate));
  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = q
      ? `<p class="placeholder">Geen voertuigen gevonden voor “${filter.trim()}”.</p>`
      : `<p class="placeholder">${t("noVehicles")}</p>`;
    bindAddVehicleButtons();
    return;
  }

  const tireLists = await Promise.all(
    filtered.map(v => getTiresCached(v.plate))
  );

  filtered.forEach((vehicle, i) => {
    container.appendChild(buildVehicleCard(vehicle, tireLists[i]));
  });

  attachVehicleClickEvents();
  bindAddVehicleButtons();
}

document.getElementById("vehicle-search")?.addEventListener("input", (e) => {
  renderVehiclesList(e.target.value);
});


async function openVehicleDetail(vehicle, tires) {
  const inspectBtn = document.getElementById("btn-new-inspection");
  if (inspectBtn) {
    const cd = inspectionCountdown(vehicle);
    const canInspect = cd.daysLeft == null || cd.daysLeft <= 30;
    inspectBtn.disabled = !canInspect;
    inspectBtn.title = canInspect
      ? "Inspectie starten"
      : `Inspectie nog niet nodig (nog ${cd.daysLeft} dagen)`;
    inspectBtn.classList.toggle("btn-disabled", !canInspect);
  }

  document.getElementById("detail-plate").textContent = vehicle.plate;

  const typeLabel =
    vehicle.type === "trekker" ? "Trekker / Vrachtwagen" :
    vehicle.type === "oplegger" ? "Oplegger" : "Aanhangwagen";

  const driverText = document.getElementById("detail-driver-text");
    if (driverText) {
      driverText.textContent = vehicle.driver || t("noDriver");
    }

  document.getElementById("detail-type").textContent =
    `${typeLabel} • ${vehicle.brand || ""} ${vehicle.model || ""}`.trim() +
    (vehicle.driver ? ` • ${vehicle.driver}` : "");

    document.getElementById("btn-edit-driver")?.addEventListener("click", () => {
  const form = document.getElementById("driver-edit-form");
  const input = document.getElementById("edit-driver-input");
  const current = document.getElementById("detail-driver-text").textContent;
  input.value = current === "Geen chauffeur" ? "" : current;
  form.hidden = false;
});

document.getElementById("btn-cancel-driver")?.addEventListener("click", () => {
  document.getElementById("driver-edit-form").hidden = true;
});

document.getElementById("btn-save-driver")?.addEventListener("click", async () => {
  const plate = document.getElementById("detail-plate").textContent.trim();
  const newDriver = document.getElementById("edit-driver-input").value.trim();

  const raw = await apiGetVehicleByPlate(plate);
  if (!raw) return;

  await apiUpdateVehicle(raw.id, { driver: newDriver });
  clearCache();

  document.getElementById("detail-driver-text").textContent = newDriver || t("noDriver");
  document.getElementById("driver-edit-form").hidden = true;

  // Refresh the card lists
  await renderVehicles();
  await renderVehiclesList(document.getElementById("vehicle-search")?.value || "");
});

  let meta = vehicle.lastInspection
    ? `Laatste inspectie: ${new Date(vehicle.lastInspection).toLocaleDateString("nl-NL")}${vehicle.lastInspector ? " door " + vehicle.lastInspector : ""}`
    : "Nog geen inspectie uitgevoerd";

  if (vehicle.axles?.length) {
    const names = { steer: "Stuur-as", driven: "Aandrijfas", lift: "Liftas", stiff: "Starre as" };
    const axleText = vehicle.axles.map(a => names[a.type] || a.type).join(", ");
    meta += ` • ${vehicle.axles.length} assen (${axleText})`;
  }

  const metaEl = document.getElementById("detail-meta");
  if (metaEl) metaEl.textContent = meta;

  const summaryEl = document.getElementById("detail-summary");
  if (summaryEl) {
    let good = 0, warning = 0, danger = 0, unknown = 0;
    tires.forEach(t => {
      const level = getTireDisplayStatus(t).level;
      if (level === "good") good++;
      else if (level === "warning") warning++;
      else if (level === "danger") danger++;
      else unknown++;
    });
    summaryEl.innerHTML = `
      <span class="summary-chip total">${tires.length} banden</span>
      ${good ? `<span class="summary-chip good">${good} goed</span>` : ""}
      ${warning ? `<span class="summary-chip warning">${warning} let op</span>` : ""}
      ${danger ? `<span class="summary-chip danger">${danger} actie</span>` : ""}
      ${unknown ? `<span class="summary-chip">${unknown} onbekend</span>` : ""}
    `;
  }

  const tireContainer = document.querySelector(".tire-positions");
  if (tireContainer) {
    tireContainer.innerHTML = `
      <div class="section-header tight">
        <h3 id="tire-section-title">Bandposities (${tires.length})</h3>
      </div>
    `;

    if (tires.length === 0) {
      tireContainer.innerHTML += `<p class="placeholder">${t("noTires")}</p>`;
    } else {
      tires.sort((a, b) => {
        if (a.axleNumber !== b.axleNumber) return a.axleNumber - b.axleNumber;
        if (a.side !== b.side) return a.side === "left" ? -1 : 1;
        if (a.dualPosition === "outer") return -1;
        if (b.dualPosition === "outer") return 1;
        return 0;
      });

      tires.forEach(tire => {
        const display = getTireDisplayStatus(tire, vehicle);
        let depthClass = "";
        let pressureClass = "";

        if (tire.currentDepth != null) {
          if (tire.currentDepth <= 2) depthClass = "value-danger";
          else if (tire.currentDepth <= 4) depthClass = "value-warning";
        }
        if (tire.currentPressure != null && tire.targetPressure != null) {
          if (Math.abs(tire.targetPressure - tire.currentPressure) >= 2.0) {
            pressureClass = "value-danger";
          }
        }

        const depths = [];
        if (tire.depthInside != null) depths.push(`Binnen ${tire.depthInside}`);
        if (tire.depthMiddle != null) depths.push(`Midden ${tire.depthMiddle}`);
        if (tire.depthOutside != null) depths.push(`Buiten ${tire.depthOutside}`);
        const posLabel = { inside: "binnen", middle: "midden", outside: "buiten" };
        const depthLine = depths.length
          ? depths.join(" • ") + (tire.lowestPosition ? ` (laagste: ${posLabel[tire.lowestPosition] || tire.lowestPosition})` : "")
          : (tire.currentDepth != null ? `${tire.currentDepth} mm` : "–");
        const depth = `<strong class="${depthClass}">${depthLine}</strong>`;
        const pressure = tire.currentPressure != null
          ? `<strong class="${pressureClass}">${tire.currentPressure} bar</strong>` : "–";
        const target = tire.targetPressure != null
          ? `<strong>${tire.targetPressure} bar</strong>` : "–";
        const brandLine = [tire.brand, tire.type, tire.size].filter(Boolean).join(" • ") || "Geen merk/type/maat";
        const regrooved = tire.regrooved
          ? `<span class="badge-regrooved">Geherprofileerd</span>` : "";

        tireContainer.innerHTML += `
          <div class="tire-card" data-tire-id="${tire.id}" style="cursor:pointer">
            <div class="tire-card-top">
              <div class="tire-pos">${tire.positionLabel} ${regrooved}</div>
              <span class="tire-status ${display.class}">${display.text}</span>
            </div>
            <div class="tire-brand">${brandLine}</div>
            <div class="tire-info">
              <span>Diepte: ${depth}</span>
              <span>Druk: ${pressure}</span>
              <span>Voorschrift: ${target}</span>
            </div>
          </div>
        `;
      });

      tireContainer.querySelectorAll(".tire-card[data-tire-id]").forEach(el => {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = el.dataset.tireId;
          const tire = tires.find(t => String(t.id) === String(id));
          if (tire) openTireDetail(tire);
        });
      });
    }
  }

  if (typeof renderVehicleSchematic === "function") {
    renderVehicleSchematic(vehicle, tires);
  }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-vehicle-detail")?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
}

// ===== Detail page =====
function attachVehicleClickEvents() {
  document.querySelectorAll(".vehicle-card").forEach(card => {
    card.style.cursor = "pointer";
    card.onclick = async () => {
      try {
        const plate = card.dataset.id;
        if (!plate) return;

        const raw = await apiGetVehicleByPlate(plate);
        if (!raw) {
          alert("Voertuig niet gevonden op de server: " + plate);
          return;
        }

        const vehicle = mapVehicle(raw);
        const tires = await getTiresCached(plate);
        await openVehicleDetail(vehicle, tires);
      } catch (err) {
        console.error("Open vehicle failed:", err);
        alert("Kon voertuig niet openen: " + err.message);
      }
    };
  });
}

// ===== Delete =====
document.getElementById("btn-delete-vehicle")?.addEventListener("click", async () => {
  const plate = document.getElementById("detail-plate").textContent.trim().toUpperCase();
  if (!plate) return;

  if (!confirm(`Weet je zeker dat je voertuig ${plate} wilt verwijderen?\n\nAlle banden en geschiedenis worden ook verwijderd.`)) {
    return;
  }

  try {
    const vehicle = await apiGetVehicleByPlate(plate);
    if (!vehicle) throw new Error("Voertuig niet gevonden");

    if (typeof apiDeleteHistoryForVehicle === "function") {
      await apiDeleteHistoryForVehicle(plate);
    }

    const tires = await apiGetTiresForVehicle(plate);
    for (const t of tires) {
      await apiDeleteTire(t.id);
    }

    await apiDeleteVehicle(vehicle.id);

    await renderVehicles();
    await updateAlertsBadge();
    await renderVehiclesList(document.getElementById("vehicle-search")?.value || "");

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-dashboard").classList.add("active");
    document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
    document.querySelectorAll(".nav-item")[0]?.classList.add("active");
  } catch (error) {
    console.error(error);
    alert("Verwijderen mislukt: " + error.message);
  }
  clearCache();
});

document.getElementById("back-to-dashboard")?.addEventListener("click", () => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-dashboard").classList.add("active");
  document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
  document.querySelectorAll(".nav-item")[0]?.classList.add("active");
});

// ===== Add vehicle =====
function openAddVehiclePage() {
  const page = document.getElementById("page-add-vehicle");
  if (!page) {
    alert("Add-vehicle pagina ontbreekt in HTML");
    return;
  }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  page.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));

  document.getElementById("form-add-vehicle")?.reset();
  const builder = document.getElementById("axles-builder");
  if (builder) builder.innerHTML = "";
  addAxleRow();
}

document.getElementById("back-from-add")?.addEventListener("click", () => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-dashboard").classList.add("active");
  document.querySelectorAll(".nav-item")[0]?.classList.add("active");
});

document.getElementById("cancel-add-vehicle")?.addEventListener("click", () => {
  document.getElementById("back-from-add")?.click();
});

function addAxleRow() {
  const builder = document.getElementById("axles-builder");
  if (!builder) return;

  const index = builder.children.length + 1;
  const row = document.createElement("div");
  row.className = "axle-row";
  row.innerHTML = `
    <span style="min-width: 50px;">As ${index}</span>
    <select class="axle-type">
      <option value="steer">Stuur-as</option>
      <option value="driven">Aandrijfas (dubbellucht)</option>
      <option value="lift">Liftas</option>
      <option value="stiff">Starre as</option>
    </select>
    <button type="button" class="remove-axle btn-secondary" style="padding:6px 10px;">✕</button>
  `;
  builder.appendChild(row);
  row.querySelector(".remove-axle").addEventListener("click", () => {
    row.remove();
    [...builder.querySelectorAll(".axle-row")].forEach((r, i) => {
      r.querySelector("span").textContent = `As ${i + 1}`;
    });
  });
}

document.getElementById("btn-add-axle")?.addEventListener("click", addAxleRow);

document.getElementById("form-add-vehicle")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const plate = document.getElementById("new-plate").value.trim().toUpperCase();
  const type = document.getElementById("new-type").value;
  const brand = document.getElementById("new-brand").value.trim();
  const model = document.getElementById("new-model").value.trim();
  const driver = document.getElementById("new-driver").value.trim();

  if (!plate) {
    alert("Vul een kenteken in");
    return;
  }

  const existing = await apiGetVehicleByPlate(plate);
  if (existing) {
    alert("Dit kenteken bestaat al");
    return;
  }

  const axleRows = document.querySelectorAll(".axle-row");
  if (axleRows.length === 0) {
    alert("Voeg minimaal één as toe");
    return;
  }

  const axles = [];
  axleRows.forEach((row, index) => {
    const axleType = row.querySelector(".axle-type").value;
    axles.push({
      number: index + 1,
      type: axleType,
      dual: axleType === "driven"
    });
  });

  const vehicle = {
    plate,
    type,
    brand,
    model,
    driver,
    axles,
    lastInspection: null,
    createdAt: new Date().toISOString()
  };

  try {
    await apiCreateVehicle(vehicle);
    await apiCreateTiresForVehicle(vehicle);
    await renderVehicles();
    await updateAlertsBadge();
    await renderVehiclesList(document.getElementById("vehicle-search")?.value || "");
    openInspectionForm(vehicle.plate, "initial");
  } catch (error) {
    console.error(error);
    alert("Er ging iets mis bij het opslaan: " + error.message);
  }
});

// ===== Inspection =====
let currentInspectionPlate = null;
let inspectionMode = "initial";

async function openInspectionForm(plate, mode = "initial") {
  currentInspectionPlate = plate;
  inspectionMode = mode;

  const rawVehicle = await apiGetVehicleByPlate(plate);
  if (!rawVehicle) {
    alert("Voertuig niet gevonden");
    return;
  }

  const vehicle = mapVehicle(rawVehicle);
  const tires = await loadTiresFromApi(plate);

  document.getElementById("inspection-title").textContent =
    mode === "initial" ? "Eerste inspectie" : "Nieuwe inspectie";
  document.getElementById("inspection-vehicle-info").textContent =
    `${plate} • ${vehicle.brand || ""} ${vehicle.model || ""}`.trim();

  // Inspector name field
  if (!document.getElementById("inspection-inspector")) {
    const inspRow = document.createElement("div");
    inspRow.className = "form-row";
    inspRow.style.marginBottom = "16px";
    inspRow.innerHTML = `
      <div style="flex:1">
        <label>Inspecteur</label>
        <input type="text" id="inspection-inspector" placeholder="Naam inspecteur" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-body);color:var(--text-primary)">
      </div>
    `;
    const info = document.getElementById("inspection-vehicle-info");
    if (info) info.parentNode.insertBefore(inspRow, info.nextSibling);
  } else {
    document.getElementById("inspection-inspector").value = "";
  }

  // Bulk apply controls
  if (!document.getElementById("bulk-apply-box")) {
    const bulk = document.createElement("div");
    bulk.id = "bulk-apply-box";
    bulk.className = "inspection-tire-card";
    bulk.style.marginBottom = "16px";
    bulk.innerHTML = `
      <h4>Snel invullen</h4>
      <div class="form-row">
        <div><label>Merk</label><input type="text" id="bulk-brand" placeholder="Continental"></div>
        <div><label>Type</label><input type="text" id="bulk-type" placeholder="EQ Max S"></div>
      </div>
      <div class="form-row">
        <div><label>Maat</label><input type="text" id="bulk-size" placeholder="315/70 R22.5"></div>
        <div><label>Voorschrift (bar)</label><input type="number" id="bulk-target" step="0.1" min="0" max="15" placeholder="8.5"></div>
      </div>
      <div id="bulk-buttons" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;"></div>
    `;
    const info = document.getElementById("inspection-vehicle-info");
    if (info && info.nextSibling) info.parentNode.insertBefore(bulk, info.nextSibling.nextSibling);
    else document.getElementById("inspection-tires-list").parentNode.insertBefore(bulk, document.getElementById("inspection-tires-list"));
  }

  const container = document.getElementById("inspection-tires-list");
  container.innerHTML = "";

  // Sort: left side first (low axle to high), then right side
  tires.sort((a, b) => {
    if (a.side !== b.side) return a.side === "left" ? -1 : 1;
    if (a.axleNumber !== b.axleNumber) return a.axleNumber - b.axleNumber;
    // outer before inner on duals
    if (a.dualPosition === "outer") return -1;
    if (b.dualPosition === "outer") return 1;
    return 0;
  });

  tires.forEach(tire => {
    const card = document.createElement("div");
    card.className = "inspection-tire-card";
    card.dataset.tireId = tire.id;
    card.innerHTML = `
      <h4>${tire.positionLabel}</h4>
      <div class="form-row">
        <div>
          <label>Merk</label>
          <input type="text" class="tire-brand" placeholder="Continental, Michelin..." value="${tire.brand || ""}">
        </div>
        <div>
          <label>Type</label>
          <input type="text" class="tire-type" placeholder="EQ Max S..." value="${tire.type || ""}">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Maat</label>
          <input type="text" class="tire-size" placeholder="315/70 R22.5" value="${tire.size || ""}">
        </div>
        <div>
          <label>Profieldiepte (mm)</label>
          <div class="form-row depth-row">
            <div>
              <label>Binnen</label>
              <input type="number" step="0.1" min="0" max="30" data-field="depthInside" placeholder="0.0">
            </div>
            <div>
              <label>Midden</label>
              <input type="number" step="0.1" min="0" max="30" data-field="depthMiddle" placeholder="0.0">
            </div>
            <div>
              <label>Buiten</label>
              <input type="number" step="0.1" min="0" max="30" data-field="depthOutside" placeholder="0.0">
            </div>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Gemeten druk (bar)</label>
          <input type="number" class="tire-pressure" step="0.1" min="0" max="15"
                 value="${tire.currentPressure ?? ""}" placeholder="0.0">
        </div>
        <div>
          <label>Gecorrigeerd (bar)</label>
          <input type="number" class="tire-corrected" step="0.1" min="0" max="15" placeholder="0.0">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Voorschrift druk (bar)</label>
          <input type="number" class="tire-target" step="0.1" min="0" max="15"
                 value="${tire.targetPressure ?? ""}" placeholder="0.0">
        </div>
      </div>
      <div class="form-row">
        <div style="display:flex; align-items:flex-end; padding-bottom: 8px;">
          <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem;">
            <input type="checkbox" class="tire-regrooved" ${tire.regrooved ? "checked" : ""}>
            Geherprofileerd
            <span class="regroove-hint" style="display:none;font-size:0.75rem;color:#d97706;margin-left:6px">(vul nieuwe diepte in)</span>
          </label>
        </div>
      </div>
      <div class="form-row">
        <div style="grid-column:1 / -1">
          <label>Opmerking</label>
          <textarea class="tire-notes" rows="2" placeholder="Schade, ventiel, velg..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-body);color:var(--text-primary)"></textarea>
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Foto</label>
          <input type="file" class="tire-photo" accept="image/*" style="width:100%">
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Guided flow: show one tire at a time
  const cards = container.querySelectorAll(".inspection-tire-card");
  let currentIndex = 0;

  function showCard(index) {
    cards.forEach((c, i) => c.style.display = i === index ? "block" : "none");
    const progress = document.getElementById("inspection-progress");
    if (progress) progress.textContent = `Band ${index + 1} van ${cards.length}`;

    const prevBtn = document.getElementById("btn-insp-prev");
    const nextBtn = document.getElementById("btn-insp-next");
    const saveBtn = document.getElementById("save-initial-inspection");

    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.style.display = index === cards.length - 1 ? "none" : "inline-block";
    if (saveBtn) saveBtn.style.display = index === cards.length - 1 ? "inline-block" : "none";
  }

  // Add progress + nav if not already present
  if (!document.getElementById("inspection-progress")) {
    const progressEl = document.createElement("p");
    progressEl.id = "inspection-progress";
    progressEl.className = "header-subtitle";
    progressEl.style.marginBottom = "12px";
    container.parentNode.insertBefore(progressEl, container);

    const nav = document.createElement("div");
    nav.className = "form-actions";
    nav.style.marginTop = "12px";
    nav.innerHTML = `
      <button type="button" id="btn-insp-prev" class="btn-secondary">Vorige</button>
      <button type="button" id="btn-insp-next" class="btn-primary">Volgende</button>
    `;
    container.parentNode.insertBefore(nav, container.nextSibling);

    document.getElementById("btn-insp-prev").onclick = () => {
      if (currentIndex > 0) {
        currentIndex--;
        showCard(currentIndex);
      }
    };
    document.getElementById("btn-insp-next").onclick = () => {
      const card = cards[currentIndex];
      const inside = card.querySelector("[data-field='depthInside']")?.value;
      const middle = card.querySelector("[data-field='depthMiddle']")?.value;
      const outside = card.querySelector("[data-field='depthOutside']")?.value;
      const pressure = card.querySelector(".tire-pressure")?.value;
      if (!inside || !middle || !outside || !pressure) {
        alert("Vul alle drie de dieptemetingen en de druk in voordat je verder gaat.");
        return;
      }
      if (currentIndex < cards.length - 1) {
        currentIndex++;
        showCard(currentIndex);
      }
    };
  }

  // Build bulk axle buttons
  const bulkBtns = document.getElementById("bulk-buttons");
  if (bulkBtns) {
    bulkBtns.innerHTML = "";
    const axleNumbers = [...new Set(tires.map(t => t.axleNumber))].sort((a,b)=>a-b);
    axleNumbers.forEach(num => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-secondary btn-sm";
      btn.textContent = "As " + num;
      btn.onclick = () => applyBulk(num);
      bulkBtns.appendChild(btn);
    });
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "btn-primary btn-sm";
    allBtn.textContent = "Alle banden";
    allBtn.onclick = () => applyBulk(null);
    bulkBtns.appendChild(allBtn);
  }

  function applyBulk(axleNumber) {
    const brand = document.getElementById("bulk-brand")?.value || "";
    const type = document.getElementById("bulk-type")?.value || "";
    const size = document.getElementById("bulk-size")?.value || "";
    const target = document.getElementById("bulk-target")?.value || "";

    cards.forEach(card => {
      const tire = tires.find(t => String(t.id) === String(card.dataset.tireId));
      if (!tire) return;
      if (axleNumber != null && tire.axleNumber !== axleNumber) return;

      if (brand) card.querySelector(".tire-brand").value = brand;
      if (type) card.querySelector(".tire-type").value = type;
      if (size) card.querySelector(".tire-size").value = size;
      if (target) card.querySelector(".tire-target").value = target;
    });
  }

  // Show hint when regrooved is checked
  container.addEventListener("change", (e) => {
    if (e.target.classList.contains("tire-regrooved")) {
      const card = e.target.closest(".inspection-tire-card");
      const hint = e.target.parentElement.querySelector(".regroove-hint");
      if (hint) hint.style.display = e.target.checked ? "inline" : "none";

      if (e.target.checked && card) {
        card.querySelectorAll("[data-field='depthInside'], [data-field='depthMiddle'], [data-field='depthOutside']").forEach(input => {
          input.value = "";
          input.focus();
        });
      }
    }
  });

  showCard(0);

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-initial-inspection").classList.add("active");
}

document.getElementById("btn-inspect")?.addEventListener("click", () => {
  const plate = document.getElementById("detail-plate").textContent.trim();
  // re-check in case the page was open a long time
  // (optional but safer)
  openInspectionForm(plate);
});

document.getElementById("btn-new-inspection")?.addEventListener("click", () => {
  const plate = document.getElementById("detail-plate").textContent.trim().toUpperCase();
  if (plate) openInspectionForm(plate, "update");
});

document.getElementById("back-from-inspection")?.addEventListener("click", () => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-dashboard").classList.add("active");
  document.querySelectorAll(".nav-item")[0]?.classList.add("active");
});

document.getElementById("save-initial-inspection")?.addEventListener("click", async () => {
  // Require all three depth points + pressure
  const depthCards = document.querySelectorAll(".inspection-tire-card:not(#bulk-apply-box)");
  const missing = [];

  depthCards.forEach(card => {
    const inside = card.querySelector("[data-field='depthInside']")?.value;
    const middle = card.querySelector("[data-field='depthMiddle']")?.value;
    const outside = card.querySelector("[data-field='depthOutside']")?.value;
    const pressure = card.querySelector(".tire-pressure")?.value;
    const label = card.querySelector("h4")?.textContent || "Band";

    const regrooved = card.querySelector(".tire-regrooved")?.checked;
    if (!inside || !middle || !outside || !pressure) {
      missing.push(label);
    } else if (regrooved && (!inside || !middle || !outside)) {
      missing.push(label + " (nieuwe diepte na regrooven)");
    }
  });

  if (missing.length) {
    alert("Vul alle drie de dieptemetingen en de druk in voor:\n\n" + missing.join("\n"));
    return;
  }

  const inspector = document.getElementById("inspection-inspector")?.value.trim() || "";


  if (!currentInspectionPlate) {
    alert("Geen voertuig geselecteerd");
    return;
  }

  const cards = document.querySelectorAll(".inspection-tire-card:not(#bulk-apply-box)");
  if (cards.length === 0) {
    alert("Geen banden gevonden");
    return;
  }

  try {
    const tires = await loadTiresFromApi(currentInspectionPlate);

    for (const card of cards) {
      const tireId = card.dataset.tireId;
      const brand = card.querySelector(".tire-brand")?.value.trim() || "";
      const type = card.querySelector(".tire-type")?.value.trim() || "";
      const size = card.querySelector(".tire-size")?.value.trim() || "";
      const pressureVal = card.querySelector(".tire-pressure")?.value || "";
      const correctedVal = card.querySelector(".tire-corrected")?.value || "";
      const targetVal = card.querySelector(".tire-target")?.value || "";
      const regrooved = !!card.querySelector(".tire-regrooved")?.checked;
      const notes = card.querySelector(".tire-notes")?.value.trim() || "";
      const photoFile = card.querySelector(".tire-photo")?.files?.[0] || null;

      const inside = parseFloat(card.querySelector("[data-field='depthInside']")?.value) || null;
      const middle = parseFloat(card.querySelector("[data-field='depthMiddle']")?.value) || null;
      const outside = parseFloat(card.querySelector("[data-field='depthOutside']")?.value) || null;

      const values = [
        { pos: "inside", val: inside },
        { pos: "middle", val: middle },
        { pos: "outside", val: outside }
      ].filter(v => v.val != null);

      let currentDepth = null;
      let lowestPosition = null;

      if (values.length) {
        const lowest = values.reduce((a, b) => a.val < b.val ? a : b);
        currentDepth = lowest.val;
        lowestPosition = lowest.pos;
      }

      const measured = pressureVal === "" ? null : parseFloat(pressureVal);
      const corrected = correctedVal === "" ? null : parseFloat(correctedVal);
      // Use corrected pressure if provided, otherwise measured
      const pressure = corrected != null ? corrected : measured;
      const targetPressure = targetVal === "" ? null : parseFloat(targetVal);

      const tire = tires.find(t => String(t.id) === String(tireId));
      if (!tire) continue;

      const display = getTireDisplayStatus({
        ...tire,
        currentDepth,
        currentPressure: pressure,
        targetPressure
      });

      await apiUpdateTire(tire.id, {
        brand,
        type,
        size,
        depthInside: inside,
        depthMiddle: middle,
        depthOutside: outside,
        currentDepth,
        lowestPosition,
        currentPressure: pressure,
        targetPressure,
        regrooved,
        status: display.level,
        installedAt: tire.installedAt || new Date().toISOString()
      });

      const historyNotes = [
        notes,
        measured != null && corrected != null ? `Gemeten ${measured} → gecorrigeerd ${corrected} bar` : "",
        regrooved ? "Geherprofileerd" : ""
      ].filter(Boolean).join(" • ");
      await apiAddHistory({
        tireId: tire.id,
        vehiclePlate: currentInspectionPlate,
        date: new Date().toISOString(),
        depth: currentDepth,
        pressure,
        type: inspectionMode === "initial" ? "initial" : "inspection",
        notes: historyNotes,
        regrooved
      });
      // Photo upload (if present) — requires a file field named "photo" on the history collection
      if (photoFile) {
        try {
          const form = new FormData();
          form.append("photo", photoFile);
          // Note: this assumes apiAddHistory returns the created record with an id
          // For now we just log; full upload needs the record id
          console.log("Photo ready for upload:", photoFile.name);
        } catch (e) {
          console.warn("Photo upload skipped", e);
        }
      }
    }

    const raw = await apiGetVehicleByPlate(currentInspectionPlate);
    if (raw) {
      await apiUpdateVehicle(raw.id, {
        lastInspection: new Date().toISOString()
      , lastInspector: inspector });
    }

    await renderVehicles();
    await updateAlertsBadge();
    await renderVehiclesList(document.getElementById("vehicle-search")?.value || "");

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-dashboard").classList.add("active");
    document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
    document.querySelectorAll(".nav-item")[0]?.classList.add("active");

    alert("Inspectie opgeslagen");
  } catch (error) {
    console.error(error);
    alert("Er ging iets mis bij het opslaan: " + error.message);
  }
  clearCache();
});

// ===== Schematic =====
function renderVehicleSchematic(vehicle, tires) {
  const container = document.getElementById("vehicle-schematic");
  if (!container || !vehicle.axles?.length) {
    if (container) container.innerHTML = "";
    return;
  }

  function statusColor(tire) {
  if (!tire) return "#64748b";
  const level = getTireDisplayStatus(tire, vehicle).level;
  if (level === "good") return "#22c55e";
  if (level === "warning") return "#f59e0b";
  if (level === "danger") return "#ef4444";
  return "#64748b"; // unknown
}

  function findTire(axleNumber, side, dualPosition) {
    return tires.find(t =>
      t.axleNumber === axleNumber &&
      t.side === side &&
      (t.dualPosition || null) === (dualPosition || null)
    );
  }

  function wheel(cx, cy, tire, size = 1) {
    const color = statusColor(tire);
    const w = 20 * size;
    const h = 36 * size;
    const id = tire?.id || "";
    return `
      <g class="schematic-tire" data-tire-id="${id}" style="cursor:pointer">
        <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${7 * size}"
              fill="${color}" stroke="#020617" stroke-width="1.6"/>
        <rect x="${cx - w / 2 + 5}" y="${cy - h / 2 + 8}" width="${w - 10}" height="${h - 16}"
              rx="3" fill="#020617" opacity="0.35"/>
        <circle cx="${cx}" cy="${cy}" r="${2.6 * size}" fill="#e2e8f0" opacity="0.85"/>
      </g>
    `;
  }

  function dualPair(cxOuter, cxInner, cy, tireOuter, tireInner) {
    return (
      wheel(cxOuter, cy, tireOuter, 0.92) +
      wheel(cxInner, cy, tireInner, 0.92)
    );
  }

  const isTruck = vehicle.type === "trekker";
  const axles = vehicle.axles;
  const width = 300;
  const centerX = width / 2;
  const steerY = 50;
  const driveY = 120;
  const gap = 70;

  let svg = "";

  svg += `
    <text x="60" y="14" text-anchor="middle"
          font-size="11" font-weight="700" fill="#94a3b8"
          font-family="system-ui, -apple-system, sans-serif">Links</text>
    <text x="${width - 60}" y="14" text-anchor="middle"
          font-size="11" font-weight="700" fill="#94a3b8"
          font-family="system-ui, -apple-system, sans-serif">Rechts</text>
  `;

  const arrowBottom = isTruck
    ? (axles.length <= 1 ? steerY + 30 : driveY + Math.max(0, axles.length - 2) * gap + 30)
    : 48 + (axles.length - 1) * gap + 30;
  const arrowTop = 12;

  svg += `
    <line x1="${centerX}" y1="${arrowBottom}" x2="${centerX}" y2="${arrowTop + 18}"
          stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>
    <polygon points="${centerX},${arrowTop} ${centerX - 12},${arrowTop + 22} ${centerX + 12},${arrowTop + 22}"
             fill="#94a3b8"/>
  `;

  axles.forEach((axle, i) => {
    let y;
    if (isTruck && i === 0) y = steerY;
    else if (isTruck && i === 1) y = driveY;
    else if (isTruck) y = driveY + (i - 1) * gap;
    else y = 48 + i * gap;

    svg += `
      <line x1="52" y1="${y}" x2="${width - 52}" y2="${y}"
            stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/>
      <line x1="52" y1="${y}" x2="${width - 52}" y2="${y}"
            stroke="#f8fafc" stroke-width="1.2" stroke-linecap="round" opacity="0.2"/>
    `;

    if (axle.dual) {
      svg += dualPair(
        56, 78, y,
        findTire(axle.number, "left", "outer"),
        findTire(axle.number, "left", "inner")
      );
      svg += dualPair(
        width - 78, width - 56, y,
        findTire(axle.number, "right", "inner"),
        findTire(axle.number, "right", "outer")
      );
    } else {
      svg += wheel(60, y, findTire(axle.number, "left", null));
      svg += wheel(width - 60, y, findTire(axle.number, "right", null));
    }

    svg += `
      <text x="${centerX - 28}" y="${y + 22}" text-anchor="end"
            font-size="11" font-weight="600" fill="#94a3b8"
            font-family="system-ui, -apple-system, sans-serif">
        As ${axle.number}
      </text>
    `;
  });

  const lastY = isTruck
    ? (axles.length <= 1 ? steerY : driveY + Math.max(0, axles.length - 2) * gap)
    : 48 + (axles.length - 1) * gap;
  const height = Math.max(lastY + 48, arrowBottom + 16);

  container.innerHTML = `
    <div class="schematic-wrap">
      <svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:320px">
        ${svg}
      </svg>
      <div class="schematic-legend">
        <span><i class="legend-dot" style="background:#22c55e"></i> Goed</span>
        <span><i class="legend-dot" style="background:#f59e0b"></i> Let op</span>
        <span><i class="legend-dot" style="background:#ef4444"></i> Actie nodig</span>
        <span><i class="legend-dot" style="background:#64748b"></i> Onbekend</span>
      </div>
    </div>
  `;

  // Make schematic tires open the detail page
  container.querySelectorAll(".schematic-tire[data-tire-id]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.tireId;
      if (!id) return;
      const tire = tires.find(t => String(t.id) === String(id));
      if (tire) openTireDetail(tire);
    });
  });
}

// ===== Alerts =====
function getTireFaults(tire) {
  const faults = [];

  if (tire.currentDepth != null) {
    if (tire.currentDepth <= 1.6) {
      faults.push({
        level: "danger",
        type: "tread",
        message: `Profieldiepte kritiek (${tire.currentDepth} mm) — direct vervangen`
      });
    } else if (tire.currentDepth <= 2) {
      faults.push({
        level: "danger",
        type: "tread",
        message: t("depthLow", { n: tire.currentDepth })
      });
    } else if (tire.currentDepth <= 4) {
      faults.push({
        level: "warning",
        type: "tread",
        message: tire.canRegroove
          ? t("depthWarnRegroove", { n: tire.currentDepth })
          : t("depthWarn", { n: tire.currentDepth })
      });
    }
  }

  if (tire.currentPressure != null && tire.targetPressure != null) {
    const diff = tire.currentPressure - tire.targetPressure;
    const absDiff = Math.abs(diff);
    const percentLow = (tire.targetPressure - tire.currentPressure) / tire.targetPressure;

    if (absDiff >= 2.0 || percentLow >= 0.20) {
      faults.push({
        level: "danger",
        type: "pressure",
        message: `Druk ${tire.currentPressure} bar (voorschrift ${tire.targetPressure}) — controleer op lek`
      });
    } else if (diff <= -0.1) {
      faults.push({
        level: "warning",
        type: "pressure",
        message: `Druk te laag (${tire.currentPressure} bar, voorschrift ${tire.targetPressure}) — oppompen`
      });
    } else if (diff >= 1.0) {
      faults.push({
        level: "warning",
        type: "pressure",
        message: `Druk te hoog (${tire.currentPressure} bar, voorschrift ${tire.targetPressure}) — druk verlagen`
      });
    }
  }

  return faults;
}

function isInspectionOverdue(vehicle) {
  if (!vehicle.lastInspection) return true;
  const days = (Date.now() - new Date(vehicle.lastInspection)) / (1000 * 60 * 60 * 24);
  return days > 84;
}

async function collectAllAlerts() {
  const vehicles = await getVehiclesCached();
  const alerts = [];

  // Load all tires in parallel
  const tireLists = await Promise.all(
    vehicles.map(v => getTiresCached(v.plate))
  );

  vehicles.forEach((vehicle, i) => {
    const inspectionAlert = getInspectionAlert(vehicle);
    if (inspectionAlert) alerts.push(inspectionAlert);

    for (const tire of tireLists[i]) {
      for (const fault of getTireFaults(tire)) {
        alerts.push({
          level: fault.level,
          vehiclePlate: vehicle.plate,
          position: tire.positionLabel,
          message: fault.message,
          type: fault.type
        });
      }
    }
  });

  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1));
  return alerts;
}

async function renderAlertsPage() {
  const container = document.getElementById("alerts-list"); // or whatever the container id is on the alerts page
  if (!container) return;

  const alerts = await collectAllAlerts();
  container.innerHTML = `<h2>${t("alertsTitle")}</h2>`;

  if (alerts.length === 0) {
    container.innerHTML += `<p class="placeholder">${t("noAlerts")}</p>`;
    return;
  }

  // Group by plate
  const grouped = {};
  for (const a of alerts) {
    if (!grouped[a.vehiclePlate]) grouped[a.vehiclePlate] = [];
    grouped[a.vehiclePlate].push(a);
  }

  for (const [plate, items] of Object.entries(grouped)) {
    const dangerCount = items.filter(i => i.level === "danger").length;
    const warningCount = items.length - dangerCount;

    const group = document.createElement("div");
    group.className = "alert-group";
    group.innerHTML = `
      <button type="button" class="alert-group-header">
        <span class="plate">${plate}</span>
        <span class="counts">
          ${dangerCount ? `<span class="badge danger">${dangerCount}</span>` : ""}
          ${warningCount ? `<span class="badge warning">${warningCount}</span>` : ""}
        </span>
        <span class="chevron">▸</span>
      </button>
      <div class="alert-group-body" hidden>
        ${items.map(item => {
          const levelClass = item.level === "danger" ? "alert-danger" : "alert-warning";
          const icon = item.level === "danger" ? "⚠️" : "📅";
          const sub = item.position ? item.position : "";
          return `
            <div class="alert-card ${levelClass}" 
                data-plate="${item.vehiclePlate}" 
                data-position="${item.position || ""}"
                style="cursor:pointer">
              <div class="alert-icon">${icon}</div>
              <div class="alert-content">
                <strong>${item.message}</strong>
                ${sub ? `<p>${sub}</p>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    group.querySelector(".alert-group-header").addEventListener("click", () => {
      const body = group.querySelector(".alert-group-body");
      const chevron = group.querySelector(".chevron");
      const isOpen = !body.hidden;
      body.hidden = isOpen;
      chevron.textContent = isOpen ? "▸" : "▾";
    });

    group.querySelectorAll(".alert-card").forEach(card => {
      card.addEventListener("click", async (e) => {
        e.stopPropagation();
        const plate = card.dataset.plate;
        const position = card.dataset.position;
        if (!plate) return;

        const raw = await apiGetVehicleByPlate(plate);
        if (!raw) return;
        const vehicle = mapVehicle(raw);
        const tires = await getTiresCached(plate);

        await openVehicleDetail(vehicle, tires);

        if (position) {
          const tire = tires.find(t => t.positionLabel === position);
          if (tire) openTireDetail(tire);
        }
      });
    });

    container.appendChild(group);
  }
}

// ===== Tire detail =====
let currentTireId = null;

async function openTireDetail(tire) {
  currentTireId = tire.id;
  window._lastOpenedTire = tire;

  document.getElementById("tire-detail-name").textContent = tire.positionLabel || "Band";
  document.getElementById("tire-detail-pos").textContent =
    `As ${tire.axleNumber} • ${tire.side === "left" ? "Links" : "Rechts"}${
      tire.dualPosition ? " • " + (tire.dualPosition === "outer" ? "Buiten" : "Binnen") : ""
    }`;

  document.getElementById("tire-detail-brand").textContent = tire.brand || "Geen merk";
  document.getElementById("tire-detail-size").textContent =
    [tire.type, tire.size].filter(Boolean).join(" • ") || "";

  const depthEl = document.getElementById("tire-detail-depth");
  const depthHint = document.getElementById("tire-detail-depth-hint");
  if (tire.currentDepth == null) {
    depthEl.textContent = "–";
    depthEl.className = "metric-value";
    depthHint.textContent = "Nog niet gemeten";
  } else {
    depthEl.textContent = `${tire.currentDepth} mm`;
    const three = [
      tire.depthInside != null ? `Binnen ${tire.depthInside}` : null,
      tire.depthMiddle != null ? `Midden ${tire.depthMiddle}` : null,
      tire.depthOutside != null ? `Buiten ${tire.depthOutside}` : null
    ].filter(Boolean);
    const posLabel = { inside: "binnen", middle: "midden", outside: "buiten" };
    const lowest = tire.lowestPosition ? ` (laagste: ${posLabel[tire.lowestPosition] || tire.lowestPosition})` : "";
    if (tire.currentDepth <= 2) {
      depthEl.className = "metric-value danger";
      depthHint.textContent = (three.length ? three.join(" • ") + lowest + " — " : "") + "Vervangen geadviseerd (≤ 2 mm)";
    } else if (tire.currentDepth <= 4) {
      depthEl.className = "metric-value warn";
      depthHint.textContent = (three.length ? three.join(" • ") + lowest + " — " : "") + "Onder / rond adviesdrempel (4 mm)";
    } else {
      depthEl.className = "metric-value good";
      depthHint.textContent = (three.length ? three.join(" • ") + lowest + " — " : "") + "Binnen acceptabel bereik";
    }
  }

  const presEl = document.getElementById("tire-detail-pressure");
  const presHint = document.getElementById("tire-detail-pressure-hint");
  if (tire.currentPressure == null) {
    presEl.textContent = "–";
    presEl.className = "metric-value";
    presHint.textContent = "Nog niet gemeten";
  } else {
    presEl.textContent = `${tire.currentPressure} bar`;
    if (tire.targetPressure != null) {
      const diff = Math.abs(tire.targetPressure - tire.currentPressure);
      if (diff >= 2) {
        presEl.className = "metric-value danger";
        presHint.textContent = `Grote afwijking t.o.v. ${tire.targetPressure} bar`;
      } else {
        presEl.className = "metric-value good";
        presHint.textContent = `Voorschrift ${tire.targetPressure} bar`;
      }
    } else {
      presEl.className = "metric-value";
      presHint.textContent = "Geen voorschrift ingesteld";
    }
  }

  document.getElementById("tire-detail-target").textContent =
    tire.targetPressure != null ? `${tire.targetPressure} bar` : "–";

  document.getElementById("tire-detail-installed").textContent = tire.installedAt
    ? new Date(tire.installedAt).toLocaleDateString("nl-NL")
    : "–";

  const banner = document.getElementById("tire-regroove-banner");
  const showRegroove =
    tire.canRegroove &&
    tire.currentDepth != null &&
    tire.currentDepth > 2 &&
    tire.currentDepth <= 4;
  banner.hidden = !showRegroove;

  const list = document.getElementById("tire-history-list");
  list.innerHTML = `<p class="placeholder">Laden...</p>`;
  try {
    const history = await apiGetHistoryForTire(tire.id);
    if (!history.length) {
      list.innerHTML = `<p class="placeholder">Geen metingen gevonden.</p>`;
    } else {
      list.innerHTML = history.map(h => {
        const d = h.date ? new Date(h.date).toLocaleString("nl-NL") : "–";
        const bits = [];
        if (h.depth != null) bits.push(`Diepte: ${h.depth} mm`);
        if (h.pressure != null) bits.push(`Druk: ${h.pressure} bar`);
        if (h.notes) bits.push(h.notes);
        return `
          <div class="history-item">
            <div class="history-date">${d}</div>
            <div class="history-body">${bits.join(" • ") || h.type || "Meting"}</div>
          </div>
        `;
      }).join("");
    }
  } catch (e) {
    console.error(e);
    list.innerHTML = `<p class="placeholder">Kon geschiedenis niet laden.</p>`;
  }

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-tire-detail").classList.add("active");
}

document.getElementById("back-from-tire")?.addEventListener("click", async () => {
  const plate = document.getElementById("detail-plate")?.textContent.trim();
  if (plate) {
    clearCache();
    const raw = await apiGetVehicleByPlate(plate);
    if (raw) {
      const vehicle = mapVehicle(raw);
      const tires = await getTiresCached(plate);
      await openVehicleDetail(vehicle, tires);
      return;
    }
  }
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-vehicle-detail").classList.add("active");
});

// ===== Tire edit =====
let editingTire = null;

function toDateInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function openTireEdit(tire) {
  editingTire = tire;

  document.getElementById("tire-edit-subtitle").textContent = tire.positionLabel || "Band";
  document.getElementById("edit-tire-brand").value = tire.brand || "";
  document.getElementById("edit-tire-type").value = tire.type || "";
  document.getElementById("edit-tire-size").value = tire.size || "";
  document.getElementById("edit-tire-depth").value =
    tire.currentDepth != null ? tire.currentDepth : "";
  document.getElementById("edit-tire-pressure").value =
    tire.currentPressure != null ? tire.currentPressure : "";
  document.getElementById("edit-tire-target").value =
    tire.targetPressure != null ? tire.targetPressure : "";
  document.getElementById("edit-tire-installed").value = toDateInputValue(tire.installedAt);
  document.getElementById("edit-tire-km").value =
    tire.mountedKm != null ? tire.mountedKm : "";
  document.getElementById("edit-tire-regrooved").checked = !!tire.regrooved;

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-tire-edit").classList.add("active");
}

document.getElementById("btn-edit-tire")?.addEventListener("click", () => {
  if (window._lastOpenedTire) openTireEdit(window._lastOpenedTire);
});

document.getElementById("back-from-tire-edit")?.addEventListener("click", () => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-tire-detail").classList.add("active");
});

document.getElementById("cancel-tire-edit")?.addEventListener("click", () => {
  document.getElementById("back-from-tire-edit")?.click();
});

document.getElementById("form-tire-edit")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingTire) return;

  const brand = document.getElementById("edit-tire-brand").value.trim();
  const type = document.getElementById("edit-tire-type").value.trim();
  const size = document.getElementById("edit-tire-size").value.trim();
  const depthVal = document.getElementById("edit-tire-depth").value;
  const pressureVal = document.getElementById("edit-tire-pressure").value;
  const correctedVal = document.getElementById("edit-tire-corrected")?.value || "";
  const targetVal = document.getElementById("edit-tire-target").value;
  const installedVal = document.getElementById("edit-tire-installed").value;
  const kmVal = document.getElementById("edit-tire-km").value;
  const regrooved = document.getElementById("edit-tire-regrooved").checked;

  const currentDepth = depthVal === "" ? null : parseFloat(depthVal);
  const measured = pressureVal === "" ? null : parseFloat(pressureVal);
  const corrected = correctedVal === "" ? null : parseFloat(correctedVal);
  const currentPressure = corrected != null ? corrected : measured;
  const targetPressure = targetVal === "" ? null : parseFloat(targetVal);
  const mountedKm = kmVal === "" ? null : parseInt(kmVal, 10);
  const installedAt = installedVal
    ? new Date(installedVal + "T12:00:00").toISOString()
    : "";

  const display = getTireDisplayStatus({
    ...editingTire,
    currentDepth,
    currentPressure,
    targetPressure
  });

  const fields = {
    brand,
    type,
    size,
    currentDepth,
    currentPressure,
    targetPressure,
    regrooved,
    status: display.level,
    installedAt,
    mountedKm
  };

  try {
    await apiUpdateTire(editingTire.id, fields);

    await apiAddHistory({
      tireId: editingTire.id,
      vehiclePlate: editingTire.vehiclePlate,
      date: new Date().toISOString(),
      depth: currentDepth,
      pressure: currentPressure,
      type: "inspection",
      notes: [
        corrected != null && measured != null ? `Gemeten ${measured} → gecorrigeerd ${corrected} bar` : "",
        regrooved ? "Geherprofileerd (handmatige edit)" : "Handmatige edit"
      ].filter(Boolean).join(" • "),
      regrooved
    });

    const updated = { ...editingTire, ...fields, model: size };
    window._lastOpenedTire = updated;
    clearCache();
    await openTireDetail(updated);
    alert("Band opgeslagen");
  } catch (err) {
    console.error(err);
    alert("Opslaan mislukt: " + err.message);
  }
  clearCache();
});

function applyRoleUI() {
  const user = getCurrentUser();
  const isAdmin = user?.role === "admin";

  // Hide delete button for non-admins
  const deleteBtn = document.getElementById("btn-delete-vehicle");
  if (deleteBtn) {
    deleteBtn.style.display = isAdmin ? "" : "none";
  }

  // Show invite button for admins
  const inviteBtn = document.getElementById("btn-invite-user");
  if (inviteBtn) {
    inviteBtn.style.display = isAdmin ? "" : "none";
  }
}

function showLogin() {
  document.getElementById("login-modal").style.display = "flex";
}

function hideLogin() {
  document.getElementById("login-modal").style.display = "none";
}

document.getElementById("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");

  try {
    await login(email, password);
    errorEl.style.display = "none";
    hideLogin();

    const user = getCurrentUser();
    if (user?.mustChangePassword) {
      document.getElementById("change-password-modal").style.display = "flex";
      return; // block the rest of the app until password is changed
    }

    applyRoleUI();
    await renderVehicles();
    await updateAlertsBadge();
  } catch (err) {
    errorEl.textContent = "Inloggen mislukt. Controleer e-mail en wachtwoord.";
    errorEl.style.display = "block";
  }
});

async function updateAlertsBadge() {
  const badge = document.getElementById("alerts-badge");
  if (!badge) return;

  const alerts = await collectAllAlerts();
  const count = alerts.length;

  if (count === 0) {
    badge.hidden = true;
  } else {
    badge.hidden = false;
    badge.textContent = count > 99 ? "99+" : count;
  }
}

function daysSinceInspection(vehicle) {
  if (!vehicle?.lastInspection) return null;
  return Math.floor((Date.now() - new Date(vehicle.lastInspection)) / (1000 * 60 * 60 * 24));
}

function inspectionCountdown(vehicle) {
  const days = daysSinceInspection(vehicle);
  if (days == null) return { level: "danger", text: t("noInspection"), daysLeft: null };

  const daysLeft = 90 - days;
  if (daysLeft <= 0) return { level: "danger", text: t("inspectionOverdue", { n: Math.abs(daysLeft) }), daysLeft };
  if (daysLeft <= 14) return { level: "danger", text: t("nextInspection", { n: daysLeft }), daysLeft };
  if (daysLeft <= 30) return { level: "warning", text: t("nextInspection", { n: daysLeft }), daysLeft };
  return { level: "good", text: t("nextInspection", { n: daysLeft }), daysLeft };
}

function getInspectionAlert(vehicle) {
  const cd = inspectionCountdown(vehicle);
  if (cd.level === "good") return null;

  return {
    level: cd.level,
    vehiclePlate: vehicle.plate,
    message: cd.daysLeft == null
      ? t("noInspection")
      : cd.daysLeft <= 0
        ? t("inspectionOverdue", { n: Math.abs(cd.daysLeft) })
        : t("inspectionSoon", { n: cd.daysLeft }),
    type: "inspection"
  };
}

async function showAppVersion() {
  try {
    const res = await fetch("/banden-tracker/version.json?ts=" + Date.now());
    const data = await res.json();
    const el = document.getElementById("app-version");
    if (el && data.version) {
      el.textContent = "v" + data.version;
    }
  } catch (e) {
    console.warn("Could not load version", e);
  }
}

showAppVersion();

// ===== User invite (admin) =====
document.getElementById("btn-invite-user")?.addEventListener("click", () => {
  document.getElementById("invite-modal").style.display = "flex";
  document.getElementById("invite-result").style.display = "none";
  document.getElementById("invite-form").reset();
});

document.getElementById("invite-cancel")?.addEventListener("click", () => {
  document.getElementById("invite-modal").style.display = "none";
});

document.getElementById("invite-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("invite-email").value.trim();
  const role = document.getElementById("invite-role").value;
  const password = document.getElementById("invite-password").value;
  const resultEl = document.getElementById("invite-result");

  if (password.length < 8) {
    resultEl.textContent = "Wachtwoord moet minimaal 8 tekens zijn.";
    resultEl.style.color = "#ef4444";
    resultEl.style.display = "block";
    return;
  }

  try {
    await apiInviteUser(email, password, role);
    resultEl.innerHTML = `Gebruiker aangemaakt.<br><strong>E-mail:</strong> ${email}<br><strong>Wachtwoord:</strong> ${password}<br><small>Deel deze gegevens met de gebruiker.</small>`;
    resultEl.style.color = "#22c55e";
    resultEl.style.display = "block";
    document.getElementById("invite-form").reset();
  } catch (err) {
    console.error(err);
    resultEl.textContent = "Uitnodigen mislukt: " + (err.message || "onbekende fout");
    resultEl.style.color = "#ef4444";
    resultEl.style.display = "block";
  }
});


// ===== Force password change =====
document.getElementById("change-password-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = document.getElementById("new-password").value;
  const confirm = document.getElementById("new-password-confirm").value;
  const errorEl = document.getElementById("change-password-error");

  if (pw !== confirm) {
    errorEl.textContent = "Wachtwoorden komen niet overeen.";
    errorEl.style.display = "block";
    return;
  }
  if (pw.length < 8) {
    errorEl.textContent = "Wachtwoord moet minimaal 8 tekens zijn.";
    errorEl.style.display = "block";
    return;
  }

  try {
    await apiChangePassword(pw);
    document.getElementById("change-password-modal").style.display = "none";
    applyRoleUI();
    await renderVehicles();
    await updateAlertsBadge();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Wijzigen mislukt: " + (err.message || "onbekende fout");
    errorEl.style.display = "block";
  }
});


// ===== User settings =====
document.getElementById("btn-user-settings")?.addEventListener("click", async () => {
  // Force a full auth refresh so email/name/avatar are current
  let user = getCurrentUser();
  try {
    const refreshed = await pb.collection("users").authRefresh();
    user = refreshed.record || refreshed;
    console.log("Refreshed user:", user);
  } catch (e) {
    console.warn("authRefresh failed", e);
    // Fallback: re-fetch the user record
    try {
      user = await pb.collection("users").getOne(user.id);
    } catch (e2) {
      console.warn("getOne also failed", e2);
    }
  }

  document.getElementById("settings-current-email").textContent = user?.email || "";
  document.getElementById("settings-current-name").textContent = user?.name || "Geen naam";
  document.getElementById("settings-name").value = user?.name || "";

  const avatarEl = document.getElementById("settings-avatar-preview");
  if (user?.avatar) {
    avatarEl.src = pb.files.getUrl(user, user.avatar, { thumb: "100x100" });
    avatarEl.style.display = "block";
  } else {
    avatarEl.style.display = "none";
  }

  document.getElementById("settings-modal").style.display = "flex";
  document.getElementById("email-change-result").style.display = "none";
  document.getElementById("password-change-result").style.display = "none";
  document.getElementById("profile-change-result").style.display = "none";
  document.getElementById("change-email-form").reset();
  document.getElementById("change-password-settings-form").reset();
});

document.getElementById("settings-close")?.addEventListener("click", () => {
  document.getElementById("settings-modal").style.display = "none";
});

document.getElementById("change-email-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const newEmail = document.getElementById("settings-new-email").value.trim();
  const resultEl = document.getElementById("email-change-result");

  try {
    await apiRequestEmailChange(newEmail);
    resultEl.textContent = "Bevestigingsmail verstuurd naar " + newEmail;
    resultEl.style.color = "#22c55e";
    resultEl.style.display = "block";
    document.getElementById("change-email-form").reset();
  } catch (err) {
    console.error(err);
    resultEl.textContent = "Mislukt: " + (err.message || "onbekende fout");
    resultEl.style.color = "#ef4444";
    resultEl.style.display = "block";
  }
});

document.getElementById("change-password-settings-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const oldPw = document.getElementById("settings-old-password").value;
  const newPw = document.getElementById("settings-new-password").value;
  const confirm = document.getElementById("settings-confirm-password").value;
  const resultEl = document.getElementById("password-change-result");

  if (newPw !== confirm) {
    resultEl.textContent = "Nieuwe wachtwoorden komen niet overeen.";
    resultEl.style.color = "#ef4444";
    resultEl.style.display = "block";
    return;
  }
  if (newPw.length < 8) {
    resultEl.textContent = "Wachtwoord moet minimaal 8 tekens zijn.";
    resultEl.style.color = "#ef4444";
    resultEl.style.display = "block";
    return;
  }

  try {
    await apiUpdatePassword(oldPw, newPw);
    resultEl.textContent = "Wachtwoord gewijzigd.";
    resultEl.style.color = "#22c55e";
    resultEl.style.display = "block";
    document.getElementById("change-password-settings-form").reset();
  } catch (err) {
    console.error(err);
    resultEl.textContent = "Mislukt: " + (err.message || "controleer het huidige wachtwoord");
    resultEl.style.color = "#ef4444";
    resultEl.style.display = "block";
  }
});


// ===== Logout =====
document.getElementById("btn-logout")?.addEventListener("click", () => {
  logout();
  document.getElementById("settings-modal").style.display = "none";
  showLogin();
  // Clear any open pages
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-dashboard")?.classList.add("active");
});


// ===== In-app auth confirmations =====
(function handleAuthConfirm() {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  // Password reset: ?token=... or #/auth/confirm-password-reset/TOKEN
  let token = params.get("token");
  let type = params.get("type");

  if (!token && hash.includes("confirm-password-reset")) {
    token = hash.split("/").pop();
    type = "password";
  }
  if (!token && (hash.includes("confirm-email-change") || params.get("type") === "email")) {
    token = token || hash.split("/").pop() || params.get("token");
    type = "email";
  }
  if (!token && hash.includes("confirm-verification")) {
    token = hash.split("/").pop();
    type = "verify";
  }

  if (!token) return;

  const modal = document.getElementById("confirm-modal");
  const title = document.getElementById("confirm-title");
  const msg = document.getElementById("confirm-message");
  const pwFields = document.getElementById("confirm-password-fields");
  const errorEl = document.getElementById("confirm-error");
  const form = document.getElementById("confirm-form");

  if (type === "password") {
    title.textContent = "Nieuw wachtwoord instellen";
    msg.textContent = "Kies een nieuw wachtwoord voor je account.";
    pwFields.hidden = false;
  } else if (type === "email") {
    title.textContent = "E-mailadres bevestigen";
    msg.textContent = "Voer je huidige wachtwoord in om het nieuwe e-mailadres te bevestigen.";
    pwFields.hidden = true;
    const curPwField = document.getElementById("confirm-current-password-field");
    if (curPwField) {
      curPwField.hidden = false;
      curPwField.style.display = "block";
    }
  } else {
    title.textContent = "E-mail bevestigen";
    msg.textContent = "Klik op de knop om je e-mailadres te bevestigen.";
    pwFields.hidden = true;
  }

  modal.style.display = "flex";

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorEl.style.display = "none";

    try {
      if (type === "password") {
        const pw = document.getElementById("confirm-new-password").value;
        const pw2 = document.getElementById("confirm-new-password-2").value;
        if (pw !== pw2) throw new Error("Wachtwoorden komen niet overeen");
        if (pw.length < 8) throw new Error("Minimaal 8 tekens");
        await pb.collection("users").confirmPasswordReset(token, pw, pw2);
      } else if (type === "email") {
        const currentPw = document.getElementById("confirm-current-password").value;
        if (!currentPw) throw new Error("Huidig wachtwoord is verplicht");
        await pb.collection("users").confirmEmailChange(token, currentPw);
      } else {
        await pb.collection("users").confirmVerification(token);
      }

      modal.style.display = "none";
      // Clean the URL
      history.replaceState(null, "", window.location.pathname);
      alert("Bevestigd. Je kunt nu inloggen.");
      showLogin();
    } catch (err) {
      console.error(err);
      errorEl.textContent = err.message || "Bevestigen mislukt";
      errorEl.style.display = "block";
    }
  };
})();


document.getElementById("change-profile-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("settings-name").value.trim();
  const avatarFile = document.getElementById("settings-avatar").files?.[0];
  const resultEl = document.getElementById("profile-change-result");

  const formData = new FormData();
  if (name) formData.append("name", name);
  if (avatarFile) formData.append("avatar", avatarFile);

  try {
    await apiUpdateProfile(formData);
    await apiRefreshUser();
    resultEl.textContent = "Profiel opgeslagen.";
    resultEl.style.color = "#22c55e";
    resultEl.style.display = "block";

    // Refresh the preview
    const user = getCurrentUser();
    document.getElementById("settings-current-name").textContent = user?.name || "Geen naam";
    const avatarEl = document.getElementById("settings-avatar-preview");
    if (user?.avatar) {
      avatarEl.src = pb.files.getUrl(user, user.avatar, { thumb: "100x100" });
      avatarEl.style.display = "block";
    }
  } catch (err) {
    console.error(err);
    resultEl.textContent = "Opslaan mislukt: " + (err.message || "onbekende fout");
    resultEl.style.color = "#ef4444";
    resultEl.style.display = "block";
  }
});


// ===== Stock =====
async function renderStock() {
  const tiresEl = document.getElementById("stock-tires-list");
  const rimsEl = document.getElementById("stock-rims-list");
  if (!tiresEl) return;

  try {
    const tires = await apiGetTireStock();
    tiresEl.innerHTML = tires.length ? tires.map(t => `
      <div class="tire-card">
        <div class="tire-card-top">
          <div class="tire-pos">${t.brand || ""} ${t.type || ""}</div>
          <span class="badge-regrooved">${t.onRim ? "Op velg" : "Los"}</span>
          <button class="btn-danger btn-sm stock-delete" data-id="${t.id}" data-type="tire" style="margin-left:auto">✕</button>
        </div>
        <div class="tire-brand">${t.size || ""} • DOT ${t.dotCode || "–"} • ${t.depth != null ? t.depth + " mm" : "–"}</div>
        <div class="tire-info">
          <span>${(t.axleTypes || []).join(", ") || "–"}</span>
          ${t.regrooved ? `<span class="badge-regrooved">Geherprofileerd</span>` : ""}
          ${t.comment ? `<span>${t.comment}</span>` : ""}
        </div>
      </div>
    `).join("") : `<p class="placeholder">Geen banden op voorraad.</p>`;
  } catch (e) {
    tiresEl.innerHTML = `<p class="placeholder">Kon voorraad niet laden.</p>`;
  }

  try {
    const rims = await apiGetRimStock();
    rimsEl.innerHTML = rims.length ? rims.map(r => `
      <div class="tire-card">
        <div class="tire-card-top">
          <div class="tire-pos">${r.material === "alu" ? "Alu" : "Staal"}</div>
          <button class="btn-danger btn-sm stock-delete" data-id="${r.id}" data-type="rim" style="margin-left:auto">✕</button>
        </div>
        <div class="tire-brand">${r.size || ""}</div>
        ${r.comment ? `<div class="tire-info"><span>${r.comment}</span></div>` : ""}
      </div>
    `).join("") : `<p class="placeholder">Geen velgen op voorraad.</p>`;
  } catch (e) {
    rimsEl.innerHTML = `<p class="placeholder">Kon velgen niet laden.</p>`;
  }
}

document.querySelectorAll(".stock-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".stock-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const which = tab.dataset.tab;
    document.getElementById("stock-tires-list").style.display = which === "tires" ? "" : "none";
    document.getElementById("stock-rims-list").style.display = which === "rims" ? "" : "none";
  });
});

// Load stock when tab is opened
const origNav = navItems;
// Hook into existing nav click - add stock load
document.querySelectorAll(".nav-item").forEach((item, index) => {
  item.addEventListener("click", async () => {
    if (index === 3) await renderStock();
  });
});


// ===== Stock forms =====
document.getElementById("btn-add-stock-tire")?.addEventListener("click", () => {
  document.getElementById("form-add-stock-tire").style.display = "block";
  document.getElementById("form-add-stock-rim").style.display = "none";
});

document.getElementById("cancel-stock-tire")?.addEventListener("click", () => {
  document.getElementById("form-add-stock-tire").style.display = "none";
});

document.getElementById("form-add-stock-tire")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const axleSelect = document.getElementById("stock-tire-axle");
  const axleTypes = [...axleSelect.selectedOptions].map(o => o.value);

  const item = {
    brand: document.getElementById("stock-tire-brand").value.trim(),
    type: document.getElementById("stock-tire-type").value.trim(),
    size: document.getElementById("stock-tire-size").value.trim(),
    axleTypes,
    dotCode: document.getElementById("stock-tire-dot").value.trim(),
    depth: parseFloat(document.getElementById("stock-tire-depth").value) || null,
    comment: document.getElementById("stock-tire-comment").value.trim(),
    onRim: document.getElementById("stock-tire-onrim").checked,
    regrooved: document.getElementById("stock-tire-regrooved").checked
  };

  try {
    await apiCreateTireStock(item);
    document.getElementById("form-add-stock-tire").reset();
    document.getElementById("form-add-stock-tire").style.display = "none";
    await renderStock();
  } catch (err) {
    alert("Opslaan mislukt: " + err.message);
  }
});

// Rim form - add button dynamically or reuse
document.querySelector(".stock-tab[data-tab='rims']")?.addEventListener("click", () => {
  // Show add rim button area - for now toggle via existing button text
});

// Simple: change the add button based on active tab
document.querySelectorAll(".stock-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const addBtn = document.getElementById("btn-add-stock-tire");
    if (tab.dataset.tab === "rims") {
      addBtn.textContent = "+ Velg";
      addBtn.onclick = () => {
        document.getElementById("form-add-stock-rim").style.display = "block";
        document.getElementById("form-add-stock-tire").style.display = "none";
      };
    } else {
      addBtn.textContent = "+ Band";
      addBtn.onclick = () => {
        document.getElementById("form-add-stock-tire").style.display = "block";
        document.getElementById("form-add-stock-rim").style.display = "none";
      };
    }
  });
});

document.getElementById("cancel-stock-rim")?.addEventListener("click", () => {
  document.getElementById("form-add-stock-rim").style.display = "none";
});

document.getElementById("form-add-stock-rim")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const item = {
    material: document.getElementById("stock-rim-material").value,
    size: document.getElementById("stock-rim-size").value.trim(),
    comment: document.getElementById("stock-rim-comment").value.trim()
  };

  try {
    await apiCreateRimStock(item);
    document.getElementById("form-add-stock-rim").reset();
    document.getElementById("form-add-stock-rim").style.display = "none";
    await renderStock();
  } catch (err) {
    alert("Opslaan mislukt: " + err.message);
  }
});


document.getElementById("stock-tires-list")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".stock-delete");
  if (!btn) return;
  if (!confirm("Verwijderen?")) return;
  try {
    if (btn.dataset.type === "tire") await apiDeleteTireStock(btn.dataset.id);
    else await apiDeleteRimStock(btn.dataset.id);
    await renderStock();
  } catch (err) {
    alert("Verwijderen mislukt: " + err.message);
  }
});

document.getElementById("stock-rims-list")?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".stock-delete");
  if (!btn) return;
  if (!confirm("Verwijderen?")) return;
  try {
    await apiDeleteRimStock(btn.dataset.id);
    await renderStock();
  } catch (err) {
    alert("Verwijderen mislukt: " + err.message);
  }
});
