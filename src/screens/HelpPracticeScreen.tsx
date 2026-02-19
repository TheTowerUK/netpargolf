import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Animated,
  Easing,
  PanResponder,
  AccessibilityInfo,
} from 'react-native';

import { colors as theme } from '../theme/colors';
import { hapticTap, hapticLight } from '../utils/feedback';

type TabKey = 'stableford' | 'matchplay';

type StablefordRow = {
  label: string;
  points: number;
  hint: string;
};

function stablefordPointsForScoreVsPar(delta: number) {
  // delta = (score - par)
  // -2 eagle, -1 birdie, 0 par, +1 bogey, +2 double bogey, etc.
  if (delta <= -3) return 5; // albatross or better
  if (delta === -2) return 4; // eagle
  if (delta === -1) return 3; // birdie
  if (delta === 0) return 2; // par
  if (delta === 1) return 1; // bogey
  return 0; // double bogey or worse
}

function formatDelta(delta: number) {
  if (delta === 0) return 'Par';
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

export default function HelpPracticeScreen() {
  const [tab, setTab] = useState<TabKey>('stableford');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => sub?.remove?.();
  }, []);

  // Mini-sim state (Stableford)
  const [simPar, setSimPar] = useState<3 | 4 | 5>(4);
  const [simScore, setSimScore] = useState<number>(5);

  const simDelta = simScore - simPar;
  const simPoints = stablefordPointsForScoreVsPar(simDelta);

  const stablefordRows: StablefordRow[] = useMemo(
    () => [
      { label: 'Double bogey or worse', points: 0, hint: '0 points' },
      { label: 'Bogey', points: 1, hint: '1 point' },
      { label: 'Par', points: 2, hint: '2 points' },
      { label: 'Birdie', points: 3, hint: '3 points' },
      { label: 'Eagle', points: 4, hint: '4 points' },
      { label: 'Albatross (or better)', points: 5, hint: '5 points' },
    ],
    []
  );

  // Match play demo (interactive)
  const mpSteps = useMemo(
    () => [
      { hole: 1, a: 4, b: 5, label: 'A wins', delta: -1 },
      { hole: 2, a: 4, b: 4, label: 'Halved', delta: 0 },
      { hole: 3, a: 5, b: 4, label: 'B wins', delta: +1 },
      { hole: 4, a: 3, b: 4, label: 'A wins', delta: -1 },
    ],
    []
  );

  const [mpIdx, setMpIdx] = useState(0);

  const mpValue = useMemo(() => {
    let v = 0;
    for (let i = 0; i <= mpIdx; i++) v += mpSteps[i].delta;
    return Math.max(-3, Math.min(3, v));
  }, [mpIdx, mpSteps]);

  const mpStatusText = useMemo(() => {
    if (mpValue === 0) return 'All Square';
    if (mpValue < 0) return `${Math.abs(mpValue)} Up (A leading)`;
    return `${mpValue} Up (B leading)`;
  }, [mpValue]);

  const mpStepText = useMemo(() => {
    const s = mpSteps[mpIdx];
    return `Hole ${s.hole} · ${s.label}`;
  }, [mpIdx, mpSteps]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Help / Practice</Text>
        <Text style={styles.subtitle}>
          Quick guides for the most common golf formats.
        </Text>

        <SegmentedTabs tab={tab} onChange={setTab} />

        {tab === 'stableford' ? (
          <>
            <SectionTitle
              title="Stableford"
              subtitle="Score points on each hole based on your result vs par."
            />

            <Card>
              <Text style={styles.body}>
                Stableford is a points-based format. Instead of adding up strokes
                for the whole round, you earn points per hole:
              </Text>

              <Spacer h={10} />

              <PointsTable rows={stablefordRows} />

              <Spacer h={12} />

              <Text style={styles.note}>
                Tip: If you can't score a point on a hole, you can pick up —
                it's faster and keeps the round moving.
              </Text>
            </Card>

            <Spacer h={12} />

            <Card>
              <Text style={styles.h3}>Example hole</Text>
              <Text style={styles.body}>
                Hole 5 is a <Text style={styles.bold}>Par 4</Text>. Here's how
                points work:
              </Text>

              <Spacer h={10} />

              <ExampleTableStableford />
            </Card>

            <Spacer h={12} />

            <Card>
              <Text style={styles.h3}>Try an example (mini-sim)</Text>
              <Text style={styles.body}>
                Choose a par and a score — see the points instantly.
              </Text>

              <Spacer h={12} />

              <Row>
                <Text style={styles.label}>Par</Text>
                <PillGroup
                  options={[
                    { key: '3', label: '3' },
                    { key: '4', label: '4' },
                    { key: '5', label: '5' },
                  ]}
                  value={String(simPar)}
                  onChange={(k) => {
                    const p = Number(k) as 3 | 4 | 5;
                    setSimPar(p);
                    // keep score sensible
                    setSimScore((s) => Math.max(1, Math.min(12, s)));
                  }}
                />
              </Row>

              <Spacer h={10} />

              <Row>
                <Text style={styles.label}>Score</Text>
                <Stepper
                  value={simScore}
                  min={1}
                  max={12}
                  onChange={setSimScore}
                />
              </Row>

              <Spacer h={12} />

              <StablefordPointsLadder activePoints={simPoints} reduceMotion={reduceMotion} />

              <Spacer h={12} />

              <View style={styles.resultBox}>
                <Text style={styles.resultLine}>
                  Result vs par:{' '}
                  <Text style={styles.bold}>{formatDelta(simDelta)}</Text>
                </Text>
                <Text style={styles.resultLine}>
                  Stableford points:{' '}
                  <Text
                    style={[
                      styles.bold,
                      simPoints >= 2
                        ? styles.good
                        : simPoints === 1
                        ? styles.warn
                        : styles.bad,
                    ]}
                  >
                    {simPoints}
                  </Text>
                </Text>
              </View>

              <Spacer h={8} />

              <Text style={styles.note}>
                This mirrors the core Stableford scoring the app simulates.
              </Text>
            </Card>

            <Spacer h={12} />
            <NetVsGrossCard />

            <Spacer h={18} />
          </>
        ) : (
          <>
            <SectionTitle
              title="Match Play"
              subtitle="Compete hole-by-hole: win, lose, or halve each hole."
            />

            <Card>
              <Text style={styles.body}>
                In Match Play, you don't add total strokes for the round.
                Instead, each hole is a mini-match:
              </Text>

              <Spacer h={10} />

              <Bullet text="Win the hole → go 1 Up" />
              <Bullet text="Lose the hole → go 1 Down" />
              <Bullet text="Same score → hole halved (no change)" />

              <Spacer h={12} />

              <Text style={styles.note}>
                Example status: <Text style={styles.bold}>2 Up</Text> means you
                are winning by 2 holes.{' '}
                <Text style={styles.bold}>All Square</Text> means tied.
              </Text>
            </Card>

            <Spacer h={12} />

            <Card>
              <Text style={styles.h3}>Example sequence</Text>
              <Text style={styles.body}>
                Player A vs Player B:
              </Text>

              <Spacer h={10} />

              <MatchPlaySwingMeter
                value={mpValue}
                reduceMotion={reduceMotion}
                statusText={mpStatusText}
                stepText={mpStepText}
                canPrev={mpIdx > 0}
                canNext={mpIdx < mpSteps.length - 1}
                onPrev={() => {
                  hapticTap();
                  setMpIdx((v) => Math.max(0, v - 1));
                }}
                onNext={() => {
                  hapticTap();
                  setMpIdx((v) => Math.min(mpSteps.length - 1, v + 1));
                }}
              />

              <Spacer h={12} />

              <ExampleTableMatchPlay
                rows={mpSteps}
                reduceMotion={reduceMotion}
                selectedIndex={mpIdx}
                onSelectIndex={setMpIdx}
              />
            </Card>

            <Spacer h={12} />

            <Card>
              <Text style={styles.h3}>When does a match end?</Text>
              <Text style={styles.body}>
                A match ends when a player is more holes up than remain to play.
              </Text>

              <Spacer h={10} />

              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>"Won 3 & 2"</Text>
                <Text style={styles.body}>
                  Means the winner was{' '}
                  <Text style={styles.bold}>3 holes up</Text> with{' '}
                  <Text style={styles.bold}>2 holes left</Text> — so the match
                  finished early.
                </Text>
              </View>

              <Spacer h={10} />

              <Text style={styles.note}>
                If it's "1 Up" standing on the 18th tee, the match can go the
                full distance.
              </Text>
            </Card>

            <Spacer h={12} />
            <NetVsGrossCard />

            <Spacer h={18} />
          </>
        )}

        <FooterNote />
      </ScrollView>
    </View>
  );
}

