import { Text, View } from 'react-native';
import { plantInfoContent } from './PlantInfoContent.js';

export function PlantInfo() {
  return (
    <View>
      <Text>{plantInfoContent.title}</Text>
      <Text>{plantInfoContent.description}</Text>
    </View>
  );
}