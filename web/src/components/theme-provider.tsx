import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeContext, useTheme } from "@/components/theme-context";

type ThemePreference = "system" | "light" | "dark";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem("stokpintar-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const isDark = preference === "dark" || (preference === "system" && systemPrefersDark);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updatePreference = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark]);

  useEffect(() => {
    if (preference === "system") {
      localStorage.removeItem("stokpintar-theme");
    } else {
      localStorage.setItem("stokpintar-theme", preference);
    }
  }, [preference]);

  function toggleTheme() {
    setPreference(isDark ? "light" : "dark");
  }

  return <ThemeContext.Provider value={{ isDark, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap";

  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={toggleTheme}>
      {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </Button>
  );
}
