export const APP_THEMES = ["blue", "pink"] as const;
export type AppTheme = (typeof APP_THEMES)[number];

const THEME_STORAGE_KEY = "theme";

function normalizeTheme(themeName: string): AppTheme {
  const normalized = String(themeName || "").trim().toLowerCase();
  if (normalized === "pink" || normalized === "pink-cute") return "pink";
  return "blue";
}

export function setTheme(themeName: string): AppTheme {
  const theme = normalizeTheme(themeName);
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  return theme;
}

export function loadTheme(): AppTheme {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return setTheme(savedTheme || "blue");
}

export function applyTheme(themeName: string): AppTheme {
  return setTheme(themeName);
}
