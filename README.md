# Exhale

A quit-vaping app for teens that predicts cravings before they hit, locks your distracting apps if you slip, and turns quitting into a game you can see working in your own lungs.

> Built for the Congressional App Challenge. Inspired by a friend of Aneeshwar's who vaped and was diagnosed with lung cancer.

This folder holds a **working web prototype** (React + TypeScript, runs on any phone browser) with the real prediction engine and on-device database, plus the **native iOS/Android lock code** in [`native/`](native/).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests (Node's built-in runner)
npm run build    # production bundle in dist/
```

On first launch, choose **Explore with a demo user** to load two weeks of realistic history so the personal model has something to learn from.

> The microphone needs a secure origin. `localhost` works on your computer. To test on a phone, deploy (e.g. `vercel`) and open the https URL.

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
6. **Interventions:** at **75%+** the app nudges you and offers a 90-second breathing fight, and pushes 30 minutes ahead of forecast high-risk windows. **50–75%** shows up as a "watch window" on the forecast, with no push.

## Shot list for the CAC video (0:45–1:05)

1. Open **Lab**. Tap **Calm morning** (about 7%), then **3:10 PM, stressed** (about 80%). The gauge swings and the red **"Craving risk 80%"** banner fires. Split-screen this with `predictor.ts` in your IDE.
2. Scroll to **Live equation** and **Model**: real weights, learned vs. prior, hold-out AUC.
3. Tap **Fight**: blow into the mic, the cloud boss loses HP, claim XP.
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

Everything stays on the device: SQLite (compiled to WebAssembly), saved to IndexedDB. There is no account, no server, and no analytics. The mic is only measured for loudness and is never recorded.
