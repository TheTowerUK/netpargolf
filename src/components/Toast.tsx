import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet, Platform } from 'react-native';

type ToastKind = 'info' | 'success' | 'error';
type ToastItem = { id: number; msg: string; kind: ToastKind };

type ToastApi = {
  show: (msg: string, kind?: ToastKind, ms?: number) => void;
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
  const timerRef = useRef<any>(null);
  const idRef = useRef(1);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 10, duration: 140, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (msg: string, kind: ToastKind = 'info', ms = 1400) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      const id = idRef.current++;
      setToast({ id, msg, kind });

      opacity.setValue(0);
      translateY.setValue(10);

      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();

      timerRef.current = setTimeout(hide, ms);
    },
    [hide, opacity, translateY]
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { opacity, transform: [{ translateY }] },
            toast.kind === 'success' && styles.success,
            toast.kind === 'error' && styles.error,
          ]}
        >
          <Text style={styles.text}>{toast.msg}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
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
});
