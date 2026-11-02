// apps/web/src/components/LeafletMap.jsx
// Leaflet + OpenStreetMap map view for React (Web).
// Aligned to the Daun design system with Lucide line icons and live user location tracking.
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import Icon from "./Icon.jsx";
import { useStore } from "../../../shared/store.js";
import {
  MAP_BOUNDS,
  MAP_CENTER,
  DEFAULT_ZOOM,
  TILE_LAYERS,
  MAX_ZOOM,
  LIST_ZOOM,
  PLANT_ZOOM,
  SELECTED_ZOOM,
  PROTECTED_TILE_ZOOM,
  PROTECTED_REACH_M,
  HD_SCREEN_RATIO,
  tileServerZoom,
  getLeafletBounds,
} from "../../../shared/mapConfig.js";

// Chooses how deep to download at each view, so a view near a protected plant never
// asks for a close-up (see the note on threat T19 in mapConfig.js). Leaflet has no option
// for this, so it hooks the two internal steps every tile request goes through; both
// exist in the Leaflet 1.9 line. The same class is in mapHtml.js for the phone app.
const DetailTiles = L.TileLayer.extend({
  setProtected(spots) {
    this.options.protectedSpots = spots;
    if (this._map) this._update();
  },
  _deepest(center, zoom) {
    const { serverZoom, zoomOffset, protectedSpots } = this.options;
    const map = this._map;
    const mid = map.project(center, zoom);
    // From the middle to a corner, plus one tile: a tile on the screen's edge sticks out past it.
    const corner = mid.add(map.getSize().divideBy(2)).add([256, 256]);
    const screen = map.distance(map.unproject(mid, zoom), map.unproject(corner, zoom));
    const near = protectedSpots.some((spot) => map.distance(center, spot) < PROTECTED_REACH_M + screen);
    return (near ? Math.min(serverZoom, PROTECTED_TILE_ZOOM) : serverZoom) - zoomOffset;
  },
  _setView(center, zoom, noPrune, noUpdate) {
    this.options.maxNativeZoom = this._deepest(center, zoom);
    L.TileLayer.prototype._setView.call(this, center, zoom, noPrune, noUpdate);
  },
  _update(center) {
    const map = this._map;
    if (center === undefined && map && !map._animatingZoom && this._deepest(map.getCenter(), map.getZoom()) !== this.options.maxNativeZoom) {
      return this._setView(map.getCenter(), map.getZoom());
    }
    return L.TileLayer.prototype._update.call(this, center);
  },
});

const tileLayerFor = (layerId, protectedSpots) => {
  const info = TILE_LAYERS[layerId] || TILE_LAYERS.osm;
  const zoomOffset = window.devicePixelRatio >= HD_SCREEN_RATIO ? 1 : 0;
  return new DetailTiles(info.url, {
    maxZoom: MAX_ZOOM,
    serverZoom: tileServerZoom(info),
    maxNativeZoom: tileServerZoom(info) - zoomOffset,
    zoomOffset,
    tileSize: zoomOffset ? 128 : 256,
    protectedSpots,
    attribution: info.attribution || "",
    subdomains: info.subdomains || "abc",
  });
};

// Pins this close (about a metre) are one spot: a hand-held GPS cannot tell them apart.
const spotKey = (pt) => `${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}`;

const hasCoords = (pt) => pt.lat != null && pt.lng != null;

// A point's `protect` flag comes from isExactProtected() in mapConfig.js.
const protectedSpots = (pts) => pts.filter((pt) => pt.protect && hasCoords(pt)).map((pt) => [pt.lat, pt.lng]);

// Not animated unless asked: a pin clicked during the zoom would be replaced under the pointer.
function fitToPoints(map, pts, animate = false) {
  if (!map || !pts.length) return;
  const spots = pts.map((pt) => [pt.lat, pt.lng]);
  if (spots.length === 1) map.setView(spots[0], PLANT_ZOOM, { animate });
  else map.fitBounds(spots, { padding: [48, 48], maxZoom: PLANT_ZOOM, animate });
}

