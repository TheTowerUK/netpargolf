# Competition modes and handicap calculation

The app must calculate handicap-related values **according to competition type**. Stroke play / stableford team formats and match play team formats use different allowance and playing-handicap rules in authorized play; the product model should reflect that so scoring and UI stay correct.

## 1. Four-Ball Stroke Play / Betterball Stableford

**Also known as:** four-ball stroke play, better ball stableford, team stableford (typically “best ball” stableford per hole).

In this format, each player plays their own ball; the team score on a hole is usually derived from the **better** of the partners’ scores (subject to your exact local rule sheet). **Playing handicaps** and **allowance %** for this format are not the same as for four-ball match play under WHS. The implementation must treat this as its own mode so allowance, rounding, and any team aggregation rules stay aligned with stroke play / stableford expectations—not with match play.

## 2. Four-Ball Match Play

**Also known as:** four-ball match play, better ball match play.

Partners each play a ball; the side’s score on a hole is the **better net (or gross)** of the two, and the contest is match play (**holes won/halved**), not total strokes or stableford points. **Course / playing handicap** steps and **allowances** for four-ball match play are specified separately from four-ball stroke play under WHS. This mode must not reuse the same handicap pipeline as betterball stableford without an explicit, format-specific branch.

---

## Key requirement

`betterball` is too broad: it mixes formats that use **different handicap treatments**.

Split competition handling so each format is a **distinct** mode in the model and in any logic that derives playing handicap, strokes received, or team results.

Target discriminated union (replace the old `betterball` umbrella with explicit four-ball stroke vs four-ball match):

```ts
type RoundCompetition =
  | 'individual_stableford'
  | 'fourball_strokeplay'
  | 'fourball_matchplay'
  | 'matchplay';
```

Persisted rounds previously stored as `betterball` are loaded as `fourball_strokeplay`.

**Notes for implementers**

- **`matchplay`** — reserve for **singles** match play (or document if you use it for “generic” match play only).
- **`fourball_matchplay`** — **partners**, match play.
- **`fourball_strokeplay`** — **partners**, stroke play or betterball stableford (name can align with product copy).
- Migration: map any stored `betterball` value to the correct new enum (stroke vs match) based on prior UX or default policy, and migrate persisted rounds once.

All handicap math that depends on format (allowance %, playing handicap, allocation of strokes) should branch on `RoundCompetition` so future rule updates stay localized.
