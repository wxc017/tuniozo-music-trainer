import { useState } from "react";

/** useState that persists to localStorage, so a tab's settings survive
 *  switching away and back (the component unmounts between tab switches). */
export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s != null ? (JSON.parse(s) as T) : initial; }
    catch { return initial; }
  });
  const set = (next: T | ((prev: T) => T)) => {
    setV(prev => {
      const val = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
      return val;
    });
  };
  return [v, set] as const;
}