// onSelect(id, qr_id, ids): ids lists every plant at the spot or cluster that was chosen.
// fitKey: when it changes, the view moves to the current points (a new search or filter).
// onMapClick(lat, lng): for choosing a location by hand.
export default function LeafletMap({
  points = [],
  selectedId = null,
  onSelect,
  onMapClick,
  fitKey = "",
  bounds = MAP_BOUNDS,
  interactive = true,
  height = 440,
  className = "",
  showControls = true,
  initialLayer = "osm",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);
  const tileLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const userCircleRef = useRef(null);
  const watchIdRef = useRef(null);
  const readoutRef = useRef(null);
  const drawnRef = useRef(null); // what the markers show now, so an unchanged list is not redrawn
  const fittedRef = useRef(null); // the fitKey the view last moved for
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    pointsRef.current = points;
    onSelectRef.current = onSelect;
    onMapClickRef.current = onMapClick;
  });
  const { notify } = useStore();

  const [currentLayer, setCurrentLayer] = useState(initialLayer);
  const [userLoc, setUserLoc] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current) return;

    // Prevent duplicate initialization on same container
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      maxZoom: MAX_ZOOM,
      zoomControl: false,
      attributionControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: interactive,
    });
    mapRef.current = map;

    if (interactive) {
      L.control.zoom({ position: "bottomright" }).addTo(map);
    }

    // Set Initial Tile Layer
    tileLayerRef.current = tileLayerFor(initialLayer, protectedSpots(pointsRef.current)).addTo(map);
    drawnRef.current = null;
    fittedRef.current = null;

    // Markers layer group with clustering support (CTIP-70)
    const markersGroup = typeof L.markerClusterGroup === "function"
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          maxClusterRadius: 40,
          // Handled below: a click zooms in, then lists the plants once zoomed far enough.
          zoomToBoundsOnClick: false,
          spiderfyOnMaxZoom: false,
          disableClusteringAtZoom: PLANT_ZOOM,
          iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            const size = count < 10 ? "small" : count < 30 ? "medium" : "large";
            return L.divIcon({
              html: `<div class="daun-cluster daun-cluster-${size}"><span>${count}</span></div>`,
              className: "daun-cluster-wrap",
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            });
          },
        }).addTo(map)
      : L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    markersGroup.on("clusterclick", (e) => {
      const kids = e.layer.getAllChildMarkers().map((m) => m.options.point);
      const box = e.layer.getBounds();
      const oneSpot = box.getNorthEast().distanceTo(box.getSouthWest()) < 2; // metres
      const cannotZoomIn = map.getBoundsZoom(box) <= map.getZoom();
      if (onSelectRef.current && (oneSpot || cannotZoomIn || map.getZoom() >= LIST_ZOOM)) {
        onSelectRef.current(kids[0].id, kids[0].qr_id, kids.map((k) => k.id));
      } else {
        e.layer.zoomToBounds({ padding: [40, 40] });
      }
    });

    map.on("click", (e) => onMapClickRef.current?.(e.latlng.lat, e.latlng.lng));

    // Where the pointer is, and how far in the view is. Written straight to the
    // page: re-rendering React on every mouse move would be wasteful.
    const showReadout = (latlng) => {
      if (!readoutRef.current) return;
      const at = latlng ? `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}` : "Move over the map";
      readoutRef.current.textContent = `${at} · Zoom ${map.getZoom()}`;
    };
    map.on("mousemove", (e) => showReadout(e.latlng));
    map.on("mouseout zoomend", () => showReadout(null));

    // Initial Bounds
    const initialBounds = getLeafletBounds(bounds);
    if (initialBounds && initialBounds.length === 2) {
      map.fitBounds(initialBounds, { padding: [24, 24], maxZoom: 16 });
    } else {
      map.setView([MAP_CENTER.lat, MAP_CENTER.lng], DEFAULT_ZOOM);
    }

    // Leaflet needs an invalidateSize once rendered in layout
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch?.(watchIdRef.current);
        watchIdRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      markersGroupRef.current = null;
      tileLayerRef.current = null;
      userMarkerRef.current = null;
      userCircleRef.current = null;
    };
  }, [bounds, interactive, initialLayer]);

  // Handle Layer Switch
  const switchLayer = (layerId) => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = tileLayerFor(layerId, protectedSpots(pointsRef.current)).addTo(map);
    setCurrentLayer(layerId);
  };

  // Sync Markers when points or selectedId change
  useEffect(() => {
    const map = mapRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    // Before the view moves, so a close-up of a protected plant never asks for detailed tiles.
    tileLayerRef.current.setProtected(protectedSpots(points));

    const located = points.filter(hasCoords);
    const moveView = located.length > 0 && fittedRef.current !== fitKey;
    const drawn = JSON.stringify([points, selectedId]);
    if (drawnRef.current === drawn && !moveView) return;
    drawnRef.current = drawn;
    group.clearLayers();

    // Move the view once per fitKey, as soon as there is something to show: plants
    // may lie outside the park box, and new data must not move the map under the user.
    // Done before adding markers, or the clusters keep their grouping from the old zoom.
    if (moveView) {
      fittedRef.current = fitKey;
      const chosen = located.find((pt) => pt.id === selectedId || pt.qr_id === selectedId);
      if (chosen) map.setView([chosen.lat, chosen.lng], SELECTED_ZOOM, { animate: false });
      else fitToPoints(map, located);
    }

    located.forEach((pt) => {
      const isSelected = pt.id === selectedId || pt.qr_id === selectedId;
      const color = pt.color || "#2f7a3c";

      const html = `
        <div class="pin-container ${isSelected ? "selected" : ""}" style="--pin-color: ${color};">
          <div class="pulse-ring"></div>
          <div class="pin-body"></div>
        </div>
      `;

      const icon = L.divIcon({
        className: "custom-pin-wrap",
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([pt.lat, pt.lng], {
        icon,
        title: `${pt.name}${pt.family ? ` (${pt.family})` : ""}`,
        zIndexOffset: isSelected ? 1000 : 0,
        point: pt,
      });

      if (interactive) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (!onSelectRef.current) return;
          const here = spotKey(pt);
          const ids = pointsRef.current.filter((o) => hasCoords(o) && spotKey(o) === here).map((o) => o.id);
          onSelectRef.current(pt.id, pt.qr_id, ids);
          map.panTo([pt.lat, pt.lng], { animate: true, duration: 0.3 });
        });
      }

      group.addLayer(marker);
    });
  }, [points, selectedId, interactive, fitKey]);

  // User Location marker rendering
  const renderUserLocation = useCallback((loc, panTo = false) => {
    const map = mapRef.current;
    if (!map || !loc || loc.lat == null || loc.lng == null) return;

    const latlng = [loc.lat, loc.lng];
    const accuracy = loc.accuracy || 15;

    if (!userMarkerRef.current) {
      const userIcon = L.divIcon({
        className: "user-loc-wrap",
        html: `
          <div class="user-loc-container">
            <div class="user-loc-pulse"></div>
            <div class="user-loc-dot"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker(latlng, {
        icon: userIcon,
        zIndexOffset: 2000,
        title: "Your Location",
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family: var(--f-text); font-size: 13px; font-weight: 700; color: var(--ink);">
          Your Location
          <div style="font-family: var(--f-mono); font-size: 11px; font-weight: 500; color: var(--ink2); margin-top: 2px;">
            ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${Math.round(accuracy)}m)
          </div>
        </div>
      `);
      userMarkerRef.current = marker;

      const circle = L.circle(latlng, {
        radius: accuracy,
        color: "#1c7ed6",
        fillColor: "#1c7ed6",
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(map);
      userCircleRef.current = circle;
    } else {
      userMarkerRef.current.setLatLng(latlng);
      if (userCircleRef.current) {
        userCircleRef.current.setLatLng(latlng);
        userCircleRef.current.setRadius(accuracy);
      }
    }

    if (panTo) {
      map.flyTo(latlng, Math.max(map.getZoom(), 16), { duration: 0.7 });
    }
  }, []);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      notify("This browser cannot share its location");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setUserLoc(loc);
        renderUserLocation(loc, true);

        // Start continuous watch
        if (watchIdRef.current == null) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (watchPos) => {
              const liveLoc = {
                lat: watchPos.coords.latitude,
                lng: watchPos.coords.longitude,
                accuracy: watchPos.coords.accuracy,
              };
              setUserLoc(liveLoc);
              renderUserLocation(liveLoc, false);
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 10000 },
          );
        }
      },
      (err) => {
        setIsLocating(false);
        console.warn("Location error:", err);
        notify("Could not get your location. Check that location is allowed for this site.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const fitParkBounds = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mapRef.current) {
      mapRef.current.fitBounds(getLeafletBounds(bounds), { padding: [24, 24], animate: true });
    }
  };

  return (
    <div
      className={`leaflet-map-wrapper ${className}`}
      style={{
        position: "relative",
        zIndex: 1,
        isolation: "isolate",
        height,
        width: "100%",
        borderRadius: "var(--r-card, 14px)",
        overflow: "hidden",
        border: "1px solid var(--line)",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {showControls && <div className="map-readout" ref={readoutRef} aria-hidden="true">Move over the map</div>}

      {showControls && (
        <div
          className="map-tools"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 1000,
            display: "flex",
            gap: 8,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            className={`tool-btn ${userLoc ? "active" : ""}`}
            onClick={handleLocateMe}
            aria-label="Show my location"
            title="Locate me"
          >
            <Icon name="locate" size={15} />
            <span>{isLocating ? "Locating..." : "Locate Me"}</span>
          </button>
          <button
            type="button"
            className={`tool-btn ${currentLayer === "satellite" ? "active" : ""}`}
            onClick={() => switchLayer(currentLayer === "osm" ? "satellite" : "osm")}
            aria-label="Toggle satellite view"
            title="Switch map layer"
          >
            <Icon name="layers" size={15} />
            <span>{currentLayer === "osm" ? "Satellite" : "Map"}</span>
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={() => fitToPoints(mapRef.current, pointsRef.current.filter(hasCoords), true)}
            aria-label="Reset zoom to show every plant"
            title="Reset zoom to show every plant"
          >
            <Icon name="refresh" size={15} />
            <span>Reset zoom</span>
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={fitParkBounds}
            aria-label="Fit to park bounds"
            title="Recenter on park"
          >
            <Icon name="compass" size={15} />
            <span>Park</span>
          </button>
        </div>
      )}
    </div>
  );
}
