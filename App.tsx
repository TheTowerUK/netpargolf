// App.tsx
import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import RootNavigator from './src/navigations/RootNavigator';
import { ToastProvider } from './src/components/Toast';
import { colors } from './src/theme/colors';

export default function App() {
  return (
    <ToastProvider>
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.app}>
          <RootNavigator />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
    </ToastProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  app: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
