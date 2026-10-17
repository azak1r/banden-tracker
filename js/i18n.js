// ===== Translations =====
const translations = {
  nl: {
    subtitle: "Overzicht van uw vloot en bandenstatus",
    alertsTitle: "Meldingen",
    vehiclesTitle: "Voertuigen",
    navDashboard: "Dashboard",
    navVehicles: "Voertuigen",
    navAlerts: "Meldingen"
  },
  en: {
    subtitle: "Overview of your fleet and tire status",
    alertsTitle: "Alerts",
    vehiclesTitle: "Vehicles",
    navDashboard: "Dashboard",
    navVehicles: "Vehicles",
    navAlerts: "Alerts"
  }
};

let currentLang = "nl";

function t(key) {
  return translations[currentLang]?.[key] || key;
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

  const navLabels = document.querySelectorAll(".nav-label");
  if (navLabels[0]) navLabels[0].textContent = dict.navDashboard;
  if (navLabels[1]) navLabels[1].textContent = dict.navVehicles;
  if (navLabels[2]) navLabels[2].textContent = dict.navAlerts;

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  localStorage.setItem("lang", lang);
}

// Restore saved language
const savedLang = localStorage.getItem("lang");
if (savedLang && translations[savedLang]) {
  updateLanguage(savedLang);
}

document.querySelectorAll(".lang-btn").forEach(button => {
  button.addEventListener("click", () => updateLanguage(button.dataset.lang));
});
