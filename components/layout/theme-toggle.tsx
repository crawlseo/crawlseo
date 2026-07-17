"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Mode = "system" | "light" | "dark";

function applyMode(mode: Mode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);

  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("crawlseo-theme") as Mode) || "dark";
    setMode(saved);
    applyMode(saved);
  }, []);

  function choose(next: Mode) {
    setMode(next);
    localStorage.setItem("crawlseo-theme", next);
    applyMode(next);
  }

  const btn =
    "flex size-7 items-center justify-center rounded-full text-[12px] transition";

  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted/80 p-0.5">
      <button
        type="button"
        aria-label="System theme"
        className={cn(btn, mode === "system" && "bg-secondary text-foreground")}
        onClick={() => choose("system")}
      >
        ◐
      </button>
      <button
        type="button"
        aria-label="Light theme"
        className={cn(btn, mode === "light" && "bg-secondary text-foreground")}
        onClick={() => choose("light")}
      >
        ☀
      </button>
      <button
        type="button"
        aria-label="Dark theme"
        className={cn(btn, mode === "dark" && "bg-primary/20 text-primary")}
        onClick={() => choose("dark")}
      >
        ☾
      </button>
    </div>
  );
}
