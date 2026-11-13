import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/** A line at the bottom for a few seconds, with Annulla when the action can be taken back (a swipe by mistake). */
export interface Toast { text: string; undo?(): void }

const SHOWN_MS = 5000;
const ToastContext = createContext<(t: Toast) => void>(() => undefined);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), SHOWN_MS);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastContext.Provider value={setToast}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button className="link" onClick={() => { toast.undo!(); setToast(null); }}>Annulla</button>}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** Shows a toast; outside a ToastHost (a view tested alone) it does nothing. */
export const useToast = () => useContext(ToastContext);
