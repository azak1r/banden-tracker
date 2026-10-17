async function initApp() {
  if (!isLoggedIn()) {
    showLogin();
    return;
  }

  try {
    await renderVehicles();
    await renderAlerts();
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
  3: "page-settings"
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
    axles: record.axles || [],
    lastInspection: record.lastInspection || null,
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
function getTireDisplayStatus(tire) {
  let level = "unknown";

  if (tire.currentDepth != null) {
    if (tire.currentDepth <= 2) level = "danger";
    else if (tire.currentDepth <= 4) level = "warning";
    else level = "good";
  }

  if (tire.currentPressure != null && tire.targetPressure != null) {
    const diff = Math.abs(tire.targetPressure - tire.currentPressure);
    if (diff >= 2.0) level = "danger";
  }

  const text =
    level === "danger" ? "Actie nodig" :
    level === "warning" ? "Let op" :
    level === "good" ? "Goed" : "Onbekend";

  return { class: `status-${level}`, text, level };
}

function getVehicleStatus(tires, vehicle) {
  if (!vehicle?.lastInspection) return { class: "status-new", text: "Nieuw" };
  if (!tires || tires.length === 0) return { class: "status-new", text: "Nieuw" };

  let hasDanger = false;
  let hasWarning = false;
  let hasData = false;

  for (const tire of tires) {
    const display = getTireDisplayStatus(tire);
    if (display.level === "unknown") continue;
    hasData = true;
    if (display.level === "danger") hasDanger = true;
    if (display.level === "warning") hasWarning = true;
  }

  if (!hasData) return { class: "status-new", text: "Nieuw" };
  if (hasDanger) return { class: "status-danger", text: "Critiek" };
  if (hasWarning) return { class: "status-warning", text: "Let op" };
  return { class: "status-good", text: "Goed" };
}

function bindAddVehicleButtons() {
  const dashBtn = document.getElementById("btn-add-vehicle");
  const listBtn = document.getElementById("btn-add-vehicle-list");
  if (dashBtn) dashBtn.onclick = openAddVehiclePage;
  if (listBtn) listBtn.onclick = openAddVehiclePage;
}

function buildVehicleCard(vehicle, tires) {
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
      <div class="vehicle-icon">${vehicle.type === "trekker" ? "🚛" : "🚚"}</div>
      <div>
        <div class="vehicle-plate">
          ${vehicle.plate}
          ${isNew ? '<span class="badge-new">Nieuw</span>' : ""}
        </div>
        <div class="vehicle-type">${typeLabel} • ${vehicle.brand || ""} ${vehicle.model || ""}</div>
      </div>
    </div>
    <div class="vehicle-status ${status.class}">${status.text}</div>
  `;
  return card;
}

// ===== Dashboard =====
async function renderVehicles() {
  const vehicles = await loadVehiclesFromApi();
  const container = document.querySelector("#page-dashboard .vehicles");
  if (!container) return;

  const header = container.querySelector(".section-header");
  container.innerHTML = "";
  if (header) {
    container.appendChild(header);
  } else {
    container.innerHTML = `
      <div class="section-header">
        <h2 data-i18n="vehiclesTitle">Voertuigen</h2>
        <button type="button" class="btn-primary" id="btn-add-vehicle">+ Voertuig toevoegen</button>
      </div>
    `;
  }

  if (vehicles.length === 0) {
    container.innerHTML += `<p class="placeholder">Nog geen voertuigen toegevoegd.</p>`;
  } else {
    for (const vehicle of vehicles) {
      const tires = await loadTiresFromApi(vehicle.plate);
      container.appendChild(buildVehicleCard(vehicle, tires));
    }
    attachVehicleClickEvents();
  }

  bindAddVehicleButtons();
}

// ===== Vehicles list =====
async function renderVehiclesList(filter = "") {
  const container = document.getElementById("vehicles-list");
  if (!container) return;

  const vehicles = await loadVehiclesFromApi();
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
      : `<p class="placeholder">Nog geen voertuigen toegevoegd.</p>`;
    bindAddVehicleButtons();
    return;
  }

  for (const vehicle of filtered) {
    const tires = await loadTiresFromApi(vehicle.plate);
    container.appendChild(buildVehicleCard(vehicle, tires));
  }

  attachVehicleClickEvents();
  bindAddVehicleButtons();
}

document.getElementById("vehicle-search")?.addEventListener("input", (e) => {
  renderVehiclesList(e.target.value);
});

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
        const tires = await loadTiresFromApi(plate);

        document.getElementById("detail-plate").textContent = vehicle.plate;

        const typeLabel =
          vehicle.type === "trekker" ? "Trekker / Vrachtwagen" :
          vehicle.type === "oplegger" ? "Oplegger" : "Aanhangwagen";

        document.getElementById("detail-type").textContent =
          `${typeLabel} • ${vehicle.brand || ""} ${vehicle.model || ""}`.trim();

        let meta = vehicle.lastInspection
          ? `Laatste inspectie: ${new Date(vehicle.lastInspection).toLocaleDateString("nl-NL")}`
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
        if (!tireContainer) return;

        tireContainer.innerHTML = `
          <div class="section-header tight">
            <h3 id="tire-section-title">Bandposities (${tires.length})</h3>
          </div>
        `;

        if (tires.length === 0) {
          tireContainer.innerHTML += `<p class="placeholder">Nog geen banden geregistreerd.</p>`;
        } else {
          tires.sort((a, b) => {
            if (a.axleNumber !== b.axleNumber) return a.axleNumber - b.axleNumber;
            if (a.side !== b.side) return a.side === "left" ? -1 : 1;
            if (a.dualPosition === "outer") return -1;
            if (b.dualPosition === "outer") return 1;
            return 0;
          });

          tires.forEach(tire => {
            const display = getTireDisplayStatus(tire);
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

            const depth = tire.currentDepth != null
              ? `<strong class="${depthClass}">${tire.currentDepth} mm</strong>` : "–";
            const pressure = tire.currentPressure != null
              ? `<strong class="${pressureClass}">${tire.currentPressure} bar</strong>` : "–";
            const target = tire.targetPressure != null
              ? `<strong>${tire.targetPressure} bar</strong>` : "–";
            const brandLine = [tire.brand, tire.type, tire.size].filter(Boolean).join(" • ") || "Geen merk/type/maat";
            const regrooved = tire.regrooved
              ? `<span class="badge-regrooved">Geherprofileerd</span>`
              : "";

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

        if (typeof renderVehicleSchematic === "function") {
          renderVehicleSchematic(vehicle, tires);
        }

        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.getElementById("page-vehicle-detail")?.classList.add("active");
        document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
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
    await renderVehiclesList(document.getElementById("vehicle-search")?.value || "");
    await renderAlerts();

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-dashboard").classList.add("active");
    document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
    document.querySelectorAll(".nav-item")[0]?.classList.add("active");
  } catch (error) {
    console.error(error);
    alert("Verwijderen mislukt: " + error.message);
  }
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
    axles,
    lastInspection: null,
    createdAt: new Date().toISOString()
  };

  try {
    await apiCreateVehicle(vehicle);
    await apiCreateTiresForVehicle(vehicle);
    await renderVehicles();
    await renderVehiclesList(document.getElementById("vehicle-search")?.value || "");
    await renderAlerts();
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

  const container = document.getElementById("inspection-tires-list");
  container.innerHTML = "";

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
          <input type="number" class="tire-depth" step="0.1" min="0" max="30"
                 value="${tire.currentDepth ?? ""}" placeholder="0.0">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Gemeten druk (bar)</label>
          <input type="number" class="tire-pressure" step="0.1" min="0" max="15"
                 value="${tire.currentPressure ?? ""}" placeholder="0.0">
        </div>
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
          </label>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-initial-inspection").classList.add("active");
}

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
  if (!currentInspectionPlate) {
    alert("Geen voertuig geselecteerd");
    return;
  }

  const cards = document.querySelectorAll(".inspection-tire-card");
  if (cards.length === 0) {
    alert("Geen banden gevonden");
    return;
  }

  try {
    const tires = await loadTiresFromApi(currentInspectionPlate);

    for (const card of cards) {
      const tireId = card.dataset.tireId;
      const brand = card.querySelector(".tire-brand").value.trim();
      const type = card.querySelector(".tire-type")?.value.trim() || "";
      const size = card.querySelector(".tire-size").value.trim();
      const depthVal = card.querySelector(".tire-depth").value;
      const pressureVal = card.querySelector(".tire-pressure").value;
      const targetVal = card.querySelector(".tire-target").value;
      const regrooved = card.querySelector(".tire-regrooved").checked;

      const depth = depthVal === "" ? null : parseFloat(depthVal);
      const pressure = pressureVal === "" ? null : parseFloat(pressureVal);
      const targetPressure = targetVal === "" ? null : parseFloat(targetVal);

      const tire = tires.find(t => String(t.id) === String(tireId));
      if (!tire) continue;

      const display = getTireDisplayStatus({
        ...tire,
        currentDepth: depth,
        currentPressure: pressure,
        targetPressure
      });

      await apiUpdateTire(tire.id, {
        brand,
        type,
        size,
        currentDepth: depth,
        currentPressure: pressure,
        targetPressure,
        regrooved,
        status: display.level,
        installedAt: tire.installedAt || new Date().toISOString()
      });

      await apiAddHistory({
        tireId: tire.id,
        vehiclePlate: currentInspectionPlate,
        date: new Date().toISOString(),
        depth,
        pressure,
        type: inspectionMode === "initial" ? "initial" : "inspection",
        notes: regrooved ? "Geherprofileerd" : "",
        regrooved
      });
    }

    const raw = await apiGetVehicleByPlate(currentInspectionPlate);
    if (raw) {
      await apiUpdateVehicle(raw.id, {
        lastInspection: new Date().toISOString()
      });
    }

    await renderVehicles();
    await renderVehiclesList(document.getElementById("vehicle-search")?.value || "");
    await renderAlerts();

    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById("page-dashboard").classList.add("active");
    document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
    document.querySelectorAll(".nav-item")[0]?.classList.add("active");

    alert("Inspectie opgeslagen");
  } catch (error) {
    console.error(error);
    alert("Er ging iets mis bij het opslaan: " + error.message);
  }
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
    const level = getTireDisplayStatus(tire).level;
    if (level === "good") return "#22c55e";
    if (level === "warning") return "#f59e0b";
    if (level === "danger") return "#ef4444";
    return "#64748b";
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
    if (tire.currentDepth <= 2) {
      faults.push({
        level: "danger",
        type: "tread",
        message: `Profieldiepte te laag (${tire.currentDepth} mm) — vervangen geadviseerd`
      });
    } else if (tire.currentDepth <= 4) {
      faults.push({
        level: "warning",
        type: "tread",
        message: tire.canRegroove
          ? `Profieldiepte laag (${tire.currentDepth} mm) — regrooven mogelijk`
          : `Profieldiepte laag (${tire.currentDepth} mm) — binnenkort vervangen`
      });
    }
  }

  if (tire.currentPressure != null && tire.targetPressure != null) {
    const diff = Math.abs(tire.targetPressure - tire.currentPressure);
    if (diff >= 2.0) {
      faults.push({
        level: "danger",
        type: "pressure",
        message: `Grote drukafwijking (${tire.currentPressure} bar, voorschrift ${tire.targetPressure} bar) — controleer op lekke band`
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
  const vehicles = await loadVehiclesFromApi();
  const alerts = [];

  for (const vehicle of vehicles) {
    if (isInspectionOverdue(vehicle)) {
      const days = vehicle.lastInspection
        ? Math.floor((Date.now() - new Date(vehicle.lastInspection)) / (1000 * 60 * 60 * 24))
        : null;
      alerts.push({
        level: vehicle.lastInspection ? "warning" : "danger",
        vehiclePlate: vehicle.plate,
        message: vehicle.lastInspection
          ? `Inspectie verlopen (${days} dagen geleden)`
          : "Nog geen inspectie uitgevoerd",
        type: "inspection"
      });
    }

    const tires = await loadTiresFromApi(vehicle.plate);
    for (const tire of tires) {
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
  }

  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1));
  return alerts;
}

async function renderAlerts() {
  const container = document.querySelector("#page-dashboard .alerts");
  if (!container) return;

  const alerts = await collectAllAlerts();
  container.innerHTML = `<h2 data-i18n="alertsTitle">Meldingen</h2>`;

  if (alerts.length === 0) {
    container.innerHTML += `<p class="placeholder">Geen openstaande meldingen. Alles in orde.</p>`;
    return;
  }

  for (const alert of alerts.slice(0, 8)) {
    const levelClass = alert.level === "danger" ? "alert-danger" : "alert-warning";
    const icon = alert.level === "danger" ? "⚠️" : "📅";
    const sub = alert.position ? `${alert.vehiclePlate} • ${alert.position}` : alert.vehiclePlate;
    container.innerHTML += `
      <div class="alert-card ${levelClass}">
        <div class="alert-icon">${icon}</div>
        <div class="alert-content">
          <strong>${alert.message}</strong>
          <p>${sub}</p>
        </div>
      </div>
    `;
  }

  if (alerts.length > 8) {
    container.innerHTML += `<p class="placeholder">+ ${alerts.length - 8} andere meldingen</p>`;
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
    if (tire.currentDepth <= 2) {
      depthEl.className = "metric-value danger";
      depthHint.textContent = "Vervangen geadviseerd (≤ 2 mm)";
    } else if (tire.currentDepth <= 4) {
      depthEl.className = "metric-value warn";
      depthHint.textContent = "Onder / rond adviesdrempel (4 mm)";
    } else {
      depthEl.className = "metric-value good";
      depthHint.textContent = "Binnen acceptabel bereik";
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

document.getElementById("back-from-tire")?.addEventListener("click", () => {
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
  const targetVal = document.getElementById("edit-tire-target").value;
  const installedVal = document.getElementById("edit-tire-installed").value;
  const kmVal = document.getElementById("edit-tire-km").value;
  const regrooved = document.getElementById("edit-tire-regrooved").checked;

  const currentDepth = depthVal === "" ? null : parseFloat(depthVal);
  const currentPressure = pressureVal === "" ? null : parseFloat(pressureVal);
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
      notes: regrooved ? "Geherprofileerd (handmatige edit)" : "Handmatige edit",
      regrooved
    });

    const updated = { ...editingTire, ...fields, model: size };
    window._lastOpenedTire = updated;
    await openTireDetail(updated);
    alert("Band opgeslagen");
  } catch (err) {
    console.error(err);
    alert("Opslaan mislukt: " + err.message);
  }
});