import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { BottomNav, Banners } from './components/Chrome.tsx';
import { Toasts } from './components/ui.tsx';
import { useNow } from './hooks/useNow.ts';
import { BossFight } from './overlays/BossFight.tsx';
import { CheckInSheet, MilestonesSheet, ReflectSheet, RelapseSheet, ShieldOverlay } from './overlays/Sheets.tsx';
import { Apps } from './screens/Apps.tsx';
import { Forecast } from './screens/Forecast.tsx';
import { Home } from './screens/Home.tsx';
import { Lab } from './screens/Lab.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { EngineProvider, useProfile } from './state/engine.tsx';
import { Monitor } from './state/Monitor.tsx';
import { UIProvider, useUI, type Overlay } from './state/ui.tsx';

/** Fake status bar, only shown in the desktop phone frame (real phones have their own). */
function StatusBar() {
  const t = useNow(15_000);
  return (
    <div className="hidden h-11 shrink-0 items-center justify-between px-7 text-[13px] font-semibold sm:flex">
      <span className="tabular-nums">{new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
      <div className="flex items-center gap-1.5">
        <div className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <div key={h} className="w-[3px] rounded-sm bg-text" style={{ height: h }} />
          ))}
        </div>
        <div className="ml-1 h-[11px] w-[22px] rounded-[3px] border border-text/60 p-[1.5px]">
          <div className="h-full w-3/4 rounded-[1.5px] bg-text" />
        </div>
      </div>
    </div>
  );
}

function OverlayView({ overlay, close }: { overlay: Overlay; close: () => void }) {
  switch (overlay.kind) {
    case 'fight':
      return <BossFight mode={overlay.mode} onClose={close} />;
    case 'relapse':
      return <RelapseSheet onClose={close} />;
    case 'checkin':
      return <CheckInSheet onClose={close} />;
    case 'reflect':
      return <ReflectSheet onClose={close} />;
    case 'shield':
      return <ShieldOverlay appId={overlay.appId} onClose={close} />;
    case 'milestones':
      return <MilestonesSheet onClose={close} />;
  }
}

function Shell() {
  const { tab, overlay, overlayKey, close } = useUI();
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [tab]);

  return (
    <>
      <Monitor />
      <Banners />
      <main ref={scroller} className="flex-1 overflow-y-auto no-scrollbar">
        {tab === 'home' && <Home />}
        {tab === 'forecast' && <Forecast />}
        {tab === 'apps' && <Apps />}
        {tab === 'lab' && <Lab />}
      </main>
      <BottomNav />
      <AnimatePresence>{overlay && <OverlayView key={overlayKey} overlay={overlay} close={close} />}</AnimatePresence>
      <Toasts />
    </>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-ink sm:flex sm:items-center sm:justify-center sm:bg-[radial-gradient(60%_60%_at_50%_40%,#0c2230,#03080d)] sm:p-6">
      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg sm:h-[880px] sm:max-h-[calc(100dvh-48px)] sm:rounded-[3rem] sm:border-[10px] sm:border-[#0d1820] sm:shadow-[0_40px_120px_-30px_rgb(0_0_0/0.9),0_0_0_1px_#1c3546]">
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const profile = useProfile();
  return (
    <PhoneFrame>
      {profile ? (
        <UIProvider>
          <EngineProvider profile={profile}>
            <Shell />
          </EngineProvider>
        </UIProvider>
      ) : (
        <Onboarding />
      )}
    </PhoneFrame>
  );
}
