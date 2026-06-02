# NetParGolf — App Context Brief (Claude.ai Ready)

---

## 1. APP IDENTITY

**App Name:**  
NetParGolf

**One-Line Description:**  
A mobile golf scoring and analytics app designed for real-time on-course play, supporting Stableford, Matchplay, and Betterball formats with dynamic handicap calculations and post-round insights.

**Platform Target:**  
iOS (primary via TestFlight) → Android (planned) → Cross-platform (Expo)

**Current Status:**  
Phase 1 MVP complete — full round setup + live scoring + scorecard + round history working. Currently in active refinement and TestFlight preparation.

---

## 2. TECH STACK

**Framework:**  
React Native + Expo

**Language:**  
TypeScript

**State Management:**  
React hooks + local component state  
AsyncStorage for persistence

**Backend / Database:**  
No backend (local-first architecture using AsyncStorage)

**Key Libraries / Dependencies:**
- @react-navigation/native
- @react-navigation/native-stack
- @react-native-async-storage/async-storage
- expo
- expo-haptics
- expo-sharing (future)

**Repo Location:**  
GitHub — NetParGolf (TheTowerUK)

**Branch Strategy:**
- main → stable
- feature branches → active work
- tagged recovery points

---

## 3. PROJECT STRUCTURE

```
/src
  /core
  /screens
  /storage
  /navigations
  /utils
  /theme
```

**Key Files:**
- `/src/core/scoring.ts` — scoring engine
- `/src/storage/roundStorage.ts` — current round persistence
- `/src/storage/roundHistoryStorage.ts` — historical rounds
- `/src/screens/RoundSetupScreen.tsx` — setup flow
- `/src/screens/LiveScoringScreen.tsx` — scoring UI
- `/src/screens/ScorecardScreen.tsx` — scorecard view
- `/src/storage/courseStorage.ts` — course data

---

## 4. WHAT HAS BEEN BUILT

- Round setup (players, handicaps, formats)
- Live scoring (hole-by-hole input)
- Stableford / Matchplay / Betterball scoring logic
- Course integration (Par + Stroke Index)
- Scorecard screen (print-style)
- Round persistence (save/load/complete)
- Round history
- UX improvements (large hole indicator, fast entry)

**Last Completed:**  
Full round lifecycle (Setup → Scoring → Scorecard → History)

---

## 5. CURRENT TASK

**Focus:**
- Fix runtime error: `Cannot read property 'find' of undefined`
- Improve scoring UX speed
- Prepare for TestFlight

**Goal:**  
Stable, crash-free round flow ready for beta testing

---

## 6. KNOWN ISSUES

- Undefined `.find()` error on round start
- Potential missing player/course data
- UX improvements needed for faster scoring
- No cloud sync

---

## 7. DESIGN & STYLE GUIDE

**Style:**  
Clean, minimal golf UI (scorecard-inspired)

**Tone:**  
Fast, practical, on-course usability

**Conventions:**
- Functional components only
- Hooks-based logic
- StyleSheet.create

---

## 8. CONSTRAINTS & DECISIONS

- Keep scoring logic pure (core layer)
- Offline-first
- No backend yet
- No locked holes (editable scoring)

---

## 9. MONETISATION & DEPLOYMENT

**Model:**  
TBD (likely freemium)

**Release:**  
TestFlight → App Store

---

## 10. SESSION LOG

| Date | Work Done | Next |
|------|----------|------|
| Feb 2026 | Core scoring + live scoring | Scorecard |
| Feb 2026 | Scorecard + persistence | UX polish |
| Mar 2026 | Setup + simplified UX | Fix errors |
| Mar 2026 | Full round lifecycle | TestFlight prep |

---

## QUICK START PROMPT

```
I am continuing development on NetParGolf.

Here is my full context brief:
[PASTE]

Today's task:
Fix round start error and improve stability.
```
