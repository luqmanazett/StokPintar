import { createContext, useContext } from "react";

export type ThemeContextValue = { isDark: boolean; toggleTheme: () => void };

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Komponen tema harus digunakan di dalam ThemeProvider.");
  return context;
}
