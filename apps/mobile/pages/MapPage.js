// apps/mobile/pages/MapPage.js
// Plant map: every plant this role may see as a pin on OpenStreetMap / Leaflet.
// Endangered plants have no pin for visitors (their location is protected, CTIP-71).
// Aligned to the Daun design language with Lucide line icons and live GPS tracking.
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Pressable, ScrollView, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { useStore } from '../../shared/store.js';
import { visiblePlants, shownCoords, familyColors, familyOf } from '../../shared/selectors.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { MAP_BOUNDS, isExactProtected } from '../../shared/mapConfig.js';
import { useTheme, font } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { Txt, IconButton } from '../components/Bits.js';
import LeafletMap from '../components/LeafletMap.js';
import PlantWindow from '../components/PlantWindow.js';

// One round button in the row of map tools.
function Tool({ icon, label, a11y, on, onPress }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: on ? c.accent : c.surface,
        borderWidth: on ? 0 : 1,
        borderColor: c.line,
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 3,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Icon name={icon} size={15} color={on ? c.onAccent : c.ink} />
      <Text style={{ fontFamily: font('text', 700), fontSize: 13, color: on ? c.onAccent : c.ink }}>{label}</Text>
    </Pressable>
  );
}

export default function MapPage({ nav, params = {} }) {
  const { db, role } = useStore();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [family, setFamily] = useState('all');
  const [q, setQ] = useState('');
  const [layer, setLayer] = useState('osm'); // 'osm' or 'satellite'
  const [userLoc, setUserLoc] = useState(null);
  const [locating, setLocating] = useState(false);

  const plants = visiblePlants(db, role);
  const colorMap = useMemo(() => familyColors(db.species, plants), [db.species, plants]);
  const families = useMemo(
    () => [...new Set(plants.map((p) => p.species?.family).filter(Boolean))].sort(),
    [plants],
  );

  const needle = q.trim().toLowerCase();
  const shown = plants
    .filter((p) => family === 'all' || p.species?.family === family)
    .filter((p) => !needle || fuzzyMatch([p.name, p.scientific, p.qr_id, familyOf(p)].filter(Boolean).join(' '), needle))
    .map((p) => ({ p, where: shownCoords(p, role) }));

  const onMap = shown.filter((s) => s.where);
  const hidden = shown.filter((s) => !s.where && s.p.endangered).length;
  const firstForSpecies = params.species ? onMap.find((s) => s.p.species_id === params.species)?.p.id : null;
  const [picked, setPicked] = useState(null);
  const [spotIds, setSpotIds] = useState(null); // the plants the open window lists
  const [cardHeight, setCardHeight] = useState(0);
  const selectedId = picked || firstForSpecies || null;
  const spotPlants = spotIds ? onMap.filter((s) => spotIds.includes(s.p.id)) : [];

  const count = (f) => onMap.filter((s) => familyOf(s.p) === f).length;

  const mapPoints = useMemo(() => {
    return onMap.map((s) => ({
      id: s.p.id,
      qr_id: s.p.qr_id,
      name: s.p.name,
      scientific: s.p.scientific || s.p.species?.scientific || '',
      family: familyOf(s.p),
      color: colorMap[familyOf(s.p)] || c.accent,
      lat: s.where.lat,
      lng: s.where.lng,
      protect: isExactProtected(s.p),
    }));
  }, [onMap, colorMap, c.accent]);

  const handleLocateMe = async () => {
    try {
      setLocating(true);
      if (userLoc) {
        // Already have location, pan directly
        mapRef.current?.panToUser();
        setLocating(false);
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (loc && loc.coords) {
        const here = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
        };
        setUserLoc(here);
        mapRef.current?.panToUser(here);
      }
      setLocating(false);
    } catch (e) {
      setLocating(false);
    }
  };

  const handleRecenter = () => {
    mapRef.current?.recenter();
  };

  // Live GPS tracking
  useEffect(() => {
    let sub = null;
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
          (loc) => {
            if (loc && loc.coords) {
              setUserLoc({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
              });
            }
          },
        ).then((s) => {
          sub = s;
        });
      }
    });

    return () => {
      if (sub && sub.remove) sub.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: c.mapTile }}>
      {/* Full-screen Leaflet + OpenStreetMap layer */}
      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
        <LeafletMap
          ref={mapRef}
          points={mapPoints}
          selectedId={selectedId}
          onSelect={(id, qr, ids) => {
            setPicked(id);
            setSpotIds(ids || [id]);
          }}
          fitKey={`${family}|${needle}`}
          bounds={MAP_BOUNDS}
          showControls={false}
          layer={layer}
          userLocation={userLoc}
          bottomInset={cardHeight}
        />
      </View>

      {/* Floating Header Controls: Search, Filter Chips, Map Tools */}
      <View
        pointerEvents="box-none"
        style={{ gap: 10, paddingHorizontal: 16, paddingTop: 12 + insets.top, zIndex: 10 }}
      >
        {/* Search Bar */}
        <View
          style={{
            height: 48,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingLeft: nav.canGoBack ? 2 : 14,
            paddingRight: 14,
            borderRadius: 999,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.line,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          {nav.canGoBack ? (
            <IconButton name="chevL" label="Back" onPress={nav.back} size={22} />
          ) : (
            <Icon name="search" size={20} color={c.ink3} />
          )}
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search the map"
            placeholderTextColor={c.ink3}
            accessibilityLabel="Search the map"
            style={{ flex: 1, fontFamily: font('text', 400), fontSize: 15, color: c.ink }}
          />
          {q ? (
            <IconButton name="x" label="Clear" onPress={() => setQ('')} size={18} />
          ) : null}
        </View>

        {/* Family Filter Chips (styled consistently with web .fam pills) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -16 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
        >
          {[{ key: 'all', label: `All families (${onMap.length})` }, ...families.map((f) => ({ key: f, label: `${f} (${count(f)})` }))].map((it) => {
            const on = it.key === family;
            const famColor = it.key === 'all' ? null : colorMap[it.key];
            return (
              <Pressable
                key={it.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFamily(it.key)}
                style={({ pressed }) => ({
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: on ? c.accent : c.surface,
                  borderWidth: on ? 0 : 1,
                  borderColor: c.line,
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                })}
              >
                {famColor ? (
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: famColor,
                      borderWidth: 1.5,
                      borderColor: on ? c.onAccent : '#ffffff',
                    }}
                  />
                ) : null}
                <Text
                  style={{
                    fontFamily: font('text', on ? 700 : 600),
                    fontSize: 13,
                    color: on ? c.onAccent : c.ink,
                  }}
                >
                  {it.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Floating Map Tools, positioned cleanly below the filter chips */}
        <View
          pointerEvents="box-none"
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 2,
          }}
        >
          <Tool icon="locate" label={locating ? 'Locating...' : 'Locate'} a11y="Show my location" on={!!userLoc} onPress={handleLocateMe} />
          <Tool
            icon="layers"
            label={layer === 'osm' ? 'Satellite' : 'Map'}
            a11y="Toggle satellite view"
            on={layer === 'satellite'}
            onPress={() => setLayer((l) => (l === 'osm' ? 'satellite' : 'osm'))}
          />
          <Tool icon="refresh" label="Reset zoom" a11y="Reset zoom to show every plant" onPress={() => mapRef.current?.fitPoints()} />
          <Tool icon="compass" label="Park" a11y="Fit to park bounds" onPress={handleRecenter} />
        </View>
      </View>

      <View style={{ flex: 1 }} pointerEvents="none" />

      {/* How to use the map, and what it is not showing */}
      <View
        onLayout={(e) => setCardHeight(Math.round(e.nativeEvent.layout.height) + 12 + 12 + insets.bottom)}
        style={{
          margin: 12,
          marginBottom: 12 + insets.bottom,
          gap: 8,
          padding: 14,
          borderRadius: 16,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.line,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          elevation: 6,
          zIndex: 10,
        }}
      >
        <Txt v="caption" color={c.ink2} style={{ fontFamily: font('text', 600) }}>
          {onMap.length
            ? 'Tap a pin to see the plant, with its photos and details. A number is a group of plants: tap it to zoom in.'
            : 'No plants match. Try another family or name.'}
        </Txt>
        {hidden > 0 ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="lock" size={16} color={c.ink2} />
            <Txt v="caption" color={c.ink2} style={{ flex: 1, fontFamily: font('text', 600) }}>
              {hidden} endangered plant{hidden === 1 ? ' is' : 's are'} not shown, to protect{' '}
              {hidden === 1 ? 'it' : 'them'}.
            </Txt>
          </View>
        ) : null}
      </View>

      {spotPlants.length ? (
        <PlantWindow
          entries={spotPlants}
          onClose={() => setSpotIds(null)}
          onOpen={(p) => {
            setSpotIds(null);
            nav.go('tag', { qr: p.qr_id });
          }}
        />
      ) : null}
    </View>
  );
}
