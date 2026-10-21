"use client";

import { useEffect } from "react";

/** iPadOS ignores `user-scalable=no`, so stop pinch-zoom here; it only ever happens by accident mid-game. */
export function NoZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);
  return null;
}
