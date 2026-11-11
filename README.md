# ReThink

A quit-vaping app for teens that predicts cravings before they hit, locks your distracting apps if you slip, and turns quitting into a game you can see working in your own lungs.

> Built for the Congressional App Challenge. Inspired by a friend of Aneeshwar's who vaped and was diagnosed with lung cancer.

This folder holds a **working web prototype** (React + TypeScript, runs on any phone browser) with the real prediction engine and on-device database, plus the **native iOS/Android lock code** in [`native/`](native/).

## Run it

Needs **Node.js 22.18 or newer** (the tests run TypeScript directly with Node's built-in type stripping; Vite 8 itself needs 20.19+). On a Mac with Homebrew: `brew install node`, then check with `node -v`.

```bash
npm ci           # install the exact versions in package-lock.json
npm run dev      # http://localhost:5173
npm test         # unit tests: engine + mic lifecycle (Node's built-in runner, no extra packages)
npm run typecheck
npm run build    # type-check + production bundle in dist/
npm run preview  # serve dist/ locally (registers the service worker, like production)
```

On first launch, choose **Explore with a demo user** to load two weeks of realistic history so the personal model has something to learn from. The demo user also turns on judge mode (below).

> The microphone needs a secure origin. `localhost` works on your computer. To test on a phone, deploy to an https URL (see **Deploying**).

### Judge mode

The **Lab** tab (sensor overrides, live equation, time machine, database browser) is a demo tool, so it's hidden from ordinary users. Turn it on by:

- choosing **Explore with a demo user**, or
- opening the app with `?judge=1` in the URL (e.g. `http://localhost:5173/?judge=1`).

For a public build, `VITE_JUDGE_MODE=off npm run build` removes judge mode entirely: no Lab, no time machine, and `?judge=1` is ignored. Turn it off with **Exit judge mode** in the Lab, or `?judge=0`. Leaving judge mode returns the app to real time and switches off sensor overrides. Outside judge mode the time machine can't run, so it can't shorten a lock. Judge mode is a demo switch, not security: anyone holding the phone can turn it on, just as they could clear the site's data.

While sensors are overridden, the gauge and nudges show the simulated values, but anything you log (a fight, a slip) is saved with the **live** readings, so simulations never become training data.

## What's inside

```
User context ──► On-device risk engine ──► Interventions
(time, stress,    (heuristic + personal     (nudge, boss fight,
 nicotine log,     logistic regression,      honesty check-in,
 location)         SQLite, no server)        OS app shield)
```

| Spec module | Where it lives |
| --- | --- |
| Feature engineering: D<sub>t</sub>, T<sub>sin/cos</sub>, S<sub>t</sub>, C<sub>t</sub>, F<sub>0</sub> | [`src/engine/features.ts`](src/engine/features.ts) |
| Cold-start clinical heuristic | [`src/engine/heuristic.ts`](src/engine/heuristic.ts) |
| On-device logistic regression, AUC | [`src/engine/logistic.ts`](src/engine/logistic.ts) |
| JITAI blending, forecast, risk windows | [`src/engine/predictor.ts`](src/engine/predictor.ts) |
| Recovery state machine, lung health | [`src/engine/recovery.ts`](src/engine/recovery.ts) |
| XP curve, streak multiplier | [`src/engine/xp.ts`](src/engine/xp.ts) |
| Boss-fight scoring and rewards | [`src/engine/fight.ts`](src/engine/fight.ts) |
| Honesty-check deadline rules | [`src/engine/checks.ts`](src/engine/checks.ts) |
| Judge mode (Lab access) | [`src/state/judge.ts`](src/state/judge.ts) |
| SQLite schema (UserProfile, CravingEvents, LockSessions + CheckIns) | [`src/db/schema.ts`](src/db/schema.ts) |
| 15-minute JITAI monitor loop | [`src/state/Monitor.tsx`](src/state/Monitor.tsx) |
| Craving Boss Fight (mic-scored 4-4-6 breathing) | [`src/overlays/BossFight.tsx`](src/overlays/BossFight.tsx) |
| iOS Screen Time lock | [`native/ios/`](native/ios/) |
| Android lock | [`native/android/`](native/android/) |

### Screens
- **Home**: lung avatar that heals in real time, vape-free clock, risk gauge, next risk window, fight / check-in / "I vaped".
- **Forecast**: 24-hour risk curve, risk windows, why the score is what it is, trigger heat map, recovery milestones, log.
- **Lock**: the accountability pact, a live countdown, earn-time-back actions, and a phone preview where tapping a locked app shows the shield.
- **Lab** (judge mode): sensor-override sliders, the live equation with real numbers, learned weights vs. the population prior, hold-out AUC, a time machine, and a SQLite table browser.

## How the prediction works

1. **Days 1–5, cold start:** P = 0.8 · P<sub>heuristic</sub> + 0.2 · P<sub>personal</sub>. The heuristic combines the nicotine withdrawal curve (scaled by dependence F<sub>0</sub>), stress, a population "when teens vape" prior, and C<sub>t</sub>.
2. **Day 6 on:** the heuristic's weight drops 0.075 a day, down to 0.2, once there are at least 8 logged cravings.
3. **Personal model:** P = σ(w₀ + w₁D + w₂T<sub>sin</sub> + w₃T<sub>cos</sub> + w₄S + w₅C), trained on the phone by gradient descent. The model is pulled toward population weights (a Gaussian prior), so a few logs nudge it instead of overfitting.
4. **Labels:** logged cravings (resisted or relapsed) are positives. Check-ins with no craving are true negatives. Randomly sampled quiet waking-hour moments are pseudo-negatives.
5. **Honest evaluation:** AUC is measured on the most recent 25% of samples, which the model never trained on (a chronological hold-out). On the demo user it usually lands around 0.8 and beats the population heuristic on most days, but not every day. The hold-out is only ~25 samples, so it's noisy. The Lab shows both numbers side by side.
6. **Interventions:** at **75%+** the app nudges you and offers a 90-second breathing fight, and nudges up to 30 minutes ahead of forecast high-risk windows. **50–75%** shows up as a "watch window" on the forecast, with no nudge. On the web these run only while the app is open or in a background tab (see **Limitations**).
7. **Honesty check-ins:** sometimes, when risk is high and the app is on screen, you get 5 minutes for a 15-second breath test. Let the deadline pass while the app is open and your apps lock, the same as logging a slip. If the deadline passes while the app is closed or in the background, the check lapses with no lock, because a web app can't reliably reach you then. Starting the test before the deadline gives you 2 minutes to finish it.

## Shot list for the CAC video (0:45–1:05)

1. Load the demo user (this turns on judge mode), then open **Lab**. Tap **Calm morning** (about 7%), then **3:10 PM, stressed** (about 80%). The gauge swings and the red **"Craving risk 80%"** banner fires. Split-screen this with `predictor.ts` in your IDE.
2. Scroll to **Live equation** and **Model**: real weights, learned vs. prior, hold-out AUC.
3. Tap **Fight**: blow into the mic, the cloud boss loses HP. Beating it (about 4 s of steady blowing on each of the 3 exhales) earns full XP; weakening it earns half; no breath detected earns none, though the craving is still logged.
4. **I vaped** → the Lock tab counts down → tap TikTok in the phone preview → shield.
5. For the real OS shield, record the native iOS build (see below) blocking an app.

## Native lock (iOS)

The web prototype simulates the shield, because browsers can't lock other apps. The real one is in `native/ios/`:

- `Exhale/AccountabilityLockManager.swift`: authorization, saving the picked apps, applying `ManagedSettingsStore.shield`, scheduling the unlock.
- `ExhaleMonitor/ExhaleMonitorExtension.swift`: a `DeviceActivityMonitor` extension that clears the shield when the cooldown ends, even if the app is closed.
- `ExhaleShield/ShieldConfigurationExtension.swift`: the custom "Nicotine reset active" shield.
- `Exhale/LockSetupView.swift`: the `FamilyActivityPicker` onboarding step.

**Setup** needs a Mac with Xcode, a real iPhone (Screen Time APIs don't run in the Simulator) and an Apple Developer account:
1. Add the **Family Controls** capability to the app and both extensions. Development builds work right away. App Store distribution requires requesting the Family Controls entitlement from Apple.
2. Add targets: *Device Activity Monitor Extension* and *Shield Configuration Extension*.
3. Add the same **App Group** (`group.app.exhale`) to all three targets.
4. Share the top of `AccountabilityLockManager.swift` (`LockShared` and the name extensions) with the Monitor target.

Corrections to the original snippet:
- Schedules shorter than **15 minutes** throw `intervalTooShort`. The manager back-dates the start so earned-back time still works near the end. Test this on your iOS version.
- Using only hour/minute components breaks a lock that crosses midnight. The manager uses full dates.
- Shields are enforced by iOS's Screen Time system, not "the kernel". They persist through force-quits and restarts.
- A shield button can only close or defer. It can't open Exhale directly.

## Native lock (Android)

`native/android/` uses an `AccessibilityService` that reacts to window changes, so it doesn't need to poll `UsageStatsManager` every 500 ms. When a locked app comes up, it sends the user home and shows `LockActivity`. For the CAC demo, sideloading is fine. For Google Play, accessibility-API use needs a policy declaration and a prominent disclosure.

## Health and accuracy notes

- **No carbon-monoxide milestone.** Vapes don't burn anything, so there's no meaningful CO to clear. That line from the original spec is replaced with nicotine clearance and the withdrawal peak.
- Recovery timelines come from smoking-cessation guidance (CDC, ACS). Vaping-specific data is still emerging, and the app says so.
- Long-term lung progress keeps half of earlier recovery after a slip, rather than resetting to zero. This avoids the "I already ruined it" spiral.
- The dependence quiz is adapted from the modified Fagerström (mFTQ) and Penn State e-cigarette dependence index. It isn't a validated clinical instrument in this form.
- The breath test checks that you're engaged; it can't detect vaping.
- Support resources on Home: text **DITCHVAPE** to **88709** (Truth Initiative's This is Quitting) or call **1-800-QUIT-NOW**.

## Privacy

Everything stays on the device: SQLite (compiled to WebAssembly), saved to IndexedDB. There is no account, no server, and no analytics. The app uses system fonts, so it makes no third-party requests. The mic is only measured for loudness and is never recorded. **Delete my data** on Home erases every stored copy, including backups, and compacts the database so deleted rows don't linger in the saved file (disabled during an active lock). Data is stored unencrypted in the browser's IndexedDB, like any website's data: anyone with access to the unlocked device and its browser profile could read it.

## Storage reliability

The database lives in memory and is saved to IndexedDB right after each change (in the next task, so one action's changes go out as one write), and again when the page is hidden or closed. Browsers don't guarantee that work started during unload finishes, so a change made in the instant before closing can still be lost; saving immediately makes that window very small. If a save fails (storage full, blocked in private browsing), a red banner says progress isn't being saved. If the saved database can't be read on startup, Exhale starts fresh and first copies the damaged snapshot to its own key (`corrupt-backup:<timestamp>`) instead of overwriting it.

**One tab at a time** ([`src/db/ownership.ts`](src/db/ownership.ts)). Each tab keeps its own copy of the database, so tabs must not share one saved copy. Every tab writes only to its own key (`snapshot:<tab id>`); an `owner` record says which snapshot is live, and only a tab opening (a "claim") changes it, copying the live snapshot to the new owner in the same transaction. The newest tab takes over and older tabs pause with a **Use Exhale here** button. A stale tab's save, even a last-moment one during unload that can't check ownership first, lands in its own key, which nothing reads, so it can't overwrite the current tab's data. Changes made in an old tab after another tab took over are discarded, not merged. After onboarding the app asks the browser for persistent storage, which makes eviction less likely but not impossible. On iOS, clearing Safari's website data deletes everything.

## Deploying

`npm run build` produces a static site in `dist/` (no server code). Any static host with https works. `vercel.json` sets long caching for hashed `/assets/*`, keeps `sw.js` fresh, and adds a few safe security headers. With the Vercel CLI: `vercel` for a preview URL, `vercel --prod` for production.

In production the app registers `public/sw.js`, a small service worker that caches the app for offline use (network-first for the page, cache-first for hashed assets) and opens the app when a notification is tapped. It isn't registered in `npm run dev`. The manifest and PNG icons (`public/icon-*.png`, `apple-touch-icon.png`) let it be added to the home screen on iOS and Android.

## Limitations (web prototype)

- **No real app locking.** Browsers can't block other apps. The Lock tab and shield are a faithful simulation; the real enforcement is the native code in `native/`, which hasn't been built or run on a device yet.
- **Notifications only while the app is alive.** With no push server, nothing can alert you once the page is fully closed. Nudges show in-app, and as system notifications while the app is in a background tab (if you allowed notifications). Honesty checks are only issued while the app is on screen, for the same reason.
- **The 15-minute monitor runs only while the app is open.** The native build would use `BGAppRefreshTask` / WorkManager.
- **The breath test checks engagement, not vaping.** Touch mode exists for accessibility and when the mic is unavailable, and it is easy to game.
- **Storage can be cleared** by the user or, rarely, by the browser.
- Automated tests cover the engine (`src/engine/`), the mic lifecycle (`src/lib/micMeter.ts`), the one-tab snapshot protocol (`src/db/ownership.ts`, as a model of IndexedDB transactions) and data wiping on real SQLite (`src/db/wipe.ts`). The IndexedDB wiring itself and the React UI were checked with scripted runs in desktop Chrome, not automated tests.
- The service worker never prunes old hashed assets, so its cache grows a little with each deploy.
- See [docs/DEVICE_TESTING.md](docs/DEVICE_TESTING.md) for what still needs a real phone.

## Next steps for the native lock

1. Decide the shell: wrap this web app with Capacitor and write a small plugin exposing `startLock / reduceLock / endLock` (reuses all the UI), or rebuild natively.
2. iOS: create the Xcode project with the app, Device Activity Monitor and Shield Configuration targets, Family Controls capability and the `group.app.exhale` App Group, then call `AccountabilityLockManager` from "I vaped" and missed check-ins. Needs a physical iPhone and an Apple Developer account.
3. Android: create the Gradle project, merge the manifest snippet in `accessibility_service_config.xml`, add the `lock_service_description` string, a screen that sends the user to Accessibility settings, and an installed-app picker that writes package names to `LockStore`.
4. Move the honesty-check and nudge scheduling to background tasks so they work with the app closed.
