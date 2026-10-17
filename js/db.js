// ===== IndexedDB Setup - Banden Tracker =====
const DB_NAME = "BandenTracker";
const DB_VERSION = 2;          // increased because structure changed

let db = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("Database error:", event.target.error);
      reject("Could not open database");
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("Database opened successfully");
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Remove old stores if they exist (clean upgrade)
      if (database.objectStoreNames.contains("vehicles")) {
        database.deleteObjectStore("vehicles");
      }
      if (database.objectStoreNames.contains("tires")) {
        database.deleteObjectStore("tires");
      }
      if (database.objectStoreNames.contains("history")) {
        database.deleteObjectStore("history");
      }

      // ===== Vehicles store =====
      const vehiclesStore = database.createObjectStore("vehicles", {
        keyPath: "plate"
      });
      vehiclesStore.createIndex("type", "type", { unique: false });
      vehiclesStore.createIndex("lastInspection", "lastInspection", { unique: false });

      // ===== Tires store =====
      const tiresStore = database.createObjectStore("tires", {
        keyPath: "id",
        autoIncrement: true
      });
      tiresStore.createIndex("vehiclePlate", "vehiclePlate", { unique: false });
      tiresStore.createIndex("positionLabel", "positionLabel", { unique: false });

      // ===== History store =====
      const historyStore = database.createObjectStore("history", {
        keyPath: "id",
        autoIncrement: true
      });
      historyStore.createIndex("tireId", "tireId", { unique: false });
      historyStore.createIndex("vehiclePlate", "vehiclePlate", { unique: false });
      historyStore.createIndex("date", "date", { unique: false });

      console.log("New database structure created (v2)");
    };
  });
}

// ===== Helper: generate position labels =====
function generatePositionLabel(axleNumber, axleType, side, dualPosition) {
  const typeNames = {
    steer: "Stuur-as",
    driven: "Aandrijfas",
    lift: "Liftas",
    stiff: "Starre as"
  };

  const sideNames = {
    left: "Links",
    right: "Rechts"
  };

  let label = `${typeNames[axleType]} ${axleNumber} ${sideNames[side]}`;

  if (dualPosition === "outer") label += " Buiten";
  if (dualPosition === "inner") label += " Binnen";

  return label;
}

// ===== Vehicle helpers =====

function addVehicle(vehicle) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vehicles", "readwrite");
    const store = tx.objectStore("vehicles");
    const request = store.add(vehicle);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllVehicles() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vehicles", "readonly");
    const store = tx.objectStore("vehicles");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getVehicle(plate) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vehicles", "readonly");
    const store = tx.objectStore("vehicles");
    const request = store.get(plate);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updateVehicle(vehicle) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vehicles", "readwrite");
    const store = tx.objectStore("vehicles");
    const request = store.put(vehicle);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ===== Tire helpers =====

function addTire(tire) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tires", "readwrite");
    const store = tx.objectStore("tires");
    const request = store.add(tire);

    request.onsuccess = () => resolve(request.result); // returns the new id
    request.onerror = () => reject(request.error);
  });
}

function getTiresForVehicle(plate) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tires", "readonly");
    const store = tx.objectStore("tires");
    const index = store.index("vehiclePlate");
    const request = index.getAll(plate);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updateTire(tire) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("tires", "readwrite");
    const store = tx.objectStore("tires");
    const request = store.put(tire);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ===== History helpers =====

function addHistory(entry) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readwrite");
    const store = tx.objectStore("history");
    const request = store.add(entry);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getHistoryForVehicle(plate) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("history", "readonly");
    const store = tx.objectStore("history");
    const index = store.index("vehiclePlate");
    const request = index.getAll(plate);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ===== Create tire positions from axle configuration =====
async function createTiresForVehicle(vehicle) {
  const tires = [];

  for (const axle of vehicle.axles) {
    const sides = ["left", "right"];

    for (const side of sides) {
      if (axle.dual) {
        // Dual tire → outer + inner
        const outerLabel = generatePositionLabel(axle.number, axle.type, side, "outer");
        const innerLabel = generatePositionLabel(axle.number, axle.type, side, "inner");

        tires.push({
          vehiclePlate: vehicle.plate,
          axleNumber: axle.number,
          side: side,
          dualPosition: "outer",
          positionLabel: outerLabel,
          brand: "",
          model: "",
          size: "",
          currentDepth: null,
          currentPressure: null,
          targetPressure: null,
          status: "unknown",
          canRegroove: axle.type !== "steer",
          installedAt: null
        });

        tires.push({
          vehiclePlate: vehicle.plate,
          axleNumber: axle.number,
          side: side,
          dualPosition: "inner",
          positionLabel: innerLabel,
          brand: "",
          model: "",
          size: "",
          currentDepth: null,
          currentPressure: null,
          targetPressure: null,
          status: "unknown",
          canRegroove: axle.type !== "steer",
          installedAt: null
        });
      } else {
        // Single tire
        const label = generatePositionLabel(axle.number, axle.type, side, null);

        tires.push({
          vehiclePlate: vehicle.plate,
          axleNumber: axle.number,
          side: side,
          dualPosition: null,
          positionLabel: label,
          brand: "",
          model: "",
          size: "",
          currentDepth: null,
          currentPressure: null,
          targetPressure: null,
          status: "unknown",
          canRegroove: axle.type !== "steer",
          installedAt: null
        });
      }
    }
  }

  // Save all tires to the database
  for (const tire of tires) {
    await addTire(tire);
  }

  return tires;
}

// ===== Single-record deletes =====

function deleteRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ===== Full vehicle cleanup =====

async function deleteVehicleCompletely(plate) {
  // Always normalize
  plate = String(plate).trim().toUpperCase();

  // 1. Delete history
  const history = await getHistoryForVehicle(plate);
  for (const entry of history) {
    await deleteRecord("history", entry.id);
  }

  // 2. Delete tires
  const tires = await getTiresForVehicle(plate);
  for (const tire of tires) {
    await deleteRecord("tires", tire.id);
  }

  // 3. Delete vehicle
  await deleteRecord("vehicles", plate);

  console.log(`Deleted vehicle ${plate} and related data`);
  return true;
}