/* ----------------------------- UI Components ----------------------------- */

function SegmentedTabs({
  tab,
  onChange,
}: {
  tab: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <View style={styles.segmented}>
      <SegTab
        label="Stableford"
        active={tab === 'stableford'}
        onPress={() => onChange('stableford')}
      />
      <SegTab
        label="Match Play"
        active={tab === 'matchplay'}
        onPress={() => onChange('matchplay')}
      />
    </View>
  );
}

function SegTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.segTab, active && styles.segTabActive, pressed && styles.btnPressed]}
    >
      <Text style={[styles.segTabText, active && styles.segTabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Spacer({ h }: { h: number }) {
  return <View style={{ height: h }} />;
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function PointsTable({ rows }: { rows: StablefordRow[] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.th, { flex: 1 }]}>Score vs par</Text>
        <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Points</Text>
      </View>

      {rows.map((r) => (
        <View key={r.label} style={styles.tableRow}>
          <Text style={[styles.td, { flex: 1 }]} allowFontScaling maxFontSizeMultiplier={2.0} numberOfLines={2}>{r.label}</Text>
          <Text style={[styles.td, { width: 80, textAlign: 'right' }]}>
            {r.points}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PillGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View style={styles.pillGroup}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && styles.btnPressed]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => {
          hapticLight();
          onChange(Math.max(min, value - 1));
        }}
        style={({ pressed }) => [styles.stepBtn, pressed && styles.btnPressed]}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>

      <View style={styles.stepValue}>
        <Text style={styles.stepValueText}>{value}</Text>
      </View>

      <Pressable
        onPress={() => {
          hapticLight();
          onChange(Math.min(max, value + 1));
        }}
        style={({ pressed }) => [styles.stepBtn, pressed && styles.btnPressed]}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------ Examples ------------------------------ */

function ExampleTableStableford() {
  // Hard-coded example: Par 4
  const rows = [
    { score: 6, label: 'Double bogey', points: 0 },
    { score: 5, label: 'Bogey', points: 1 },
    { score: 4, label: 'Par', points: 2 },
    { score: 3, label: 'Birdie', points: 3 },
  ];

  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.th, { width: 70 }]}>Score</Text>
        <Text style={[styles.th, { flex: 1 }]}>Result</Text>
        <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Points</Text>
      </View>

      {rows.map((r) => (
        <View key={r.score} style={styles.tableRow}>
          <Text style={[styles.td, { width: 70 }]}>{r.score}</Text>
          <Text style={[styles.td, { flex: 1 }]} allowFontScaling maxFontSizeMultiplier={2.0} numberOfLines={2}>{r.label}</Text>
          <Text style={[styles.td, { width: 80, textAlign: 'right' }]}>
            {r.points}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ExampleTableMatchPlay({
  rows,
  selectedIndex,
  onSelectIndex,
  reduceMotion = false,
}: {
  rows: Array<{ hole: number; a: number; b: number; label: string; delta: number }>;
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  reduceMotion?: boolean;
}) {
  const rowResult = (idx: number) => {
    let v = 0;
    for (let i = 0; i <= idx; i++) v += rows[i].delta;
    v = Math.max(-3, Math.min(3, v));
    if (v === 0) return 'All Square';
    if (v < 0) return `${Math.abs(v)} Up (A)`;
    return `${v} Up (B)`;
  };

  // --- Pulse animation for active row ---
  const AnimatedPressable = useMemo(
    () => Animated.createAnimatedComponent(Pressable),
    []
  );

  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    pulse.setValue(0);
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [selectedIndex, pulse, reduceMotion]);

  const activeScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  });

  const activeOverlayOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.18],
  });

  // --- Scrub gesture (drag up/down to change selected hole) ---
  const ROW_H = 44;

  const startIndexRef = React.useRef(selectedIndex);
  React.useEffect(() => {
    startIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  const lastScrubIndexRef = React.useRef<number>(selectedIndex);

  const clampIndex = (i: number) => Math.max(0, Math.min(rows.length - 1, i));

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, g) => {
          return Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx);
        },
        onPanResponderGrant: () => {
          startIndexRef.current = selectedIndex;
          lastScrubIndexRef.current = selectedIndex;
        },
        onPanResponderMove: (_evt, g) => {
          const deltaRows = Math.round(g.dy / ROW_H);
          const next = clampIndex(startIndexRef.current + deltaRows);

          if (next !== lastScrubIndexRef.current) {
            lastScrubIndexRef.current = next;
            hapticTap();
            onSelectIndex(next);
          }
        },
        onPanResponderTerminationRequest: () => true,
        onPanResponderRelease: () => {},
        onPanResponderTerminate: () => {},
      }),
    [rows.length, selectedIndex, onSelectIndex]
  );

  return (
    <View style={styles.table} {...panResponder.panHandlers}>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.th, { width: 55 }]}>Hole</Text>
        <Text style={[styles.th, { width: 55 }]}>A</Text>
        <Text style={[styles.th, { width: 55 }]}>B</Text>
        <Text style={[styles.th, { flex: 1 }]}>Outcome → status</Text>
      </View>

      {rows.map((r, i) => {
        const active = i === selectedIndex;

        return (
          <AnimatedPressable
            key={r.hole}
            onPress={() => {
              hapticTap();
              onSelectIndex(i);
            }}
            style={[
              styles.tableRow,
              active && styles.mpRowActive,
              active && { transform: [{ scale: activeScale }] },
            ]}
          >
            {active && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.mpRowOverlay,
                  { opacity: activeOverlayOpacity },
                ]}
              />
            )}

            <Text style={[styles.td, { width: 55 }, active && styles.mpRowTextActive]}>
              {r.hole}
            </Text>
            <Text style={[styles.td, { width: 55 }, active && styles.mpRowTextActive]}>
              {r.a}
            </Text>
            <Text style={[styles.td, { width: 55 }, active && styles.mpRowTextActive]}>
              {r.b}
            </Text>
            <Text
              style={[styles.td, { flex: 1 }, active && styles.mpRowTextActive]}
              allowFontScaling
              maxFontSizeMultiplier={2.0}
              numberOfLines={2}
            >
              {r.label} → {rowResult(i)}
            </Text>
          </AnimatedPressable>
        );
      })}

      <View style={styles.mpScrubHintRow}>
        <Text style={styles.mpScrubHintText}>
          Tip: drag up/down over the table to scrub through holes.
        </Text>
      </View>
    </View>
  );
}

