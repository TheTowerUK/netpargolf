# NetParGolf — Claude Optimised Context Brief (Short)

---

## APP SUMMARY

**NetParGolf** is a mobile golf scoring app focused on **real-time, on-course usability**.

Supports:
- Individual Stableford
- Matchplay
- Betterball

Core value:
→ Fast scoring, accurate handicap calculations, clean scorecard output

Platform: React Native (Expo) — iOS first (TestFlight)

Status: **MVP complete, in refinement + stabilisation phase**

---

## CORE ARCHITECTURE

- **Frontend:** React Native + Expo
- **Language:** TypeScript
- **State:** Hooks + AsyncStorage (no backend)
- **Design:** Offline-first

Key principle:
→ **All scoring logic is pure and isolated in `/core`**

---

## KEY FILES

- `/core/scoring.ts` → scoring engine (Stableford, Matchplay, Betterball)
- `/storage/roundStorage.ts` → active round lifecycle
- `/storage/roundHistoryStorage.ts` → completed rounds
- `/screens/RoundSetupScreen.tsx` → setup flow
- `/screens/LiveScoringScreen.tsx` → main gameplay UI
- `/screens/ScorecardScreen.tsx` → results display

---

## WHAT WORKS (DO NOT REBUILD)

- Full round flow:
  Setup → Live Scoring → Scorecard → History

- Handicap system:
  - Course handicap
  - Allowance %
  - Rounding modes

- Scoring engine:
  - Stableford points
  - Matchplay results
  - Betterball logic

- Persistence:
  - Save/resume round
  - Store completed rounds

---

## CURRENT FOCUS

1. Fix runtime error:
   `Cannot read property 'find' of undefined`

2. Harden round initialisation:
   - Ensure players + course always defined

3. Improve scoring UX:
   - Faster input
   - Better focus handling

4. Prepare for TestFlight beta

---

## KNOWN RISKS

- Undefined data during round start
- Player ID / mapping inconsistencies
- No backend (intentional)

---

## DESIGN PRINCIPLES

- **Speed over visuals** (used during live play)
- **Minimal taps required**
- **Editable previous holes** (no locking)
- Clean, scorecard-style UI

---

## RULES (IMPORTANT)

DO:
- Keep logic in pure functions
- Use existing architecture
- Stay offline-first

DON'T:
- Add backend
- Overcomplicate UI
- Rewrite working scoring logic

---

## CURRENT GOAL

→ Stable, crash-free round start and scoring flow
→ Ready for external TestFlight testers

---

## QUICK PROMPT FOR CLAUDE

```
I am working on NetParGolf (React Native golf scoring app).

MVP is complete. Do NOT rebuild existing features.

Task:
Fix round start error and stabilise initialisation.

Focus on:
- roundStorage
- player/course data validation

Goal:
No crashes + ready for TestFlight.
```
