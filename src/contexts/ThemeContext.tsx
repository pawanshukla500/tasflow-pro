import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
interface ThemeCtx { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void; }

const ThemeContext = createContext<ThemeCtx | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("app-theme") as Theme | null;
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("app-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
};
