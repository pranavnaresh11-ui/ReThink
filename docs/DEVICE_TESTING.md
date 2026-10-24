# Real-device test plan

Exhale is a **web app (PWA) only**. There is no Capacitor or native wrapper, and the code in `native/` has never been built, so nothing here can lock other apps. These checks cover what the web app itself promises on phones. Desktop-browser runs don't replace them: mic capture, background suspension, home-screen installs and iOS storage rules only show up on a device.

## Setup

The mic and the service worker need a **secure origin** (https, or `localhost`). Plain `http://<your-mac-ip>` works for layout checks only.

**Android Chrome (USB, no deploy needed)**

1. On the phone: Settings → About → tap *Build number* 7 times, then Developer options → *USB debugging* on. Connect by USB and accept the prompt.
2. On the Mac, from the repo:
   ```bash
   npm run build && npm run preview -- --port 4173
   ```
   and in a second terminal:
   ```bash
   adb reverse tcp:4173 tcp:4173
   ```
3. On the phone, open Chrome at `http://localhost:4173` (that's the Mac, through USB, and counts as secure).
4. For console errors: Chrome on the Mac → `chrome://inspect` → *inspect* the phone's tab.

**iOS Safari (needs https)**

Deploy a preview build you control, for example `vercel` (not `--prod`) from the repo, and open its https URL on the iPhone. For console errors: iPhone Settings → Safari → Advanced → *Web Inspector* on, then Mac Safari → Develop → *[iPhone]*.

To test the public configuration, build with `VITE_JUDGE_MODE=off npm run build` first.

## Checklist, most important first

Use a **real user** (Start my quit), not the demo user, unless a step says otherwise. "Lost" means anything you logged doesn't appear after the step.

| # | Check | Steps | Expected |
|---|---|---|---|
| 1 | Mic granted | Fight → *Start with microphone* → Allow → blow steadily on each exhale | Mic level bar moves; boss loses HP; result offers full XP when beaten |
| 2 | Mic denied | Reset the site's mic permission, Fight → mic → Don't allow | Message says access is blocked, round continues in touch mode |
| 3 | Prompt left open, then fight closed | Fight → mic → leave the prompt up, close the fight (X), then tap Allow | **No mic indicator stays on** (iOS orange dot / Android green dot disappears within a second) |
| 4 | Fight closed while audio is starting | Fight → mic (already allowed) → close immediately | Mic indicator goes off |
| 5 | Mic interrupted | Start a fight with the mic, receive a phone call or open Siri | Round switches to touch with an explanation; no crash |
| 6 | Save, then close at once | Check in → Save → immediately swipe the app/tab away → reopen | Check-in is there. (A change made in the same instant as closing can still be lost; report how often) |
| 7 | Background and resume | Log a craving → go to home screen for 5+ min → return | Data intact; clock/lock countdown correct; no "open in another tab" screen |
| 8 | Home-screen install | Android: menu → *Install app*. iOS: Share → *Add to Home Screen* | Exhale icon (lungs on dark navy), opens full-screen, nothing under the notch or home bar |
| 9 | Installed app + browser tab together | Open the installed app and a browser tab at the same URL | Android: whichever opened last works, the other shows *Exhale is open in another tab*. iOS: the installed app has **separate storage** from Safari, so each has its own data (expected, worth noting) |
| 10 | Offline start | After one online visit, turn on airplane mode, open the app | App starts with your data; nothing says it's broken |
| 11 | Honesty check while away | Lab (demo user) → *Trigger honesty check-in* → leave the app before 90 s → return after | "ran out while Exhale was closed", no lock |
| 12 | Delete my data | Home → Delete my data → confirm → close and reopen | Onboarding; nothing from before is visible |
| 13 | Reduce motion | Turn on the OS reduce-motion setting, open sheets and the fight | No sliding/scaling animations |
| 14 | Screen reader | VoiceOver / TalkBack through onboarding chips and the check-in sheet | Chips announce selected/not selected; sheets announce as dialogs |

Checks 3–5 matter most for privacy, 6–10 for data trust. Record the device, OS and browser version for each.

## What these checks can't show

- **App locking:** browsers can't block other apps. The Lock tab is a simulation; enforcement needs the native iOS (Screen Time) or Android (Accessibility service) work in `native/`.
- **Notifications with the app closed:** there's no push server, so nudges only appear while the app is open or in a background tab.
