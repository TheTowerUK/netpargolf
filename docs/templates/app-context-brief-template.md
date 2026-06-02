# APP CONTEXT BRIEF
### Claude.ai Project Continuity Document
*Paste this at the start of any new Claude.ai conversation, or store in a Claude.ai Project for automatic context.*

---

## 1. APP IDENTITY

**App Name:**
> e.g. Pitch & Dice

**One-Line Description:**
> What does the app do, for whom, and why does it matter?

**Platform Target:**
> iOS / Android / Both / Web / Cross-platform

**Current Status:**
> e.g. Phase 1 MVP built — core loop working, UI needs polish

---

## 2. TECH STACK

**Framework:**
> e.g. React Native + Expo / Flutter / Swift / Kotlin

**Language:**
> e.g. JavaScript / TypeScript / Swift / Dart

**State Management:**
> e.g. useState / Redux / Zustand / Context API / None yet

**Backend / Database:**
> e.g. Firebase / Supabase / No backend yet / Local state only

**Key Libraries / Dependencies:**
> List any non-standard packages the project relies on
> e.g. react-navigation, expo-av, react-native-reanimated

**Repo Location:**
> e.g. GitHub — github.com/username/repo-name

**Branch Strategy:**
> e.g. main = stable, dev = active development

---

## 3. PROJECT STRUCTURE

**Root Folder Layout:**
```
/ (describe your top-level folders)
e.g.
/src
  /components
  /screens
  /engine
  /assets
/App.js
```

**Key Files to Know:**
> List the most important files and what they do
> e.g. /src/engine/diceEngine.js — core dice roll and outcome logic

---

## 4. WHAT HAS BEEN BUILT

*List completed features or phases — be specific so Claude knows what NOT to rebuild*

- [ ] Feature / Phase 1 name — brief description
- [ ] Feature / Phase 2 name — brief description
- [ ] Feature / Phase 3 name — brief description

**Last Thing Completed:**
> e.g. Wicket sub-roll modal and innings end flow

---

## 5. CURRENT TASK / NEXT STEP

**What I Need Help With Right Now:**
> Be specific — the more precise this is, the better the output
> e.g. "Convert the Phase 1 HTML dice engine into a React Native Expo component"

**Relevant Code to Review:**
> Paste any existing code snippets that are directly relevant to this task
> (You don't need to paste the whole codebase — just the relevant parts)

```javascript
// Paste relevant code here
```

**Expected Output:**
> What does "done" look like for this session?
> e.g. A working DiceEngine.js file I can drop into /src/engine/

---

## 6. KNOWN ISSUES / BLOCKERS

*List anything broken, incomplete, or decisions that haven't been made yet*

- Issue 1 — description
- Issue 2 — description

---

## 7. DESIGN & STYLE GUIDE

**Visual Style:**
> e.g. Dark theme, cricket scoreboard aesthetic, Bebas Neue font, gold (#d4a017) as primary accent

**Tone / Feel:**
> e.g. Strategic tabletop game — serious but accessible, not cartoonish

**Component Conventions:**
> e.g. All components are functional, no class components
> e.g. Styles use StyleSheet.create, no inline styles

**Naming Conventions:**
> e.g. camelCase for variables, PascalCase for components, UPPER_SNAKE for constants

---

## 8. CONSTRAINTS & DECISIONS

*Things Claude should know to avoid going in the wrong direction*

- **DO:** e.g. Keep all game logic in pure JS functions — no framework dependencies
- **DO:** e.g. Use Expo-compatible libraries only
- **DON'T:** e.g. Don't use class components
- **DON'T:** e.g. Don't add a backend yet — local state only for now
- **DECIDED:** e.g. T20, ODI, and Test formats will all be supported from Phase 2

---

## 9. MONETISATION & DEPLOYMENT PLAN

**Business Model:**
> e.g. Paid app (£2.99) / Freemium / Ad-supported / Not decided yet

**Target Release:**
> e.g. iOS App Store + Google Play / Internal TestFlight only for now

**App Store Accounts:**
> e.g. Apple Developer account active / Google Play Console pending

---

## 10. SESSION LOG
*Update this after each development session so the brief stays current*

| Date | What Was Done | Next Action |
|---|---|---|
| DD/MM/YYYY | Description of work completed | What to tackle next session |
| | | |
| | | |

---

## QUICK-START PROMPT
*Copy and paste this at the top of any new Claude.ai chat, filling in the blanks:*

```
I am continuing development on [APP NAME]. 
Here is my full context brief: [paste brief above]

Today's task: [specific thing you need]
Here is the relevant existing code: [paste snippet if needed]
```

---

*Template v1.0 — Update the Session Log after every development session to keep this brief current.*
