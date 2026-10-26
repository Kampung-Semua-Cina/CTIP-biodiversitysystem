// apps/web/src/components/LeafletMap.jsx
// Leaflet + OpenStreetMap map view for React (Web).
// Aligned to the Daun design system with Lucide line icons and live user location tracking.
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Icon from "./Icon.jsx";
import {
  MAP_BOUNDS,
  MAP_CENTER,
  DEFAULT_ZOOM,
  TILE_LAYERS,
  getLeafletBounds,
} from "../../../shared/mapConfig.js";

export default function LeafletMap({
  points = [],
  selectedId = null,
  onSelect,
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
    const layerInfo = TILE_LAYERS[initialLayer] || TILE_LAYERS.osm;
    const tileLayer = L.tileLayer(layerInfo.url, {
      maxZoom: layerInfo.maxZoom || 19,
      attribution: layerInfo.attribution || "",
      subdomains: layerInfo.subdomains || "abc",
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Markers layer group
    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

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
    const layerInfo = TILE_LAYERS[layerId] || TILE_LAYERS.osm;
    tileLayerRef.current = L.tileLayer(layerInfo.url, {
      maxZoom: layerInfo.maxZoom || 19,
      attribution: layerInfo.attribution || "",
      subdomains: layerInfo.subdomains || "abc",
    }).addTo(map);
    setCurrentLayer(layerId);
  };

  // Sync Markers when points or selectedId change
  useEffect(() => {
    const map = mapRef.current;
    const group = markersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    points.forEach((pt) => {
      if (pt.lat == null || pt.lng == null) return;
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
      });

      if (interactive && onSelect) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSelect(pt.id, pt.qr_id);
          map.panTo([pt.lat, pt.lng], { animate: true, duration: 0.3 });
        });
      }

      group.addLayer(marker);
    });
  }, [points, selectedId, interactive, onSelect]);

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
      alert("Geolocation is not supported by your browser");
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
        height,
        width: "100%",
        borderRadius: "var(--r-card, 14px)",
        overflow: "hidden",
        border: "1px solid var(--line)",
      }}
    >
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

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
