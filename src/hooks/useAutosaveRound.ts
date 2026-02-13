// src/hooks/useAutosaveRound.ts
// Debounced autosave helper so we don't spam AsyncStorage on every keystroke.

import { useEffect, useRef } from 'react';

export function useAutosaveRound(
  payload: unknown,
  saveFn: () => Promise<void>,
  delayMs = 400
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    // Skip autosave on the very first render to avoid overwriting a loaded state
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveFn();
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);
}
