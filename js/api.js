// ===== PocketBase API =====
const PB_URL = "https://te97luowr66c6j7.pwz5.pocketbasecloud.com";

const pb = new PocketBase(PB_URL);

async function login(email, password) {
  return await pb.collection("users").authWithPassword(email, password);
}

function logout() {
  pb.authStore.clear();
}

function isLoggedIn() {
  return pb.authStore.isValid;
}

function getCurrentUser() {
  return pb.authStore.model;
}

// Make sure every request uses the auth token
function authHeaders() {
  return pb.authStore.token
    ? { Authorization: pb.authStore.token }
    : {};
}

async function pbRequest(path, options = {}) {
  const url = path.startsWith("api/") ? path : `api/${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...authHeaders(),
    ...(options.headers || {})
  };
  const res = await fetch(`${PB_URL}/${url}`, { ...options, headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ----- Vehicles -----
async function apiGetAllVehicles() {
  const data = await pbRequest("collections/vehicles/records?perPage=200&sort=plate");
  return data.items || [];
}

async function apiGetVehicleByPlate(plate) {
  const filter = encodeURIComponent(`plate="${plate}"`);
  const data = await pbRequest(
    `collections/vehicles/records?filter=${filter}&perPage=1`
  );
  return data.items?.[0] || null;
}

async function apiCreateVehicle(vehicle) {
  return pbRequest("collections/vehicles/records", {
    method: "POST",
    body: JSON.stringify({
      plate: vehicle.plate,
      type: vehicle.type,
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      driver: vehicle.driver || "",
      axles: vehicle.axles || [],
      lastInspection: vehicle.lastInspection || "",
      createdAt: vehicle.createdAt || new Date().toISOString()
    })
  });
}

async function apiUpdateVehicle(recordId, fields) {
  return pbRequest(`collections/vehicles/records/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
}

async function apiDeleteVehicle(recordId) {
  return pbRequest(`collections/vehicles/records/${recordId}`, {
    method: "DELETE"
  });
}

// ----- Tires -----
async function apiGetTiresForVehicle(plate) {
  const filter = encodeURIComponent(`vehiclePlate="${plate}"`);
  const data = await pbRequest(
    `collections/tires/records?filter=${filter}&perPage=200`
  );
  return data.items || [];
}

async function apiCreateTire(tire) {
  const payload = {
    vehiclePlate: tire.vehiclePlate,
    axleNumber: tire.axleNumber,
    side: tire.side,
    positionLabel: tire.positionLabel,
    brand: tire.brand || "",
    type: tire.type || "",
    size: tire.size || "",
    status: tire.status || "unknown",
    regrooved: !!tire.regrooved,
    canRegroove: !!tire.canRegroove,
    installedAt: tire.installedAt || ""
  };

  if (tire.dualPosition) payload.dualPosition = tire.dualPosition;
  if (tire.currentDepth != null) payload.currentDepth = tire.currentDepth;
  if (tire.currentPressure != null) payload.currentPressure = tire.currentPressure;
  if (tire.targetPressure != null) payload.targetPressure = tire.targetPressure;
  if (tire.mountedKm != null) payload.mountedKm = tire.mountedKm;

  return pbRequest("collections/tires/records", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function apiUpdateTire(recordId, fields) {
  return pbRequest(`collections/tires/records/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify(fields)
  });
}

async function apiDeleteTire(recordId) {
  return pbRequest(`collections/tires/records/${recordId}`, {
    method: "DELETE"
  });
}

async function apiCreateTiresForVehicle(vehicle) {
  const axles = vehicle.axles || [];
  const created = [];
  const typeNames = {
    steer: "Stuur-as",
    driven: "Aandrijfas",
    lift: "Liftas",
    stiff: "Starre as"
  };

  // Count per type → only show number if more than one of that type
  const typeCount = {};
  axles.forEach(a => {
    typeCount[a.type] = (typeCount[a.type] || 0) + 1;
  });

  for (const axle of axles) {
    const canRegroove = axle.type === "driven" || axle.type === "stiff";
    const base = typeNames[axle.type] || "As";
    const numPart = typeCount[axle.type] > 1 ? ` ${axle.number}` : "";

    if (axle.dual) {
      const positions = [
        { side: "left", dualPosition: "outer", sideLabel: "Links", dualLabel: "Buiten" },
        { side: "left", dualPosition: "inner", sideLabel: "Links", dualLabel: "Binnen" },
        { side: "right", dualPosition: "inner", sideLabel: "Rechts", dualLabel: "Binnen" },
        { side: "right", dualPosition: "outer", sideLabel: "Rechts", dualLabel: "Buiten" }
      ];

      for (const p of positions) {
        created.push(await apiCreateTire({
          vehiclePlate: vehicle.plate,
          axleNumber: axle.number,
          side: p.side,
          dualPosition: p.dualPosition,
          positionLabel: `${base}${numPart} ${p.sideLabel} ${p.dualLabel}`,
          status: "unknown",
          regrooved: false,
          canRegroove
        }));
      }
    } else {
      for (const side of ["left", "right"]) {
        const sideLabel = side === "left" ? "Links" : "Rechts";
        created.push(await apiCreateTire({
          vehiclePlate: vehicle.plate,
          axleNumber: axle.number,
          side,
          positionLabel: `${base}${numPart} ${sideLabel}`,
          status: "unknown",
          regrooved: false,
          canRegroove
        }));
      }
    }
  }

  return created;
}

// ----- History -----
async function apiAddHistory(entry) {
  return pbRequest("collections/history/records", {
    method: "POST",
    body: JSON.stringify(entry)
  });
}

async function apiGetHistoryForTire(tireId) {
  const filter = encodeURIComponent(`tireId="${tireId}"`);
  const data = await pbRequest(
    `collections/history/records?filter=${filter}&perPage=100&sort=-date`
  );
  return data.items || [];
}

async function apiDeleteHistoryForVehicle(plate) {
  const filter = encodeURIComponent(`vehiclePlate="${plate}"`);
  const data = await pbRequest(
    `collections/history/records?filter=${filter}&perPage=200`
  );
  for (const row of data.items || []) {
    await pbRequest(`collections/history/records/${row.id}`, { method: "DELETE" });
  }
}

