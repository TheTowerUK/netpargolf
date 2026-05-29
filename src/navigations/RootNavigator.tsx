// src/navigations/RootNavigator.tsx
// Register Scoreboard screen.

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import CompetitionSelectScreen from '../screens/competition/CompetitionSelectScreen';
import RoundSetupScreen from '../screens/RoundSetupScreen';
import RoundScoringScreen from '../screens/RoundScoringScreen';
import LiveIndividualStablefordScreen from '../screens/live/LiveIndividualStablefordScreen';
import LiveSinglesMatchplayScreen from '../screens/live/LiveSinglesMatchplayScreen';
import LiveBetterballStablefordScreen from '../screens/live/LiveBetterballStablefordScreen';
import LiveFourballBetterballMatchplayScreen from '../screens/live/LiveFourballBetterballMatchplayScreen';
import HelpPracticeScreen from '../screens/HelpPracticeScreen';
import CourseSetupScreen from '../screens/CourseSetupScreen';
import CourseSearchScreen from '../screens/CourseSearchScreen';
import LiveScoringScreen from '../screens/LiveScoringScreen';
import ScoreboardScreen from '../screens/ScoreboardScreen';
import ScorecardScreen from '../screens/ScorecardScreen';
import AboutScreen from '../screens/AboutScreen';
import RoundHistoryScreen from '../screens/RoundHistoryScreen';
import StatsScreen from '../screens/StatsScreen';
import CompetitionHandicapCheckerScreen from '../screens/CompetitionHandicapCheckerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'NetParGolf' }} />
        <Stack.Screen
          name="CompetitionSelect"
          component={CompetitionSelectScreen}
          options={{ title: 'Choose Competition' }}
        />
        <Stack.Screen
          name="RoundSetup"
          component={RoundSetupScreen}
          options={{ title: 'Round Setup' }}
        />
        <Stack.Screen
          name="RoundScoring"
          component={RoundScoringScreen}
          options={{ title: 'Live Round' }}
        />
        <Stack.Screen
          name="LiveIndividualStableford"
          component={LiveIndividualStablefordScreen}
          options={{ title: 'Individual Stableford' }}
        />
        <Stack.Screen
          name="LiveBetterballStableford"
          component={LiveBetterballStablefordScreen}
          options={{ title: 'Betterball Stableford' }}
        />
        <Stack.Screen
          name="LiveSinglesMatchplay"
          component={LiveSinglesMatchplayScreen}
          options={{ title: 'Singles Matchplay' }}
        />
        <Stack.Screen
          name="LiveFourballBetterballMatchplay"
          component={LiveFourballBetterballMatchplayScreen}
          options={{ title: 'Fourball Matchplay' }}
        />
        <Stack.Screen name="LiveScoring" component={LiveScoringScreen} options={{ title: 'Live Scoring' }} />
        <Stack.Screen name="Scoreboard" component={ScoreboardScreen} options={{ title: 'Scoreboard' }} />
        <Stack.Screen name="Scorecard" component={ScorecardScreen} options={{ title: 'Scorecard' }} />
        <Stack.Screen name="HelpPractice" component={HelpPracticeScreen} options={{ title: 'Help / Practice' }} />
        <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
        <Stack.Screen name="CourseSetup" component={CourseSetupScreen} options={{ title: 'Course Setup' }} />
        <Stack.Screen name="CourseSearch" component={CourseSearchScreen} options={{ title: 'Find a course' }} />
        <Stack.Screen name="RoundHistory" component={RoundHistoryScreen} options={{ title: 'Round History' }} />
        <Stack.Screen name="Stats" component={StatsScreen} options={{ title: 'Stats' }} />
        <Stack.Screen
          name="CompetitionHandicapChecker"
          component={CompetitionHandicapCheckerScreen}
          options={{ title: 'Competition Handicap Checker' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
