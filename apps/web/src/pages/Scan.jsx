// apps/web/src/pages/Scan.jsx
// Public and staff QR code scanner and tag locator.
import { useState, useEffect, useRef } from "react";
import Icon from "../components/Icon.jsx";
import { Chip, Mono } from "../components/Bits.jsx";
import { useStore } from "../../../shared/store.js";
import { can } from "../../../shared/permissions.js";

export function extractTag(raw) {
  const match = String(raw || "").toUpperCase().match(/NIAH-\d{4}/);
  return match ? match[0] : String(raw || "").trim().toUpperCase();
}

export default function Scan() {
  const { db, role, notify } = useStore();
  const [tagInput, setTagInput] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const animFrameRef = useRef(null);

  const canAdd = can(role, "add");

  const publishedPlants = (db.plants || []).filter((p) => !p.is_deleted && p.qr_id);
  const sampleTags = publishedPlants.slice(0, 6);

  const navigateToTag = (tagId) => {
    const clean = extractTag(tagId);
    if (!clean) {
      notify("Please enter a valid tag ID (e.g. NIAH-0001)");
      return;
    }
    const found = publishedPlants.find((p) => p.qr_id.toUpperCase() === clean);
    if (found) {
      window.location.hash = `#/tag/${clean}`;
    } else {
      const unusedTag = (db.tags || []).find((t) => t.qr_id.toUpperCase() === clean);
      if (unusedTag && unusedTag.status === "unused" && canAdd) {
        window.location.hash = `#/add/${clean}`;
      } else {
        window.location.hash = `#/tag/${clean}`;
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    navigateToTag(tagInput);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not supported by your browser. Please enter the tag code manually.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      if ("BarcodeDetector" in window) {
        detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
        scanFrames();
      }
    } catch (err) {
      console.warn("[Scan] Camera permission error:", err);
      setCameraError("Unable to access camera. Please allow camera permissions or enter the tag code manually.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const scanFrames = async () => {
    if (!videoRef.current || !detectorRef.current || !cameraActive) return;
    try {
      const barcodes = await detectorRef.current.detect(videoRef.current);
      if (barcodes && barcodes.length > 0) {
        const detected = barcodes[0].rawValue;
        const tag = extractTag(detected);
        if (tag) {
          stopCamera();
          navigateToTag(tag);
          return;
        }
      }
    } catch (err) {
      // frame decode error or busy, ignore
    }
    animFrameRef.current = requestAnimationFrame(scanFrames);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="prose" style={{ maxWidth: 680, margin: "0 auto" }}>
      <header className="pagehead">
        <span className="eyebrow">Field Tag Reader</span>
        <h1>Scan Plant QR Tag</h1>
        <p className="mute">
          Scan the weatherproof QR tag attached to any plant in Niah National Park, or enter the tag ID manually.
        </p>
      </header>

      <section className="glass pad" style={{ marginBottom: "var(--s-5)" }}>
        <h2 style={{ fontSize: "var(--t-title3-size)", marginBottom: "var(--s-3)" }}>
          <Icon name="search" size={20} /> Enter Tag Code
        </h2>
        <form onSubmit={handleSubmit} className="bigsearch" style={{ maxWidth: "100%" }}>
          <label className="search" style={{ flex: 1 }}>
            <Icon name="qr" size={20} />
            <span className="sr">Tag ID</span>
            <input
              type="search"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. NIAH-0001"
              autoFocus
            />
          </label>
          <button className="btn" type="submit">Open Plant</button>
        </form>

        {sampleTags.length > 0 && (
          <div style={{ marginTop: "var(--s-4)" }}>
            <span className="mute" style={{ fontSize: "var(--t-small-size)", display: "block", marginBottom: 8 }}>
              Try a sample tag from published plants:
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sampleTags.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pill"
                  onClick={() => navigateToTag(p.qr_id)}
                  title={`Open ${p.name || p.species?.name || p.qr_id}`}
                >
                  <Mono>{p.qr_id}</Mono>
                  {p.name ? <span className="mute">({p.name})</span> : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="glass pad" style={{ marginBottom: "var(--s-5)", textAlign: "center" }}>
        <h2 style={{ fontSize: "var(--t-title3-size)", marginBottom: "var(--s-2)" }}>
          <Icon name="camera" size={20} /> Scan with Camera
        </h2>
        <p className="mute" style={{ marginBottom: "var(--s-4)" }}>
          Hold your device camera up to the QR code tag on the tree or specimen.
        </p>

        {cameraError && (
          <p className="banner banner-warn" style={{ marginBottom: "var(--s-4)", textAlign: "left" }}>
            {cameraError}
          </p>
        )}

        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 420,
            aspectRatio: "1 / 1",
            margin: "0 auto var(--s-4)",
            borderRadius: "var(--r-card)",
            overflow: "hidden",
            background: "var(--sunken)",
            border: "2px dashed var(--line)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: cameraActive ? "block" : "none",
            }}
          />
          {!cameraActive && (
            <div style={{ padding: "var(--s-4)" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "var(--acc-soft)",
                  color: "var(--acc)",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto var(--s-3)",
                }}
              >
                <Icon name="qr" size={36} />
              </div>
              <p className="mute" style={{ margin: 0 }}>Camera is off</p>
            </div>
          )}

          {cameraActive && (
            <div
              style={{
                position: "absolute",
                top: "20%",
                left: "20%",
                right: "20%",
                bottom: "20%",
                border: "2px solid var(--acc)",
                borderRadius: 12,
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
          {!cameraActive ? (
            <button className="btn" type="button" onClick={startCamera}>
              <Icon name="camera" size={18} /> Start Camera
            </button>
          ) : (
            <button className="btn ghost" type="button" onClick={stopCamera}>
              <Icon name="x" size={18} /> Stop Camera
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
