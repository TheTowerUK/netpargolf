// src/screens/HelpPracticeScreen.tsx
// Expo React Native — Help / Practice mode (Option A)
// Drop-in screen that teaches strokes received + net vs par points.
// Assumes you already added src/core/scoring.ts and (optionally) src/core/helpText.ts.

import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';

import { scoreHoleOptionA, type RoundingMode } from '../core/scoring';
import { explainPoints, explainStrokesReceived, formatAllowance } from '../core/helpText';

type NumField = string; // keep as string for TextInput

export default function HelpPracticeScreen() {
  // Inputs (string UI fields)
  const [courseHandicap, setCourseHandicap] = useState<NumField>('18');
  const [allowancePercent, setAllowancePercent] = useState<NumField>('100'); // entered as %
  const [par, setPar] = useState<NumField>('4');
  const [strokeIndex, setStrokeIndex] = useState<NumField>('12');
  const [gross, setGross] = useState<NumField>('6');

  // Mode toggles
  const [hideWorking, setHideWorking] = useState(false); // "Confidence mode"
  const [showAnswer, setShowAnswer] = useState(!hideWorking);

  // Quiz guess (only used when hideWorking = true)
  const [guessedPoints, setGuessedPoints] = useState<NumField>('1');

  const [roundingMode, setRoundingMode] = useState<RoundingMode>('nearest');

  // Parse helpers
  const parsed = useMemo(() => {
    const ch = parseInt(courseHandicap.trim(), 10);
    const pct = parseFloat(allowancePercent.trim()); // as percent, e.g. 95
    const p = parseInt(par.trim(), 10);
    const si = parseInt(strokeIndex.trim(), 10);
    const g = parseInt(gross.trim(), 10);

    return {
      ch,
      allowance: Number.isFinite(pct) ? pct / 100 : NaN,
      par: p,
      si,
      gross: g,
    };
  }, [courseHandicap, allowancePercent, par, strokeIndex, gross]);

  const breakdown = useMemo(() => {
    try {
      if (
        !Number.isFinite(parsed.ch) ||
        !Number.isFinite(parsed.allowance) ||
        !Number.isFinite(parsed.par) ||
        !Number.isFinite(parsed.si) ||
        !Number.isFinite(parsed.gross)
      ) {
        return null;
      }

      return scoreHoleOptionA({
        courseHandicap: parsed.ch,
        allowancePercent: parsed.allowance,
        roundingMode,
        hole: { par: parsed.par, strokeIndex: parsed.si },
        gross: parsed.gross,
      });
    } catch {
      return null;
    }
  }, [parsed, roundingMode]);

  const validateAndNudge = () => {
    // Friendly validation to reduce confusion
    if (!Number.isFinite(parsed.ch)) return 'Course handicap must be a number.';
    if (parsed.ch < 0 || parsed.ch > 54) return 'Course handicap looks unusual (0–54 typical).';
    if (!Number.isFinite(parsed.allowance) || parsed.allowance <= 0 || parsed.allowance > 1.2)
      return 'Allowance must be a percent like 90, 95, 100.';
    if (!Number.isFinite(parsed.par) || parsed.par < 3 || parsed.par > 5)
      return 'Par should usually be 3, 4, or 5.';
    if (!Number.isFinite(parsed.si) || parsed.si < 1 || parsed.si > 18)
      return 'Stroke Index must be 1–18.';
    if (!Number.isFinite(parsed.gross) || parsed.gross < 1 || parsed.gross > 20)
      return 'Gross strokes should be a reasonable number (1–20).';
    return null;
  };

  const onReveal = () => setShowAnswer(true);
  const onReset = () => {
    setCourseHandicap('18');
    setAllowancePercent('100');
    setPar('4');
    setStrokeIndex('12');
    setGross('6');
    setGuessedPoints('1');
    setRoundingMode('nearest');
    setShowAnswer(!hideWorking);
  };

  const onToggleHideWorking = (v: boolean) => {
    setHideWorking(v);
    setShowAnswer(!v); // if hiding, default to hidden; if showing, default to revealed
  };

  const onCheckGuess = () => {
    if (!breakdown) {
      const msg = validateAndNudge() ?? 'Please check your inputs.';
      Alert.alert('Cannot score', msg);
      return;
    }

    const guess = parseInt(guessedPoints.trim(), 10);
    if (!Number.isFinite(guess) || guess < 0 || guess > 4) {
      Alert.alert('Invalid guess', 'Guess points between 0 and 4.');
      return;
    }

    if (guess === breakdown.points) {
      Alert.alert('Correct ✅', `You got it right: ${breakdown.points} point(s).`);
    } else {
      Alert.alert('Not quite', `Correct answer is ${breakdown.points} point(s). Tap Reveal to see why.`);
    }
  };

  const warning = useMemo(() => validateAndNudge(), [parsed]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Help / Practice</Text>
        <Text style={styles.subTitle}>
          Learn how strokes and net points work. Enter a hole and a gross score, then see the
          step-by-step result.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Inputs</Text>

          <View style={styles.row}>
            <Field
              label="Course Handicap"
              value={courseHandicap}
              onChangeText={setCourseHandicap}
              keyboardType="number-pad"
              hint="e.g. 18"
            />
            <Field
              label="Allowance %"
              value={allowancePercent}
              onChangeText={setAllowancePercent}
              keyboardType="decimal-pad"
              hint="e.g. 90 / 95 / 100"
            />
          </View>

          <View style={styles.row}>
            <Field
              label="Hole Par"
              value={par}
              onChangeText={setPar}
              keyboardType="number-pad"
              hint="3–5"
            />
            <Field
              label="Stroke Index (SI)"
              value={strokeIndex}
              onChangeText={setStrokeIndex}
              keyboardType="number-pad"
              hint="1–18"
            />
          </View>

          <View style={styles.row}>
            <Field
              label="Gross Strokes"
              value={gross}
              onChangeText={setGross}
              keyboardType="number-pad"
              hint="strokes taken"
            />
            <View style={styles.field}>
              <Text style={styles.label}>Rounding</Text>
              <View style={styles.pills}>
                <Pill text="Nearest" active={roundingMode === 'nearest'} onPress={() => setRoundingMode('nearest')} />
                <Pill text="Floor" active={roundingMode === 'floor'} onPress={() => setRoundingMode('floor')} />
                <Pill text="Ceil" active={roundingMode === 'ceil'} onPress={() => setRoundingMode('ceil')} />
              </View>
              <Text style={styles.hint}>Applied to handicap × allowance.</Text>
            </View>
          </View>

          {warning ? <Text style={styles.warning}>{warning}</Text> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Confidence Mode</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Hide working</Text>
              <Switch value={hideWorking} onValueChange={onToggleHideWorking} />
            </View>
          </View>

          {hideWorking ? (
            <>
              <Text style={styles.quizText}>
                Enter your guess (0–4) and check it. Then reveal the working if needed.
              </Text>
              <View style={styles.row}>
                <Field
                  label="Your guess (points)"
                  value={guessedPoints}
                  onChangeText={setGuessedPoints}
                  keyboardType="number-pad"
                  hint="0–4"
                />
                <View style={styles.field}>
                  <Text style={styles.label}>&nbsp;</Text>
                  <Pressable style={styles.primaryBtn} onPress={onCheckGuess}>
                    <Text style={styles.primaryBtnText}>Check</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryBtn} onPress={onReveal}>
                    <Text style={styles.secondaryBtnText}>Reveal</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.quizText}>
              Turn on "Hide working" to quiz yourself and build confidence.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Result</Text>

          {!breakdown ? (
            <Text style={styles.muted}>
              Enter valid inputs above to see the scoring breakdown.
            </Text>
          ) : (
            <>
              {/* Always show the headline answer if not hiding; or if revealed in quiz mode */}
              {(!hideWorking || showAnswer) && (
                <View style={styles.resultTop}>
                  <Text style={styles.bigPoints}>{breakdown.points}</Text>
                  <Text style={styles.bigPointsLabel}>points</Text>
                  <Text style={styles.resultSummary}>
                    Net {breakdown.net} vs Par {breakdown.par} ({formatDiff(breakdown.netVsPar)})
                  </Text>
                </View>
              )}

              {/* In hide-working mode but not revealed, only show minimal prompt */}
              {hideWorking && !showAnswer ? (
                <Text style={styles.muted}>
                  Answer hidden. Tap "Reveal" to see points and working.
                </Text>
              ) : (
                <View style={styles.breakdown}>
                  <RowLine label="Course handicap" value={`${breakdown.courseHandicap}`} />
                  <RowLine
                    label="Allowance"
                    value={`${formatAllowance(breakdown.allowancePercent)}  (raw: ${breakdown.adjustedHandicapRaw.toFixed(1)})`}
                  />
                  <RowLine label="Adjusted handicap" value={`${breakdown.adjustedHandicap}`} />
                  <RowLine label="Stroke Index (SI)" value={`${breakdown.strokeIndex}`} />
                  <RowLine label="Strokes received" value={`${breakdown.strokesReceivedOnHole}`} />
                  <Text style={styles.explain}>
                    {explainStrokesReceived(
                      breakdown.adjustedHandicap,
                      breakdown.strokeIndex,
                      breakdown.strokesReceivedOnHole
                    )}
                  </Text>

                  <RowLine label="Gross score" value={`${breakdown.gross}`} />
                  <RowLine label="Net score" value={`${breakdown.net}`} />
                  <RowLine label="Par" value={`${breakdown.par}`} />
                  <RowLine label="Net vs Par" value={`${formatDiff(breakdown.netVsPar)}`} />
                  <Text style={styles.explain}>{explainPoints(breakdown.net, breakdown.par, breakdown.points)}</Text>
                </View>
              )}
            </>
          )}

          <View style={styles.actionsRow}>
            <Pressable style={styles.secondaryBtnWide} onPress={onReset}>
              <Text style={styles.secondaryBtnText}>Reset Example</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.footerMuted}>
          Tip: Most confusion comes from strokes received. Focus on SI and adjusted handicap first.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function formatDiff(netVsPar: number) {
  if (netVsPar === 0) return 'E';
  if (netVsPar > 0) return `+${netVsPar}`;
  return `${netVsPar}`;
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType ?? 'default'}
        style={styles.input}
        placeholder={props.hint}
        placeholderTextColor="#999"
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

function Pill({ text, active, onPress }: { text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}>
      <Text style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 14,
    color: '#444',
    marginBottom: 14,
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e7e7e7',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  switchLabel: {
    fontSize: 13,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    flex: 1,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    color: '#333',
    marginBottom: 6,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  hint: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  warning: {
    marginTop: 6,
    color: '#b45309',
    fontSize: 12,
    fontWeight: '700',
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillActive: {
    borderColor: '#111',
    backgroundColor: '#111',
  },
  pillInactive: {
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  pillTextActive: {
    color: '#fff',
  },
  pillTextInactive: {
    color: '#111',
  },
  quizText: {
    marginTop: 6,
    marginBottom: 10,
    color: '#444',
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#111',
    marginBottom: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f3f3f3',
  },
  secondaryBtnWide: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f3f3f3',
    flex: 1,
  },
  secondaryBtnText: {
    color: '#111',
    fontWeight: '800',
    fontSize: 14,
  },
  resultTop: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 10,
  },
  bigPoints: {
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: -1,
  },
  bigPointsLabel: {
    marginTop: -8,
    fontSize: 14,
    fontWeight: '800',
    color: '#111',
  },
  resultSummary: {
    marginTop: 6,
    fontSize: 13,
    color: '#444',
  },
  breakdown: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  lineLabel: {
    color: '#444',
    fontSize: 13,
    flex: 1,
  },
  lineValue: {
    color: '#111',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  explain: {
    marginTop: -2,
    marginBottom: 10,
    fontSize: 12,
    color: '#555',
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  muted: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
  footerMuted: {
    marginTop: 6,
    color: '#777',
    fontSize: 12,
    textAlign: 'center',
  },
});
