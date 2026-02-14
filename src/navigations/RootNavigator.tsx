// src/navigations/RootNavigator.tsx
// Register Scoreboard screen.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import HelpPracticeScreen from '../screens/HelpPracticeScreen';
import CourseSetupScreen from '../screens/CourseSetupScreen';
import CourseSearchScreen from '../screens/CourseSearchScreen';
import LiveScoringScreen from '../screens/LiveScoringScreen';
import ScoreboardScreen from '../screens/ScoreboardScreen';
import ScorecardScreen from '../screens/ScorecardScreen';
import RoundHistoryScreen from '../screens/RoundHistoryScreen';
import RoundDetailScreen from '../screens/RoundDetailScreen';
import StatsScreen from '../screens/StatsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'NetParGolf' }} />
        <Stack.Screen name="LiveScoring" component={LiveScoringScreen} options={{ title: 'Live Scoring' }} />
        <Stack.Screen name="Scoreboard" component={ScoreboardScreen} options={{ title: 'Scoreboard' }} />
        <Stack.Screen name="Scorecard" component={ScorecardScreen} options={{ title: 'Scorecard' }} />
        <Stack.Screen name="HelpPractice" component={HelpPracticeScreen} options={{ title: 'Help / Practice' }} />
        <Stack.Screen name="CourseSetup" component={CourseSetupScreen} options={{ title: 'Course Setup' }} />
        <Stack.Screen name="CourseSearch" component={CourseSearchScreen} options={{ title: 'Find a course' }} />
        <Stack.Screen name="RoundHistory" component={RoundHistoryScreen} options={{ title: 'Round History' }} />
        <Stack.Screen name="RoundDetail" component={RoundDetailScreen} options={{ title: 'Round' }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ title: 'Stats' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
