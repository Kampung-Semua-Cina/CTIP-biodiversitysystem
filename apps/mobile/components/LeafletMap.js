// apps/mobile/components/LeafletMap.js
// Leaflet + OpenStreetMap map view for React Native (Expo) using react-native-webview.
import React, { useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { generateMapHtml } from '../../shared/mapHtml.js';
import { MAP_BOUNDS } from '../../shared/mapConfig.js';
import { useTheme } from './Theme.js';

const LeafletMap = forwardRef(function LeafletMap({
  points = [],
  selectedId = null,
  onSelect,
  bounds = MAP_BOUNDS,
  interactive = true,
  height = '100%',
  rounded = false,
  showControls = false, // Defaults to false on mobile so native header controls are used
  layer = 'osm',
  initialLayer = 'osm',
  userLocation = null,
  onLocatePress,
  style,
}, ref) {
  const { c } = useTheme();
  const webViewRef = useRef(null);
  const isLoadedRef = useRef(false);

  // Expose imperative actions to parent (e.g. MapPage)
  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (!webViewRef.current) return;
      webViewRef.current.injectJavaScript(`
        (function() {
          if (typeof window.handleIncoming === 'function') {
            window.handleIncoming({ type: 'FIT_BOUNDS' });
          }
        })();
        true;
      `);
    },
    setLayer: (nextLayer) => {
      if (!webViewRef.current) return;
      const msg = JSON.stringify({ type: 'SET_LAYER', layer: nextLayer });
      webViewRef.current.injectJavaScript(`
        (function() {
          if (typeof window.handleIncoming === 'function') {
            window.handleIncoming(${msg});
          }
        })();
        true;
      `);
    },
    panToUser: () => {
      if (!webViewRef.current || !userLocation) return;
      const msg = JSON.stringify({ type: 'SET_USER_LOCATION', location: userLocation, panTo: true });
      webViewRef.current.injectJavaScript(`
        (function() {
          if (typeof window.handleIncoming === 'function') {
            window.handleIncoming(${msg});
          }
        })();
        true;
      `);
    },
  }));

  // Generate initial HTML payload
  const activeLayer = layer || initialLayer;
  const html = useMemo(() => {
    return generateMapHtml({
      points,
      selectedId,
      bounds,
      interactive,
      initialLayer: activeLayer,
      showControls,
      userLocation,
    });
  }, [bounds, interactive, activeLayer, showControls, userLocation]);

  // Sync selected pin dynamically without full HTML reload
  useEffect(() => {
    if (!isLoadedRef.current || !webViewRef.current) return;
    const msg = JSON.stringify({ type: 'SET_SELECTED', id: selectedId });
    webViewRef.current.injectJavaScript(`
      (function() {
        if (typeof window.handleIncoming === 'function') {
          window.handleIncoming(${msg});
        }
      })();
      true;
    `);
  }, [selectedId]);

  // Sync points dynamically (e.g., family filter, search)
  useEffect(() => {
    if (!isLoadedRef.current || !webViewRef.current) return;
    const msg = JSON.stringify({ type: 'UPDATE_POINTS', points, selectedId });
    webViewRef.current.injectJavaScript(`
      (function() {
        if (typeof window.handleIncoming === 'function') {
          window.handleIncoming(${msg});
        }
      })();
      true;
    `);
  }, [points]);

  // Sync layer dynamically (street map vs satellite)
  useEffect(() => {
    if (!isLoadedRef.current || !webViewRef.current || !layer) return;
    const msg = JSON.stringify({ type: 'SET_LAYER', layer });
    webViewRef.current.injectJavaScript(`
      (function() {
        if (typeof window.handleIncoming === 'function') {
          window.handleIncoming(${msg});
        }
      })();
      true;
    `);
  }, [layer]);

  // Sync live user location
  useEffect(() => {
    if (!isLoadedRef.current || !webViewRef.current || !userLocation) return;
    const msg = JSON.stringify({ type: 'SET_USER_LOCATION', location: userLocation, panTo: true });
    webViewRef.current.injectJavaScript(`
      (function() {
        if (typeof window.handleIncoming === 'function') {
          window.handleIncoming(${msg});
        }
      })();
      true;
    `);
  }, [userLocation]);

  const handleMessage = (event) => {
    try {
      const raw = event.nativeEvent.data;
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (data.type === 'SELECT_PLANT' && onSelect) {
        onSelect(data.id, data.qr_id);
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
          // Apply active layer on initial load
          if (layer && layer !== 'osm') {
            const msg = JSON.stringify({ type: 'SET_LAYER', layer });
            webViewRef.current?.injectJavaScript(`
              (function() {
                if (typeof window.handleIncoming === 'function') {
                  window.handleIncoming(${msg});
                }
              })();
              true;
            `);
          }
        }}
        onMessage={handleMessage}
        scrollEnabled={false}
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
