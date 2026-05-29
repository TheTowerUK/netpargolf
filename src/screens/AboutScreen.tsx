import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors as theme } from '../theme/colors';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Spacer({ h }: { h: number }) {
  return <View style={{ height: h }} />;
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

export default function AboutScreen() {
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>About NetParGolf</Text>

        <Section title="Overview">
          <Card>
            <Text style={styles.body}>
              NetParGolf is designed to provide a simple and effective way to track your
              golf rounds, whether playing individually or in small groups.
            </Text>
            <Spacer h={10} />
            <Text style={styles.body}>
              The app focuses on ease of use during live play, allowing you to quickly
              enter scores, track progress, and review results without distraction.
            </Text>
          </Card>
        </Section>

        <Section title="Course Data, Stroke Index & Saved Courses">
          <Card>
            <Text style={styles.body}>
              NetParGolf uses publicly available golf course data to provide course
              layouts, including par and stroke index (SI) information where available.
            </Text>
            <Spacer h={10} />
            <Text style={styles.body}>However, this data is not always complete.</Text>
            <Spacer h={10} />
            <Text style={styles.note}>In particular:</Text>
            <Bullet text="Many UK golf courses do not return full Stroke Index data" />
            <Bullet text="Some courses may load without SI values" />
            <Bullet text="Data accuracy can vary depending on availability" />
          </Card>
        </Section>

        <Section title="What This Means">
          <Card>
            <Text style={styles.body}>
              If Stroke Index values are missing for a course:
            </Text>
            <Spacer h={10} />
            <Bullet text="Handicap-based scoring (e.g. Stableford, Matchplay allowances) may not calculate correctly" />
            <Bullet text="The app will still allow scoring, but results may not reflect accurate handicap play" />
          </Card>
        </Section>

        <Section title="What You Should Do">
          <Card>
            <Text style={styles.body}>If you notice missing Stroke Index values:</Text>
            <Spacer h={12} />
            <Text style={styles.numbered}>1. Go to Course Setup</Text>
            <Text style={styles.numbered}>2. Select the course you are playing</Text>
            <Text style={styles.numbered}>
              3. Manually enter the Stroke Index (SI) for each hole
            </Text>
            <Spacer h={8} />
            <Text style={styles.note}>
              (This is usually available on the physical scorecard or clubhouse display)
            </Text>
            <Spacer h={12} />
            <Text style={styles.body}>Once entered:</Text>
            <Bullet text="Your updated course data will be saved locally on your device" />
            <Bullet text="Stroke Index data will be retained for future rounds" />
            <Bullet text="All scoring formats will calculate correctly" />
          </Card>
        </Section>

        <Section title="After Setup">
          <Card>
            <Bullet text="You only need to do this once per course" />
            <Bullet text="Future rounds will load with full data" />
            <Bullet text="You can enjoy accurate scoring and tracking every time" />
          </Card>
        </Section>

        <Section title="Data & Privacy">
          <Card>
            <Text style={styles.body}>
              NetParGolf does not collect personal data beyond what is required for app
              functionality.
            </Text>
            <Spacer h={10} />
            <Text style={styles.body}>
              All scoring data is stored locally on your device unless explicitly shared
              by you.
            </Text>
          </Card>
        </Section>

        <Section title="Our Goal">
          <Card>
            <Text style={styles.body}>
              NetParGolf aims to provide a reliable, easy-to-use scoring companion for
              golfers of all levels.
            </Text>
            <Spacer h={10} />
            <Text style={styles.body}>
              By allowing manual course setup where needed, the app ensures flexibility
              across a wide range of courses — including those not fully supported by
              public data sources.
            </Text>
          </Card>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Thank you for using NetParGolf. Enjoy your round.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

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
    marginBottom: 18,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
  },
  body: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 20,
  },
  note: {
    fontSize: 12.5,
    color: theme.textMuted,
    lineHeight: 18,
    marginBottom: 6,
  },
  numbered: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 22,
    marginBottom: 4,
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
});
