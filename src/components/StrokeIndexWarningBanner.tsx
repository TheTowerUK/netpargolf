// src/components/StrokeIndexWarningBanner.tsx
// Reusable advisory banner for missing Stroke Index values.
// CTA is optional and only shown when onPressFix is provided.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticTap } from '../utils/feedback';

type Props = {
  onPressFix?: () => void;
};

const TITLE = 'Stroke Index information incomplete';
const BODY =
  'This course is missing some Stroke Index values. For accurate handicap scoring, please complete them in Course Setup before starting or continuing your round.';

export default function StrokeIndexWarningBanner({ onPressFix }: Props) {
  return (
    <View style={styles.banner}>
      <Text style={styles.title}>{TITLE}</Text>
      <Text style={styles.body}>{BODY}</Text>
      {onPressFix ? (
        <Pressable
          onPress={() => {
            hapticTap();
            onPressFix();
          }}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaText}>Open Course Setup</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF6DB',
    borderColor: '#E7C766',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#6B5500',
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#6B5500',
  },
  cta: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B5500',
  },
});
