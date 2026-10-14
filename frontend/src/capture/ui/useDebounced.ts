import { useEffect, useState } from "react";

/** The value once it has stopped changing for a moment, so typing doesn't search on every key. */
export function useDebounced<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
