import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

declare global {
  interface Window {
    dataLayer: unknown[][];
    gtag: (...args: unknown[]) => void;
  }
}

let initializedMeasurementId: string | null = null;

function initializeAnalytics(measurementId: string) {
  if (initializedMeasurementId === measurementId) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.onerror = () => {
    console.error("Failed to load the Google Analytics script.");
  };
  document.head.appendChild(script);
  initializedMeasurementId = measurementId;
}

export default function Analytics() {
  const { pathname, search } = useLocation();
  const lastPageView = useRef<string | null>(null);

  useEffect(() => {
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
    if (!measurementId) return;
    if (!/^G-[A-Z0-9]+$/i.test(measurementId)) {
      console.error("VITE_GA_MEASUREMENT_ID must be a valid GA4 measurement ID.");
      return;
    }

    initializeAnalytics(measurementId);

    const pagePath = `${pathname}${search}`;
    if (lastPageView.current === pagePath) return;
    lastPageView.current = pagePath;
    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_title: document.title,
    });
  }, [pathname, search]);

  return null;
}
