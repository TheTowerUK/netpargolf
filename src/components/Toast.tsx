import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme/colors';

type ToastKind = 'info' | 'success' | 'error';
type ToastPlacement = 'bottom' | 'center';

type ToastItem = {
  id: number;
  msg: string;
  kind: ToastKind;
  placement: ToastPlacement;
  subtext?: string;
};

export type ToastShowOptions = {
  placement?: ToastPlacement;
  subtext?: string;
};

type ToastApi = {
  show: (msg: string, kind?: ToastKind, ms?: number, options?: ToastShowOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(1);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 10, duration: 160, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.96, duration: 160, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY, scale]);

  const show = useCallback(
    (msg: string, kind: ToastKind = 'info', ms = 1400, options?: ToastShowOptions) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const placement = options?.placement ?? 'bottom';
      const duration = placement === 'center' && ms === 1400 ? 1800 : ms;

      const id = idRef.current++;
      setToast({
        id,
        msg,
        kind,
        placement,
        subtext: options?.subtext,
      });

      opacity.setValue(0);
      translateY.setValue(placement === 'center' ? 6 : 10);
      scale.setValue(0.96);

      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();

      timerRef.current = setTimeout(hide, duration);
    },
    [hide, opacity, translateY, scale]
  );

  const api = useMemo(() => ({ show }), [show]);

  const isCentered = toast?.placement === 'center';

  return (
    <ToastContext.Provider value={api}>
      <View style={styles.provider}>
        {children}

      {toast && (
        <View style={isCentered ? styles.centerHost : undefined} pointerEvents="none">
          <Animated.View
            pointerEvents="none"
            style={[
              isCentered ? styles.centerWrap : styles.wrap,
              { opacity, transform: [{ translateY }, { scale }] },
              toast.kind === 'success' && (isCentered ? styles.centerSuccess : styles.success),
              toast.kind === 'error' && (isCentered ? styles.centerError : styles.error),
            ]}
          >
            <Text style={isCentered ? styles.centerTitle : styles.text}>{toast.msg}</Text>
            {isCentered && toast.subtext ? (
              <Text style={styles.centerSubtext}>{toast.subtext}</Text>
            ) : null}
          </Animated.View>
        </View>
      )}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  provider: {
    flex: 1,
  },
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 30 : 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(20, 28, 38, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: { color: 'white', fontSize: 14, fontWeight: '700' },
  success: { borderColor: 'rgba(54,211,153,0.55)' },
  error: { borderColor: 'rgba(251,113,133,0.6)' },

  centerHost: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    zIndex: 9999,
  },
  centerWrap: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    maxWidth: '88%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  centerSuccess: {
    borderColor: colors.success,
    backgroundColor: colors.card,
  },
  centerError: {
    borderColor: colors.danger,
  },
  centerTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.textPrimary,
  },
  centerSubtext: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