function NetVsGrossCard() {
  return (
    <Card>
      <Text style={styles.h3}>Net vs Gross (handicaps)</Text>

      <Text style={styles.body}>
        <Text style={styles.bold}>Gross</Text> is your actual strokes on the hole.
        <Text style={styles.bold}> Net</Text> is your strokes after handicap is applied.
      </Text>

      <Spacer h={10} />

      <Text style={styles.body}>
        Handicap strokes are allocated using the hole's{' '}
        <Text style={styles.bold}>Stroke Index</Text> (SI). Lower SI holes get
        strokes first (hardest holes).
      </Text>

      <Spacer h={10} />

      <Text style={styles.note}>
        Example: If you receive 1 stroke on a Par 4 hole and you score 5 gross,
        your net score is 4 (net par). Stableford points are often calculated from
        net score in handicap competitions.
      </Text>

      <Spacer h={10} />

      <Text style={styles.note}>
        Competition rules vary by club (and by format). If you want, we can add a
        "How NetParGolf applies handicap strokes" section that matches your app's logic.
      </Text>
    </Card>
  );
}

function FooterNote() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>
        Rules can vary by competition (especially around handicaps and concessions).
        This guide explains the common approach used in club golf.
      </Text>
    </View>
  );
}

/* ------------------------- Visual Aids (Animated) ------------------------- */

