import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { openDatabase } from './db/sqlite.ts';
import { initClock } from './state/clock.ts';
import { applyJudgeParam, isJudgeMode } from './state/judge.ts';

const root = createRoot(document.getElementById('root')!);

openDatabase()
  .then(() => {
    applyJudgeParam();
    initClock(isJudgeMode());
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#e6f1f5', lineHeight: 1.5 }}>
        <p style={{ fontWeight: 600, color: '#fb6079' }}>Exhale couldn’t start its on-device database.</p>
        <p style={{ color: '#87a1b1', fontSize: 14 }}>
          This usually means the browser is blocking storage or WebAssembly (some private-browsing modes do). Try a normal
          window in an up-to-date browser.
        </p>
        <p style={{ color: '#5a7586', fontSize: 12 }}>{String(err)}</p>
      </div>,
    );
  });

// Offline support and background-tab notifications. Production only, so the dev server
// never serves stale cached files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* the app works without it */
    });
  });
}
