// apps/shared/mapHtml.js
// Generates self-contained HTML for Leaflet + OpenStreetMap maps with project-aligned typography,
// Lucide line icons (no emojis), and live user location tracking.
import {
  MAP_BOUNDS, MAP_CENTER, DEFAULT_ZOOM, TILE_LAYERS, MAX_ZOOM, LIST_ZOOM, PLANT_ZOOM, SELECTED_ZOOM, PROTECTED_TILE_ZOOM, PROTECTED_REACH_M,
  HD_SCREEN_RATIO, tileServerZoom, getLeafletBounds,
} from "./mapConfig.js";

export function generateMapHtml({
  points = [],
  selectedId = null,
  bounds = MAP_BOUNDS,
  interactive = true,
  initialLayer = "osm",
  showControls = true,
  userLocation = null,
} = {}) {
  const pointsJson = JSON.stringify(points);
  const selectedIdJson = JSON.stringify(selectedId);
  const boundsArray = getLeafletBounds(bounds);
  const boundsJson = JSON.stringify(boundsArray);
  const layersJson = JSON.stringify(Object.fromEntries(
    Object.entries(TILE_LAYERS).map(([id, info]) => [id, { ...info, serverZoom: tileServerZoom(info) }]),
  ));
  const centerJson = JSON.stringify([MAP_CENTER.lat, MAP_CENTER.lng]);
  const userLocJson = JSON.stringify(userLocation);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Plant Map</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&family=Nunito:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #e3eed8;
      font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    #map {
      width: 100%;
      height: 100%;
      background: #e3eed8;
    }

    /* Plant Markers */
    .custom-pin-wrap {
      background: transparent !important;
      border: none !important;
    }
    .pin-container {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .pin-body {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2.5px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
      background-color: var(--pin-color, #2f7a3c);
      transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease;
    }
    .pin-container.selected .pin-body {
      width: 18px;
      height: 18px;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 4px rgba(47, 122, 60, 0.45), 0 4px 10px rgba(0, 0, 0, 0.5);
      transform: scale(1.15);
      z-index: 1000;
    }
    .pulse-ring {
      display: none;
      position: absolute;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 2px solid var(--pin-color, #2f7a3c);
      opacity: 0.8;
      pointer-events: none;
      animation: pulseAnim 1.6s infinite ease-out;
    }
    .pin-container.selected .pulse-ring {
      display: block;
    }
    @keyframes pulseAnim {
      0% { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(1.7); opacity: 0; }
    }

    /* Marker Clustering (CTIP-70) */
    .daun-cluster-wrap {
      background: transparent !important;
      border: none !important;
    }
    .daun-cluster {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-family: "JetBrains Mono", monospace;
      font-weight: 700;
      font-size: 13px;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
      border: 2px solid rgba(255, 255, 255, 0.9);
      transition: transform 0.15s ease;
      cursor: pointer;
    }
    .daun-cluster:hover, .daun-cluster:active {
      transform: scale(1.1);
    }
    .daun-cluster-small {
      background: linear-gradient(135deg, #10b981, #059669);
    }
    .daun-cluster-medium {
      background: linear-gradient(135deg, #059669, #047857);
    }
    .daun-cluster-large {
      background: linear-gradient(135deg, #047857, #064e3b);
    }

    /* User Actual Location Marker */
    .user-loc-wrap {
      background: transparent !important;
      border: none !important;
    }
    .user-loc-container {
      position: relative;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-loc-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #1c7ed6;
      border: 2.5px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
      z-index: 2;
    }
    .user-loc-pulse {
      position: absolute;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(28, 126, 214, 0.28);
      border: 1.5px solid rgba(28, 126, 214, 0.6);
      pointer-events: none;
      animation: userPulseAnim 2s infinite ease-out;
    }
    @keyframes userPulseAnim {
      0% { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.4); opacity: 0; }
    }

    /* Floating Controls Aligned to Project Style */
    .map-tools {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 1000;
      display: flex;
      gap: 8px;
      pointer-events: auto;
    }
    .tool-btn {
      height: 36px;
      padding: 0 14px;
      border-radius: 999px;
      background: #ffffff;
      border: 1px solid #d4e0c9;
      color: #15301f;
      font-family: "Nunito", sans-serif;
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(21, 48, 31, 0.12);
      cursor: pointer;
      backdrop-filter: blur(6px);
      transition: background 120ms ease, transform 120ms ease, border-color 120ms ease;
    }
    .tool-btn:hover {
      background: #f8faf4;
      border-color: #2f7a3c;
    }
    .tool-btn:active {
      transform: scale(0.96);
    }
    .tool-btn.active {
      background: #2f7a3c;
      color: #ffffff;
      border-color: #2f7a3c;
    }
    .tool-btn.active svg {
      stroke: #ffffff;
    }
    .tool-btn svg {
      stroke: currentColor;
      flex-shrink: 0;
    }

    /* Leaflet Attribution */
    .leaflet-control-attribution {
      font-family: "JetBrains Mono", monospace !important;
      font-size: 10px !important;
      background: rgba(255, 255, 255, 0.85) !important;
      color: #5b7461 !important;
      padding: 2px 8px !important;
      border-top-left-radius: 6px;
    }
    .leaflet-control-attribution a {
      color: #4a6652 !important;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  ${showControls ? `
  <div class="map-tools">
    <button id="locateBtn" class="tool-btn" type="button" aria-label="Show my location">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="2" x2="5" y1="12" y2="12"></line>
        <line x1="19" x2="22" y1="12" y2="12"></line>
        <line x1="12" x2="12" y1="2" y2="5"></line>
        <line x1="12" x2="12" y1="19" y2="22"></line>
        <circle cx="12" cy="12" r="7"></circle>
      </svg>
      <span id="locateLabel">Locate</span>
    </button>
    <button id="layerToggleBtn" class="tool-btn" type="button" aria-label="Toggle satellite view">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"></path>
        <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"></path>
        <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"></path>
      </svg>
      <span id="layerLabel">Satellite</span>
    </button>
    <button id="recenterBtn" class="tool-btn" type="button" aria-label="Fit to park bounds">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
      </svg>
      <span>Park</span>
    </button>
  </div>
  ` : ""}

  <script>
    (function() {
      var layers = ${layersJson};
      var initialBounds = ${boundsJson};
      var center = ${centerJson};
      var interactive = ${interactive};
      var selectedId = ${selectedIdJson};
      var currentLayerId = ${JSON.stringify(initialLayer)};
      var points = ${pointsJson};
      var userLoc = ${userLocJson};

      var map = L.map('map', {
        maxZoom: ${MAX_ZOOM},
        zoomControl: false,
        attributionControl: interactive,
        dragging: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
        scrollWheelZoom: interactive,
        boxZoom: interactive,
        tapHold: false,
      });

      if (interactive) {
        L.control.zoom({ position: 'bottomright' }).addTo(map);
      }

      function hasCoords(pt) { return pt.lat != null && pt.lng != null; }
      function protectedSpots() {
        return points.filter(function(pt) { return pt.protect && hasCoords(pt); });
      }

      // Same class as DetailTiles in the website's LeafletMap.jsx: a view near a protected
      // plant never asks for a close-up (see the note on threat T19 in mapConfig.js).
      var DetailTiles = L.TileLayer.extend({
        _deepest: function(center, zoom) {
          var opts = this.options;
          var mid = map.project(center, zoom);
          // From the middle to a corner, plus one tile: a tile on the screen's edge sticks out past it.
          var corner = mid.add(map.getSize().divideBy(2)).add([256, 256]);
          var screen = map.distance(map.unproject(mid, zoom), map.unproject(corner, zoom));
          var near = protectedSpots().some(function(pt) {
            return map.distance(center, [pt.lat, pt.lng]) < ${PROTECTED_REACH_M} + screen;
          });
          return (near ? Math.min(opts.serverZoom, ${PROTECTED_TILE_ZOOM}) : opts.serverZoom) - opts.zoomOffset;
        },
        _setView: function(center, zoom, noPrune, noUpdate) {
          this.options.maxNativeZoom = this._deepest(center, zoom);
          L.TileLayer.prototype._setView.call(this, center, zoom, noPrune, noUpdate);
        },
        _update: function(center) {
          if (center === undefined && this._map && !map._animatingZoom && this._deepest(map.getCenter(), map.getZoom()) !== this.options.maxNativeZoom) {
            return this._setView(map.getCenter(), map.getZoom());
          }
          return L.TileLayer.prototype._update.call(this, center);
        },
      });

      var currentTileLayer = null;
      function setTileLayer(layerId) {
        if (currentTileLayer) {
          map.removeLayer(currentTileLayer);
        }
        var info = layers[layerId] || layers.osm;
        var zoomOffset = window.devicePixelRatio >= ${HD_SCREEN_RATIO} ? 1 : 0;
        currentTileLayer = new DetailTiles(info.url, {
          maxZoom: ${MAX_ZOOM},
          serverZoom: info.serverZoom,
          maxNativeZoom: info.serverZoom - zoomOffset,
          zoomOffset: zoomOffset,
          tileSize: zoomOffset ? 128 : 256,
          attribution: info.attribution || '',
          subdomains: info.subdomains || 'abc',
        }).addTo(map);
        currentLayerId = layerId;

        var labelEl = document.getElementById('layerLabel');
        var btnEl = document.getElementById('layerToggleBtn');
        if (labelEl && btnEl) {
          if (layerId === 'satellite') {
            labelEl.textContent = 'Map';
            btnEl.classList.add('active');
          } else {
            labelEl.textContent = 'Satellite';
            btnEl.classList.remove('active');
          }
        }
      }

      setTileLayer(currentLayerId);

      if (initialBounds && initialBounds.length === 2) {
        map.fitBounds(initialBounds, { padding: [24, 24], maxZoom: 16 });
      } else {
        map.setView(center, ${DEFAULT_ZOOM});
      }

      // Markers layer group with clustering support (CTIP-70)
      var markersGroup = typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({
            showCoverageOnHover: false,
            maxClusterRadius: 40,
            // Handled below: a tap zooms in, then lists the plants once zoomed far enough.
            zoomToBoundsOnClick: false,
            spiderfyOnMaxZoom: false,
            disableClusteringAtZoom: ${PLANT_ZOOM},
            iconCreateFunction: function(cluster) {
              var count = cluster.getChildCount();
              var size = count < 10 ? 'small' : count < 30 ? 'medium' : 'large';
              return L.divIcon({
                html: '<div class="daun-cluster daun-cluster-' + size + '"><span>' + count + '</span></div>',
                className: 'daun-cluster-wrap',
                iconSize: [36, 36],
                iconAnchor: [18, 18],
              });
            },
          }).addTo(map)
        : L.layerGroup().addTo(map);

      markersGroup.on('clusterclick', function(e) {
        var kids = e.layer.getAllChildMarkers().map(function(m) { return m.options.point; });
        var box = e.layer.getBounds();
        var oneSpot = box.getNorthEast().distanceTo(box.getSouthWest()) < 2; // metres
        var cannotZoomIn = map.getBoundsZoom(box) <= map.getZoom();
        if (oneSpot || cannotZoomIn || map.getZoom() >= ${LIST_ZOOM}) {
          sendToHost({ type: 'SELECT_PLANT', id: kids[0].id, qr_id: kids[0].qr_id, ids: kids.map(function(k) { return k.id; }) });
        } else {
          e.layer.zoomToBounds({ padding: [40, 40] });
        }
      });

      map.on('click', function(e) {
        sendToHost({ type: 'MAP_CLICK', lat: e.latlng.lat, lng: e.latlng.lng });
      });

      function createIcon(pt, isSelected) {
        var color = pt.color || '#2f7a3c';
        var html = '<div class="pin-container ' + (isSelected ? 'selected' : '') + '" style="--pin-color: ' + color + ';">' +
          '<div class="pulse-ring"></div>' +
          '<div class="pin-body"></div>' +
        '</div>';
        return L.divIcon({
          className: 'custom-pin-wrap',
          html: html,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
      }

      // Pins this close (about a metre) are one spot: a hand-held GPS cannot tell them apart.
      function spotKey(pt) { return pt.lat.toFixed(5) + ',' + pt.lng.toFixed(5); }

      // Not animated unless asked: a pin tapped during the zoom would be replaced under the finger.
      function fitToPoints(animate) {
        var spots = points.filter(hasCoords).map(function(pt) { return [pt.lat, pt.lng]; });
        if (!spots.length) return;
        if (spots.length === 1) map.setView(spots[0], ${PLANT_ZOOM}, { animate: !!animate });
        else map.fitBounds(spots, { padding: [48, 48], maxZoom: ${PLANT_ZOOM}, animate: !!animate });
      }

      function renderMarkers(moveView) {
        markersGroup.clearLayers();

        // Done before adding markers, or the clusters keep their grouping from the old zoom.
        if (moveView) {
          var chosen = points.filter(function(pt) { return hasCoords(pt) && (pt.id === selectedId || pt.qr_id === selectedId); })[0];
          if (chosen) map.setView([chosen.lat, chosen.lng], ${SELECTED_ZOOM}, { animate: false });
          else fitToPoints(false);
        }

        points.forEach(function(pt) {
          if (!hasCoords(pt)) return;
          var isSelected = (pt.id === selectedId || pt.qr_id === selectedId);
          var marker = L.marker([pt.lat, pt.lng], {
            icon: createIcon(pt, isSelected),
            title: pt.name + (pt.family ? ' (' + pt.family + ')' : ''),
            zIndexOffset: isSelected ? 1000 : 0,
            point: pt
          });

          if (interactive) {
            marker.on('click', function(e) {
              L.DomEvent.stopPropagation(e);
              var here = spotKey(pt);
              var ids = points.filter(function(o) { return hasCoords(o) && spotKey(o) === here; }).map(function(o) { return o.id; });
              sendToHost({ type: 'SELECT_PLANT', id: pt.id, qr_id: pt.qr_id, ids: ids });
              map.panTo([pt.lat, pt.lng], { animate: true, duration: 0.3 });
            });
          }

          markersGroup.addLayer(marker);
        });
      }

      function sendToHost(payload) {
        var str = JSON.stringify(payload);
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(str);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(payload, '*');
        }
      }

      renderMarkers();

      // User location handling
      var userMarker = null;
      var userCircle = null;

      function renderUserLocation(loc, panTo) {
        if (!loc || loc.lat == null || loc.lng == null) return;
        var latlng = [loc.lat, loc.lng];
        var accuracy = loc.accuracy || 15;

        if (!userMarker) {
          var userIcon = L.divIcon({
            className: 'user-loc-wrap',
            html: '<div class="user-loc-container"><div class="user-loc-pulse"></div><div class="user-loc-dot"></div></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          userMarker = L.marker(latlng, { icon: userIcon, zIndexOffset: 2000, title: 'Your Location' }).addTo(map);
          userCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#1c7ed6',
            fillColor: '#1c7ed6',
            fillOpacity: 0.12,
            weight: 1.5,
          }).addTo(map);
        } else {
          userMarker.setLatLng(latlng);
          if (userCircle) {
            userCircle.setLatLng(latlng);
            userCircle.setRadius(accuracy);
          }
        }

        if (panTo) {
          map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 0.7 });
        }

        var locateBtn = document.getElementById('locateBtn');
        if (locateBtn) {
          locateBtn.classList.add('active');
        }
      }

      if (userLoc) {
        renderUserLocation(userLoc, false);
      }

      // Control button events
      var locateBtn = document.getElementById('locateBtn');
      if (locateBtn) {
        locateBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          sendToHost({ type: 'REQUEST_LOCATION' });
          if (navigator.geolocation && (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage)) {
            navigator.geolocation.getCurrentPosition(function(pos) {
              renderUserLocation({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              }, true);
            }, function(err) {
              console.warn('Geolocation error:', err);
            }, { enableHighAccuracy: true });
          }
        });
      }

      var layerBtn = document.getElementById('layerToggleBtn');
      if (layerBtn) {
        layerBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var next = currentLayerId === 'osm' ? 'satellite' : 'osm';
          setTileLayer(next);
          sendToHost({ type: 'LAYER_CHANGED', layer: next });
        });
      }

      var recenterBtn = document.getElementById('recenterBtn');
      if (recenterBtn) {
        recenterBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          if (initialBounds) {
            map.fitBounds(initialBounds, { padding: [24, 24], animate: true });
          }
        });
      }

      // Receive updates from React / React Native host
      window.handleIncoming = function(msg) {
        try {
          var data = typeof msg === 'string' ? JSON.parse(msg) : msg;
          if (!data || !data.type) return;

          if (data.type === 'SET_SELECTED') {
            selectedId = data.id;
            renderMarkers();
          } else if (data.type === 'UPDATE_POINTS') {
            points = data.points || [];
            if (data.selectedId !== undefined) selectedId = data.selectedId;
            // Before the view moves, so a close-up of a protected plant never asks for detailed tiles.
            currentTileLayer._update();
            renderMarkers(!!data.fit);
          } else if (data.type === 'SET_INSET') {
            // The app's own card covers the bottom of the map: keep the zoom buttons and map credit above it.
            Array.prototype.forEach.call(document.querySelectorAll('.leaflet-bottom'), function(el) {
              el.style.bottom = data.bottom + 'px';
            });
          } else if (data.type === 'FIT_POINTS') {
            fitToPoints(true);
          } else if (data.type === 'SET_LAYER') {
            setTileLayer(data.layer);
          } else if (data.type === 'FIT_BOUNDS') {
            map.fitBounds(initialBounds, { padding: [24, 24], animate: true });
          } else if (data.type === 'SET_USER_LOCATION') {
            renderUserLocation(data.location, data.panTo !== false);
          }
        } catch (err) {}
      };

      window.addEventListener('message', function(e) { window.handleIncoming(e.data); });
      document.addEventListener('message', function(e) { window.handleIncoming(e.data); });
    })();
  </script>
</body>
</html>`;
}
