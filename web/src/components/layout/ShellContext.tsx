"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ShellContextValue = {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

const STORAGE_KEY = "cr-sidebar-open";

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setSidebarOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (open: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    persist(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    persist(false);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      persist(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, closeSidebar]);

  return (
    <ShellContext.Provider value={{ sidebarOpen, openSidebar, closeSidebar, toggleSidebar }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
