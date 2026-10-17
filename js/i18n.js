// ===== Translations =====
const translations = {
  nl: {
    subtitle: "Overzicht van uw vloot en bandenstatus",
    alertsTitle: "Meldingen",
    vehiclesTitle: "Voertuigen",
    navDashboard: "Dashboard",
    navVehicles: "Voertuigen",
    navAlerts: "Meldingen",
    navSettings: "Instellingen"
  },
  en: {
    subtitle: "Overview of your fleet and tire status",
    alertsTitle: "Alerts",
    vehiclesTitle: "Vehicles",
    navDashboard: "Dashboard",
    navVehicles: "Vehicles",
    navAlerts: "Alerts",
    navSettings: "Settings"
  }
};

let currentLang = "nl";

function updateLanguage(lang) {
  currentLang = lang;
  const t = translations[lang];

  const subtitle = document.querySelector(".header-subtitle");
  if (subtitle) subtitle.textContent = t.subtitle;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.textContent = t[key];
  });

  const navLabels = document.querySelectorAll(".nav-label");
  if (navLabels[0]) navLabels[0].textContent = t.navDashboard;
  if (navLabels[1]) navLabels[1].textContent = t.navVehicles;
  if (navLabels[2]) navLabels[2].textContent = t.navAlerts;
  if (navLabels[3]) navLabels[3].textContent = t.navSettings;

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
}

document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => updateLanguage(button.dataset.lang));
});