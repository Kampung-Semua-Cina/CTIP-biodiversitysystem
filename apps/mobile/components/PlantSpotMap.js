// apps/mobile/components/PlantSpotMap.js
// Displays the observed coordinates for a field observation on an embedded Leaflet map.
import React from 'react';
import { View } from 'react-native';
import { Section } from './Bits.js';
import LeafletMap from './LeafletMap.js';
import { useTheme } from './Theme.js';
import { isExactProtected } from '../../shared/mapConfig.js';

export default function PlantSpotMap({ title = 'Observed location', lat, lng, plant, height = 180 }) {
  const { c } = useTheme();

  if (lat == null || lng == null) return null;

  const point = {
    id: plant?.id || 'spot',
    qr_id: plant?.qr_id || '',
    name: plant?.name || 'Observed spot',
    scientific: plant?.scientific || '',
    color: c.accent,
    lat,
    lng,
    protect: plant ? isExactProtected(plant) : false,
  };

  const bounds = {
    minLat: lat - 0.003,
    maxLat: lat + 0.003,
    minLng: lng - 0.003,
    maxLng: lng + 0.003,
  };

  return (
    <Section title={title} gap={8}>
      <View
        style={{
          height,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.mapTile,
        }}
      >
        <LeafletMap
          points={[point]}
          selectedId={point.id}
          bounds={bounds}
          interactive={false}
          rounded
          height="100%"
        />
      </View>
    </Section>
  );
}
