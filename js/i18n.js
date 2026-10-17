// ===== Translations =====
const translations = {
  nl: {
    subtitle: "Overzicht van uw vloot en bandenstatus",
    alertsTitle: "Meldingen",
    vehiclesTitle: "Voertuigen",
    navDashboard: "Dashboard",
    navVehicles: "Voertuigen",
    navAlerts: "Meldingen",

    addVehicle: "+ Voertuig toevoegen",
    add: "+ Toevoegen",
    searchPlaceholder: "Zoek op kenteken...",
    noVehicles: "Nog geen voertuigen toegevoegd.",
    noVehiclesFound: "Geen voertuigen gevonden.",
    noAlerts: "Geen openstaande meldingen. Alles in orde.",

    back: "← Terug",
    inspect: "Inspectie",
    delete: "Verwijder",
    edit: "Bewerken",
    save: "Opslaan",
    cancel: "Annuleren",

    newVehicle: "Nieuw voertuig toevoegen",
    plate: "Kenteken",
    vehicleType: "Type voertuig",
    brand: "Merk",
    model: "Model",
    driver: "Chauffeur",
    axles: "Assen configuratie",
    addAxle: "+ As toevoegen",
    saveVehicle: "Voertuig opslaan",

    trekker: "Trekker / Vrachtwagen",
    oplegger: "Oplegger",
    aanhangwagen: "Aanhangwagen",

    tirePositions: "Bandposities",
    noTires: "Nog geen banden geregistreerd.",
    depth: "Diepte",
    pressure: "Druk",
    target: "Voorschrift",
    good: "Goed",
    warning: "Let op",
    danger: "Actie nodig",
    unknown: "Onbekend",
    new: "Nieuw",

    login: "Inloggen",
    email: "E-mail",
    password: "Wachtwoord",
    loginFailed: "Inloggen mislukt. Controleer e-mail en wachtwoord.",

    lastInspection: "Laatste inspectie",
    noInspection: "Nog geen inspectie uitgevoerd",
    daysLeft: "Nog {n} dagen",
    daysOverdue: "{n} dagen te laat"
  },
  en: {
    subtitle: "Overview of your fleet and tire status",
    alertsTitle: "Alerts",
    vehiclesTitle: "Vehicles",
    navDashboard: "Dashboard",
    navVehicles: "Vehicles",
    navAlerts: "Alerts",

    addVehicle: "+ Add vehicle",
    add: "+ Add",
    searchPlaceholder: "Search by plate...",
    noVehicles: "No vehicles added yet.",
    noVehiclesFound: "No vehicles found.",
    noAlerts: "No open alerts. Everything is fine.",

    back: "← Back",
    inspect: "Inspection",
    delete: "Delete",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",

    newVehicle: "Add new vehicle",
    plate: "License plate",
    vehicleType: "Vehicle type",
    brand: "Brand",
    model: "Model",
    driver: "Driver",
    axles: "Axle configuration",
    addAxle: "+ Add axle",
    saveVehicle: "Save vehicle",

    trekker: "Tractor / Truck",
    oplegger: "Semi-trailer",
    aanhangwagen: "Trailer",

    tirePositions: "Tire positions",
    noTires: "No tires registered yet.",
    depth: "Depth",
    pressure: "Pressure",
    target: "Target",
    good: "Good",
    warning: "Warning",
    danger: "Action needed",
    unknown: "Unknown",
    new: "New",

    login: "Log in",
    email: "Email",
    password: "Password",
    loginFailed: "Login failed. Check email and password.",

    lastInspection: "Last inspection",
    noInspection: "No inspection yet",
    daysLeft: "{n} days left",
    daysOverdue: "{n} days overdue"
  }
};

let currentLang = "nl";

function t(key, vars) {
  let str = translations[currentLang]?.[key] || translations.nl[key] || key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(`{${k}}`, v);
    });
  }
  return str;
}

function updateLanguage(lang) {
  currentLang = lang;
  const dict = translations[lang];
  if (!dict) return;

  const subtitle = document.querySelector(".header-subtitle");
  if (subtitle) subtitle.textContent = dict.subtitle;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) el.placeholder = dict[key];
  });

  const navLabels = document.querySelectorAll(".nav-label");
  if (navLabels[0]) navLabels[0].textContent = dict.navDashboard;
  if (navLabels[1]) navLabels[1].textContent = dict.navVehicles;
  if (navLabels[2]) navLabels[2].textContent = dict.navAlerts;

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  localStorage.setItem("lang", lang);
}

const savedLang = localStorage.getItem("lang");
if (savedLang && translations[savedLang]) {
  updateLanguage(savedLang);
}

document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => updateLanguage(button.dataset.lang));
});
