'use client';
import { useEffect, useRef } from 'react';

/**
 * Hidden field for the test log. Records how long the form was open, whether the browser says it is automated,
 * how many key presses, clicks and pastes happened, and how much text was pasted. No field contents are read here.
 * See src/lib/anomalies.ts and the staff monitoring notice.
 */
export function TestSignals() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t0 = Date.now();
    const s = { ia: 0, pa: 0, pc: 0 };
    const write = () => {
      if (ref.current) ref.current.value = JSON.stringify({ ms: Date.now() - t0, wd: !!navigator.webdriver, ia: s.ia, pa: s.pa, pc: s.pc });
    };
    const act = () => { s.ia++; write(); };
    const paste = (e: ClipboardEvent) => { s.pa++; s.pc += e.clipboardData?.getData('text')?.length ?? 0; act(); };
    document.addEventListener('keydown', act, true);
    document.addEventListener('pointerdown', act, true);
    document.addEventListener('paste', paste, true);
    const id = window.setInterval(write, 1000);
    write();
    return () => {
      document.removeEventListener('keydown', act, true);
      document.removeEventListener('pointerdown', act, true);
      document.removeEventListener('paste', paste, true);
      window.clearInterval(id);
    };
  }, []);
  return <input ref={ref} type="hidden" name="_sig" defaultValue="" />;
}
