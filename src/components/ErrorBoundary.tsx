import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (__DEV__) {
      console.error('NetParGolf startup/render error:', error);
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.wrap}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>NetParGolf could not start</Text>
          <Text style={styles.body}>
            Something went wrong while loading the app. You can try again, or restart the app from
            your home screen.
          </Text>
          {__DEV__ ? (
            <Text style={styles.detail}>{this.state.error.message}</Text>
          ) : null}
          <Pressable style={styles.btn} onPress={this.handleRetry}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  detail: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.danger,
  },
  btn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  btnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 15,
  },
});