function StablefordPointsLadder({ activePoints, reduceMotion = false }: { activePoints: number; reduceMotion?: boolean }) {
  // Clamp to 0..5 so UI always stable
  const p = Math.max(0, Math.min(5, activePoints));

  const anim = React.useRef(new Animated.Value(p)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      anim.setValue(p);
      return;
    }
    Animated.timing(anim, {
      toValue: p,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [p, anim, reduceMotion]);

  // Each chip is 34px wide + 8px gap. Keep in sync with styles below.
  const CHIP_W = 34;
  const GAP = 8;
  const translateX = anim.interpolate({
    inputRange: [0, 5],
    outputRange: [0, (CHIP_W + GAP) * 5],
  });

  return (
    <View style={styles.ladderWrap}>
      <Text style={styles.ladderTitle}>Points ladder</Text>

      <View style={styles.ladderRow}>
        {/* Highlight pill behind the active chip */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ladderHighlight,
            {
              transform: [{ translateX }],
            },
          ]}
        />

        {Array.from({ length: 6 }).map((_, i) => {
          const isActive = i === p;
          return (
            <View key={i} style={[styles.ladderChip, isActive && styles.ladderChipActive]}>
              <Text style={[styles.ladderChipText, isActive && styles.ladderChipTextActive]}>
                {i}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.ladderHint}>
        0 = double bogey+ · 1 = bogey · 2 = par · 3 = birdie · 4 = eagle · 5 = albatross+
      </Text>
    </View>
  );
}

function MatchPlaySwingMeter({
  value,
  statusText,
  stepText,
  canPrev,
  canNext,
  onPrev,
  onNext,
  reduceMotion = false,
}: {
  value: number; // -3..+3
  statusText: string;
  stepText: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  reduceMotion?: boolean;
}) {
  const anim = React.useRef(new Animated.Value(value)).current;

  React.useEffect(() => {
    if (reduceMotion) {
      anim.setValue(value);
      return;
    }
    Animated.spring(anim, {
      toValue: value,
      speed: 18,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [value, anim, reduceMotion]);

  const translateX = anim.interpolate({
    inputRange: [-3, 3],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.mpWrap}>
      <View style={styles.mpHeader}>
        <Text style={styles.mpTitle}>Match play swing</Text>
        <Text style={styles.mpStatus}>{statusText}</Text>
      </View>

      <View style={styles.mpTrackOuter}>
        <View style={styles.mpTrack}>
          <View style={styles.mpZoneLeft} />
          <View style={styles.mpZoneMid} />
          <View style={styles.mpZoneRight} />

          <Animated.View
            style={[
              styles.mpMarker,
              {
                transform: [{ translateX: translateX as any }],
              },
            ]}
          />
        </View>

        <View style={styles.mpLabels}>
          <Text style={styles.mpLabel}>A</Text>
          <Text style={styles.mpLabel}>AS</Text>
          <Text style={styles.mpLabel}>B</Text>
        </View>
      </View>

      <View style={styles.mpControls}>
        <Pressable
          onPress={onPrev}
          disabled={!canPrev}
          style={({ pressed }) => [styles.mpBtn, !canPrev && styles.mpBtnDisabled, pressed && canPrev && styles.btnPressed]}
        >
          <Text style={[styles.mpBtnText, !canPrev && styles.mpBtnTextDisabled]}>
            Prev hole
          </Text>
        </Pressable>

        <Text style={styles.mpStepText}>{stepText}</Text>

        <Pressable
          onPress={onNext}
          disabled={!canNext}
          style={({ pressed }) => [styles.mpBtn, !canNext && styles.mpBtnDisabled, pressed && canNext && styles.btnPressed]}
        >
          <Text style={[styles.mpBtnText, !canNext && styles.mpBtnTextDisabled]}>
            Next hole
          </Text>
        </Pressable>
      </View>

      <Text style={styles.mpHint}>
        Tap a row below to jump to that hole — the marker updates instantly.
      </Text>
    </View>
  );
}

/* --------------------------------- Styles -------------------------------- */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: theme.textMuted,
    marginBottom: 14,
  },

  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.chip,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  segTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segTabActive: {
    backgroundColor: theme.primarySoft,
  },
  segTabText: {
    color: theme.textMuted,
    fontWeight: '700',
    fontSize: 14,
  },
  segTabTextActive: {
    color: theme.text,
  },

  sectionTitleWrap: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: theme.textMuted,
  },

  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },

  h3: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '800',
    color: theme.text,
  },
  note: {
    fontSize: 12.5,
    color: theme.textMuted,
    lineHeight: 18,
  },

  table: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    alignItems: 'center',
  },
  tableHeader: {
    borderTopWidth: 0,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  th: {
    fontSize: 12.5,
    color: theme.textMuted,
    fontWeight: '800',
  },
  td: {
    fontSize: 13.5,
    color: theme.text,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bulletDot: {
    width: 18,
    color: theme.textMuted,
    fontSize: 18,
    lineHeight: 18,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    lineHeight: 20,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: theme.textMuted,
    fontWeight: '800',
    fontSize: 13,
  },

  pillGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.chip,
  },
  pillActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  pillText: {
    color: theme.textMuted,
    fontWeight: '800',
  },
  pillTextActive: {
    color: theme.text,
  },

  btnPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.chip,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: Platform.OS === 'android' ? -2 : 0,
  },
  stepValue: {
    minWidth: 56,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.chip,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  stepValueText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '800',
  },

  resultBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    backgroundColor: theme.chip,
  },
  resultLine: {
    color: theme.text,
    fontSize: 14,
    marginBottom: 4,
  },
  good: { color: theme.success },
  warn: { color: theme.warning },
  bad: { color: theme.danger },

  callout: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.primary,
    padding: 12,
    backgroundColor: theme.primarySoft,
  },
  calloutTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 6,
  },

  footer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  footerText: {
    color: theme.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
  },

  /* Stableford ladder */
  ladderWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  ladderTitle: {
    color: theme.textMuted,
    fontSize: 12.5,
    fontWeight: '900',
    marginBottom: 10,
  },
  ladderRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    alignItems: 'center',
  },
  ladderHighlight: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 34,
    width: 34,
    borderRadius: 10,
    backgroundColor: theme.primarySoft,
    borderWidth: 1,
    borderColor: theme.primary,
  },
  ladderChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.chip,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ladderChipActive: {
    backgroundColor: theme.primarySoft,
    borderColor: theme.primary,
  },
  ladderChipText: {
    color: theme.textMuted,
    fontWeight: '900',
  },
  ladderChipTextActive: {
    color: theme.text,
  },
  ladderHint: {
    marginTop: 10,
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },

  /* Match play swing meter */
  mpWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  mpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  mpTitle: {
    color: theme.textMuted,
    fontSize: 12.5,
    fontWeight: '900',
  },
  mpStatus: {
    color: theme.text,
    fontSize: 12.5,
    fontWeight: '900',
  },
  mpTrackOuter: {
    marginBottom: 10,
  },
  mpTrack: {
    height: 18,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: theme.chip,
  },
  mpZoneLeft: { flex: 1, backgroundColor: theme.successSoft },
  mpZoneMid: { flex: 1, backgroundColor: 'rgba(0,0,0,0.02)' },
  mpZoneRight: { flex: 1, backgroundColor: theme.dangerSoft },

  mpMarker: {
    position: 'absolute',
    top: -5,
    left: 0,
    width: 12,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  mpLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  mpLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  mpControls: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  mpBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.chip,
  },
  mpBtnDisabled: {
    opacity: 0.45,
  },
  mpBtnText: {
    color: theme.text,
    fontWeight: '900',
    fontSize: 12,
  },
  mpBtnTextDisabled: {
    opacity: 0.7,
  },
  mpStepText: {
    flex: 1,
    textAlign: 'center',
    color: theme.textMuted,
    fontSize: 12.5,
    fontWeight: '800',
  },
  mpHint: {
    marginTop: 10,
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },

  mpRowActive: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'rgba(138,180,255,0.10)',
    borderTopColor: 'rgba(138,180,255,0.28)',
  },
  mpRowOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(138,180,255,1)',
    borderRadius: 0,
  },
  mpRowTextActive: {
    color: theme.text,
    fontWeight: '900',
  },

  mpScrubHintRow: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  mpScrubHintText: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
});
