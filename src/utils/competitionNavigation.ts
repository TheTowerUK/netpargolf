import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigations/types';
import type { RoundCompetition } from '../types/competition';

export function navigateToLiveForCompetition(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  comp: RoundCompetition
) {
  if (comp === 'singles_matchplay') {
    navigation.navigate('LiveSinglesMatchplay');
  } else if (comp === 'fourball_betterball_matchplay') {
    navigation.navigate('LiveFourballBetterballMatchplay');
  } else if (comp === 'individual_stableford') {
    navigation.navigate('LiveIndividualStableford');
  } else if (comp === 'betterball_stableford') {
    navigation.navigate('LiveBetterballStableford');
  } else {
    navigation.navigate('RoundScoring');
  }
}
