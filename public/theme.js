/**
 * BargainOS Theme Controller
 * Seamless Light Mode & Dark Mode with persistence and instant hydration
 */
(function () {
  "use strict";

  const STORAGE_KEY = "bargainos_theme";

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore private storage limitations
    }

    // Update all theme toggle elements
    document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
      const isLight = theme === "light";
      btn.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
      btn.setAttribute("title", isLight ? "Switch to dark theme" : "Switch to light theme");
      const icon = btn.querySelector(".theme-toggle-icon");
      const label = btn.querySelector(".theme-toggle-label");
      if (icon) {
        icon.textContent = isLight ? "🌙" : "☀️";
      }
      if (label) {
        label.textContent = isLight ? "Dark Mode" : "Light Mode";
      }
    });

    window.dispatchEvent(new CustomEvent("bargainos:theme-changed", { detail: { theme } }));
  }

  // Initial immediate application
  const currentTheme = getSavedTheme() || getSystemTheme();
  applyTheme(currentTheme);

  // Set up event listeners once DOM is ready
  function initThemeButtons() {
    document.querySelectorAll(".theme-toggle-btn").forEach((btn) => {
      // Remove any duplicate listeners
      btn.onclick = function (e) {
        e.preventDefault();
        const active = document.documentElement.getAttribute("data-theme") || "dark";
        const next = active === "light" ? "dark" : "light";
        applyTheme(next);
      };
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeButtons);
  } else {
    initThemeButtons();
  }

  // Cross-tab theme sync
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      applyTheme(e.newValue);
    }
  });

  window.BargainOSTheme = {
    get: () => document.documentElement.getAttribute("data-theme") || "dark",
    set: applyTheme,
    toggle: () => {
      const active = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(active === "light" ? "dark" : "light");
    },
  };
})();
