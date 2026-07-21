"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const STALE_AFTER_MS = 60_000;

/**
 * PWA no celular: o SO suspende o app em background e os Server Components
 * ficam com dados/sessão velhos até um reload manual. Revalida ao retomar.
 */
export function ResumeRefresh() {
  const router = useRouter();
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    function refreshIfStale() {
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt !== null && Date.now() - hiddenAt > STALE_AFTER_MS) {
        router.refresh();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else {
        refreshIfStale();
      }
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) router.refresh();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", refreshIfStale);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [router]);

  return null;
}
