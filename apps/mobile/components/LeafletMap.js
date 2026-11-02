// apps/mobile/components/LeafletMap.js
// Leaflet + OpenStreetMap map view for React Native (Expo) using react-native-webview.
import React, { useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { generateMapHtml } from '../../shared/mapHtml.js';
import { MAP_BOUNDS } from '../../shared/mapConfig.js';
import { useTheme } from './Theme.js';

// onSelect(id, qr_id, ids): ids lists every plant at the spot or cluster that was chosen.
// onMapClick(lat, lng): for choosing a location by hand.
// fitKey: when it changes, the view moves to the current points (a new search or filter).
const LeafletMap = forwardRef(function LeafletMap({
  points = [],
  selectedId = null,
  onSelect,
  onMapClick,
  fitKey = null,
  bounds = MAP_BOUNDS,
  interactive = true,
  height = '100%',
  rounded = false,
  showControls = false, // Defaults to false on mobile so native header controls are used
  layer = 'osm',
  initialLayer = 'osm',
  userLocation = null,
  bottomInset = 0, // height the screen covers at the bottom of the map
  onLocatePress,
  style,
}, ref) {
  const { c } = useTheme();
  const webViewRef = useRef(null);
  const isLoadedRef = useRef(false);
  const drawnRef = useRef(null); // what the map shows now, so an unchanged list is not redrawn
  const fittedRef = useRef(null); // the fitKey the view last moved for

  const send = (msg) => {
    if (!isLoadedRef.current || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(`
      (function() {
        if (typeof window.handleIncoming === 'function') {
          window.handleIncoming(${JSON.stringify(msg)});
        }
      })();
      true;
    `);
  };

  const sendPoints = () => {
    // Move the view once per fitKey, as soon as there is something to show: new data
    // must not move the map under the user.
    const fit = fitKey != null && points.length > 0 && fittedRef.current !== fitKey;
    const drawn = JSON.stringify(points);
    if (drawnRef.current === drawn && !fit) return;
    drawnRef.current = drawn;
    if (fit) fittedRef.current = fitKey;
    send({ type: 'UPDATE_POINTS', points, selectedId, fit });
  };

  // Expose imperative actions to parent (e.g. MapPage)
  useImperativeHandle(ref, () => ({
    recenter: () => send({ type: 'FIT_BOUNDS' }),
    fitPoints: () => send({ type: 'FIT_POINTS' }),
    setLayer: (nextLayer) => send({ type: 'SET_LAYER', layer: nextLayer }),
    panToUser: (location) => {
      if (location || userLocation) send({ type: 'SET_USER_LOCATION', location: location || userLocation, panTo: true });
    },
  }));

  // The page loads once. Later changes are sent to it, because a reload would lose the
  // zoom and position (a moving phone's location changes every few metres).
  const boundsKey = JSON.stringify(bounds);
  const html = useMemo(() => {
    return generateMapHtml({
      points,
      selectedId,
      bounds,
      interactive,
      initialLayer: layer || initialLayer,
      showControls,
      userLocation,
    });
  }, [boundsKey, interactive, showControls]);

  // Sync selected pin dynamically without full HTML reload
  useEffect(() => {
    send({ type: 'SET_SELECTED', id: selectedId });
  }, [selectedId]);

  // Sync points dynamically (e.g., family filter, search)
  useEffect(() => {
    if (isLoadedRef.current) sendPoints();
  }, [points, fitKey]);

  // Sync layer dynamically (street map vs satellite)
  useEffect(() => {
    if (layer) send({ type: 'SET_LAYER', layer });
  }, [layer]);

  // Sync live user location. Only the marker moves: panning here would pull the map
  // away from whatever the user is looking at.
  useEffect(() => {
    if (userLocation) send({ type: 'SET_USER_LOCATION', location: userLocation, panTo: false });
  }, [userLocation]);

  useEffect(() => {
    send({ type: 'SET_INSET', bottom: bottomInset });
  }, [bottomInset]);

  const handleMessage = (event) => {
    try {
      const raw = event.nativeEvent.data;
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (data.type === 'SELECT_PLANT' && onSelect) {
        onSelect(data.id, data.qr_id, data.ids);
      } else if (data.type === 'MAP_CLICK' && onMapClick) {
        onMapClick(data.lat, data.lng);
      } else if (data.type === 'REQUEST_LOCATION' && onLocatePress) {
        onLocatePress();
      }
    } catch (e) {
      // ignore parse errors
    }
  };

  return (
    <View style={[styles.container, { height, borderRadius: rounded ? 16 : 0, backgroundColor: c.mapTile }, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        onLoadEnd={() => {
          isLoadedRef.current = true;
          // Anything that changed while the page was loading
          drawnRef.current = null;
          sendPoints();
          if (layer) send({ type: 'SET_LAYER', layer });
          send({ type: 'SET_INSET', bottom: bottomInset });
          if (userLocation) send({ type: 'SET_USER_LOCATION', location: userLocation, panTo: false });
        }}
        onMessage={handleMessage}
        scrollEnabled={false}
        nestedScrollEnabled
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled={true}
        domStorageEnabled={true}
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: c.mapTile }]}>
            <ActivityIndicator size="small" color={c.accent} />
          </View>
        )}
        startInLoadingState={true}
        style={styles.webview}
        androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
      />
    </View>
  );
});

export default LeafletMap;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
