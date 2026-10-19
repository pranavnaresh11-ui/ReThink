import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { openDatabase } from './db/sqlite.ts';
import { initClock } from './state/clock.ts';

const root = createRoot(document.getElementById('root')!);

openDatabase()
  .then(() => {
    initClock();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    root.render(
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#fb6079' }}>
        Couldn’t open the on-device database. {String(err)}
      </div>,
    );
  });
