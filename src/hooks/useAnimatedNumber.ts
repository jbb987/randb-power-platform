import { useState, useEffect, useRef } from 'react';

/**
 * Returns the formatted value and a "just changed" flag
 * that stays true for a brief moment after value changes.
 * No counting animation — instant snap with highlight.
 */
export function useValueFlash(value: number, format: (n: number) => string) {
  const [display, setDisplay] = useState(format(value));
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setDisplay(format(value));

    if (prevValue.current !== value) {
      setFlash(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setFlash(false), 400);
      prevValue.current = value;
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, format]);

  return { display, flash };
}
