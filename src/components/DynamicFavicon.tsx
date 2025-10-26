"use client";
import { useEffect } from "react";
import { useTheme } from "next-themes";

const faviconMap = {
  light: "/images/safeway-favicon.ico",
  dark: "/images/safeway-favicon.ico",
  system: "/images/safeway-favicon.ico"
};

export function DynamicFavicon() {
  const { theme, systemTheme } = useTheme();

  useEffect(() => {
    let currentTheme: keyof typeof faviconMap = 'light';
    if (theme === 'system') {
      if (systemTheme === 'dark' || systemTheme === 'light') {
        currentTheme = systemTheme;
      }
    } else if (theme === 'dark' || theme === 'light') {
      currentTheme = theme;
    }
    const favicon = document.querySelector("link[rel*='icon']");
    if (favicon) {
      favicon.setAttribute("href", faviconMap[currentTheme]);
    } else {
      const link = document.createElement("link");
      link.rel = "shortcut icon";
      link.type = "image/x-icon";
      link.href = faviconMap[currentTheme];
      document.head.appendChild(link);
    }
  }, [theme, systemTheme]);

  return null;
}
