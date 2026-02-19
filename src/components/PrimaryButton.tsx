import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { hapticTap } from '../utils/feedback';
import { colors as theme } from '../theme/colors';

type Variant = 'primary' | 'secondary' | 'danger';

type Props = {
  title: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  haptics?: boolean; // default true
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;

  // Accessibility
  accessibilityLabel?: string;
  accessibilityHint?: string;

  // Text scaling
  maxFontSizeMultiplier?: number; // default 2.0
};

export default function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  haptics = true,
  style,
  textStyle,
  testID,
  accessibilityLabel,
  accessibilityHint,
  maxFontSizeMultiplier = 2.0,
}: Props) {
  const isDisabled = !!disabled || !!loading;

  const base = useMemo(() => {
    switch (variant) {
      case 'secondary':
        return {
          btn: styles.secondaryBtn,
          txt: styles.secondaryText,
          ripple: 'rgba(0,0,0,0.08)',
        };
      case 'danger':
        return {
          btn: styles.dangerBtn,
          txt: styles.dangerText,
          ripple: 'rgba(127,29,29,0.2)',
        };
      default:
        return {
          btn: styles.primaryBtn,
          txt: styles.primaryText,
          ripple: 'rgba(255,255,255,0.2)',
        };
    }
  }, [variant]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={(accessibilityLabel ?? title) + (loading ? ', loading' : '')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      onPress={() => {
        if (isDisabled) return;
        if (haptics) hapticTap();
        onPress();
      }}
      disabled={isDisabled}
      android_ripple={Platform.OS === 'android' ? { color: base.ripple } : undefined}
      style={({ pressed }) => [
        styles.btnBase,
        base.btn,
        pressed && !isDisabled && styles.btnPressed,
        isDisabled && styles.btnDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.textInverse : theme.textPrimary} />
      ) : (
        <Text
          style={[styles.btnTextBase, base.txt, textStyle]}
          allowFontScaling
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          numberOfLines={2}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btnBase: {
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  btnTextBase: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 18,
  },
  btnPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  btnDisabled: {
    opacity: 0.55,
  },

  primaryBtn: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  primaryText: {
    color: theme.textInverse,
  },

  secondaryBtn: {
    backgroundColor: theme.card,
    borderColor: theme.border,
  },
  secondaryText: {
    color: theme.textPrimary,
  },

  dangerBtn: {
    backgroundColor: theme.danger,
    borderColor: theme.danger,
  },
  dangerText: {
    color: theme.textInverse,
  },
});
