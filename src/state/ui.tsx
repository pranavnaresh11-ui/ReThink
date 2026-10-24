import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type Tab = 'home' | 'forecast' | 'apps' | 'lab';

export type FightMode = 'craving' | 'reduce' | 'check';

export type Overlay =
  | { kind: 'fight'; mode: FightMode }
  | { kind: 'relapse' }
  | { kind: 'checkin' }
  | { kind: 'reflect' }
  | { kind: 'shield'; appId: string }
  | { kind: 'milestones' };

export interface Toast {
  id: number;
  text: string;
  tone: 'xp' | 'info' | 'warn';
}

export interface Nudge {
  p: number;
  at: number;
  preemptive: boolean;
}

interface UIValue {
  tab: Tab;
  setTab: (t: Tab) => void;
  overlay: Overlay | null;
  /** Changes on every open, so a reopened overlay never revives one that is still animating out. */
  overlayKey: number;
  open: (o: Overlay) => void;
  close: () => void;
  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  nudge: Nudge | null;
  setNudge: (n: Nudge | null) => void;
}

const UIContext = createContext<UIValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [overlayKey, setOverlayKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.slice(-2), { id, text, tone }]);
    // Long enough to read: about 70 ms a character, never under 3.2 s.
    window.setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), Math.max(3200, text.length * 70));
  }, []);

  const value = useMemo<UIValue>(
    () => ({
      tab,
      setTab,
      overlay,
      overlayKey,
      open: (o: Overlay) => {
        setOverlay(o);
        setOverlayKey((k) => k + 1);
      },
      close: () => setOverlay(null),
      toasts,
      toast,
      nudge,
      setNudge,
    }),
    [tab, overlay, overlayKey, toasts, toast, nudge],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIValue {
  const v = useContext(UIContext);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
}
