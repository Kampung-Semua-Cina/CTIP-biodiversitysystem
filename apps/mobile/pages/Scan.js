// apps/mobile/pages/Scan.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

import { useStore } from '../../shared/store.js';
import { plantView } from '../../shared/selectors.js';
import { COLORS, commonStyles } from '../components/Theme.js';

export default function MobileScan({ onNavigate }) {
  const { db, role, notify } = useStore();
  const [manualCode, setManualCode] = useState('');
  const [facing, setFacing] = useState('back');
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [pickedImageUri, setPickedImageUri] = useState(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);

  // Camera permissions hook
  const [permission, requestPermission] = useCameraPermissions();

  // Auto-request permission on mount if not yet requested
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const extractCode = (raw) => {
    if (!raw) return '';
    const trimmed = String(raw).trim();
    // Match NIAH-XXXX pattern inside URLs or text
    const match = trimmed.match(/NIAH-[0-9]{4}/i);
    if (match) {
      return match[0].toUpperCase();
    }
    return trimmed.toUpperCase();
  };

  const handleScanCode = (code) => {
    const cleanCode = extractCode(code);
    if (!cleanCode) {
      return notify('Please enter or scan a valid QR tag');
    }

    // Check if the QR code matches a registered plant
    const plant = db.plants.find((p) => p.qr_id.toUpperCase() === cleanCode);
    if (plant) {
      const pv = plantView(db, plant);
      notify(`Found ${cleanCode}: ${pv.name}`);
      // Open plant details on Dashboard
      onNavigate?.('dashboard', plant.qr_id);
      return;
    }

    // Check if it's an unused tag in the system
    const unusedTag = db.tags.find(
      (t) => t.qr_id.toUpperCase() === cleanCode && t.status === 'unused'
    );
    if (unusedTag) {
      if (role === 'botanist' || role === 'admin') {
        notify(`Unused tag ${cleanCode}. Opening registration form.`);
        onNavigate?.('add');
      } else {
        notify(`Tag ${cleanCode} is registered in stock but has not been bound to a plant yet.`);
      }
      return;
    }

    notify(`Tag "${cleanCode}" not found in Niah National Park database.`);
  };

  // Barcode scanned event from live camera
  const handleBarcodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);

    const detected = data || '';
    handleScanCode(detected);

    // Prevent immediate re-triggering for 2.5 seconds
    setTimeout(() => {
      setScanned(false);
    }, 2500);
  };

  // Switch between front and back camera
  const toggleFacing = () => {
    setFacing((cur) => (cur === 'back' ? 'front' : 'back'));
    setCameraError(null);
  };

  const handleMountError = (e) => {
    console.log('Camera error:', e);
    if (facing === 'back') {
      // Try front camera fallback (e.g. desktop webcam)
      setFacing('front');
    } else {
      setCameraError(e?.message || 'Unable to access device camera');
    }
  };

  // Launch gallery picker to select photo
  const handlePickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const uri = asset.uri;
        setPickedImageUri(uri);
        setAnalyzingImage(true);

        try {
          // Attempt QR scan from picked image URL
          if (typeof scanFromURLAsync === 'function') {
            const results = await scanFromURLAsync(uri, ['qr']);
            if (results && results.length > 0 && results[0]?.data) {
              const detected = results[0].data;
              setAnalyzingImage(false);
              handleScanCode(detected);
              return;
            }
          }
        } catch (scanErr) {
          console.log('Error scanning from URL:', scanErr);
        }

        setAnalyzingImage(false);
        notify('Photo loaded. Please enter or confirm the tag ID below.');
      }
    } catch (err) {
      console.log('Gallery picker error:', err);
      notify('Unable to access device gallery');
      setAnalyzingImage(false);
    }
  };

  return (
    <View style={commonStyles.card}>
      <Text style={commonStyles.heading}>Scan plant tag</Text>
      <Text style={commonStyles.mute}>
        Point your phone camera at a physical QR tag in Niah National Park or upload a photo from your
        gallery to view the plant profile.
        {role === 'visitor'
          ? ' Visitors can view full verified plant records.'
          : ' Staff can view plant records and edit photos.'}
      </Text>

      {/* Main Viewfinder - Displays actual camera feed directly without scan animation */}
      <View style={styles.viewfinderContainer}>
        {/* State 1: Permission still loading */}
        {!permission ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.statusText}>Starting camera...</Text>
          </View>
        ) : !permission.granted ? (
          /* State 2: Permission denied or not yet requested */
          <View style={styles.permissionBox}>
            <Text style={styles.permissionIcon}>📷</Text>
            <Text style={styles.permissionTitle}>Camera Access Required</Text>
            <Text style={styles.permissionText}>
              Allow camera access to scan physical QR tags in Niah National Park.
            </Text>
            <TouchableOpacity
              style={[commonStyles.btnPrimary, { marginTop: 14, width: '100%' }]}
              onPress={requestPermission}
            >
              <Text style={commonStyles.btnPrimaryText}>Grant Camera Permission</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.galleryFallbackBtn, { marginTop: 10, width: '100%' }]}
              onPress={handlePickFromGallery}
            >
              <Text style={styles.galleryFallbackText}>🖼️ Choose Photo from Gallery</Text>
            </TouchableOpacity>
          </View>
        ) : cameraError ? (
          /* State 3: Camera hardware or mount error */
          <View style={styles.permissionBox}>
            <Text style={styles.permissionIcon}>⚠️</Text>
            <Text style={styles.permissionTitle}>Camera View Unavailable</Text>
            <Text style={styles.permissionText}>
              {cameraError}. You can upload an image from your device gallery or enter the tag ID manually.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, width: '100%' }}>
              <TouchableOpacity
                style={[styles.galleryFallbackBtn, { flex: 1 }]}
                onPress={toggleFacing}
              >
                <Text style={styles.galleryFallbackText}>🔄 Try Other Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[commonStyles.btnPrimary, { flex: 1 }]}
                onPress={handlePickFromGallery}
              >
                <Text style={commonStyles.btnPrimaryText}>🖼️ Pick Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* State 4: Real Live Camera View - direct feed with no artificial scan animations */
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing={facing}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              onMountError={handleMountError}
            />

            {/* Viewfinder Controls & Status Bar */}
            <View style={styles.hudOverlay} pointerEvents="box-none">
              {/* Top controls: torch toggle & camera flip */}
              <View style={styles.hudTopRow}>
                <View style={styles.liveIndicator}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE CAMERA</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.cameraControlBtn, torch && styles.cameraControlBtnActive]}
                    onPress={() => setTorch(!torch)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cameraControlText}>{torch ? '🔦 ON' : '💡 Torch'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cameraControlBtn}
                    onPress={toggleFacing}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cameraControlText}>🔄 Flip</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Bottom scan status hint */}
              <View style={styles.hudBottomRow}>
                <Text style={styles.hudHint}>
                  {scanned ? '✓ Tag detected! Opening...' : 'Point camera at plant QR code'}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Gallery Image Upload Option */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.galleryBtn}
          onPress={handlePickFromGallery}
          activeOpacity={0.8}
        >
          <Text style={styles.galleryBtnIcon}>🖼️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.galleryBtnTitle}>Upload image from gallery</Text>
            <Text style={styles.galleryBtnSub}>Select a captured photo of a park QR tag</Text>
          </View>
          <Text style={styles.galleryBtnArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Picked Image Preview if user selected a gallery image */}
      {pickedImageUri ? (
        <View style={styles.pickedImageCard}>
          <Image source={{ uri: pickedImageUri }} style={styles.pickedThumbnail} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.pickedImageTitle}>Selected Photo</Text>
            {analyzingImage ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={[styles.pickedImageDesc, { marginLeft: 6 }]}>Analyzing photo...</Text>
              </View>
            ) : (
              <Text style={styles.pickedImageDesc}>
                Photo loaded. Enter or confirm tag ID below to view plant.
              </Text>
            )}
            <TouchableOpacity
              style={styles.repickBtn}
              onPress={handlePickFromGallery}
            >
              <Text style={styles.repickBtnText}>Choose different photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Manual Tag Code Input */}
      <Text style={commonStyles.label}>Or enter QR tag ID:</Text>
      <View style={[commonStyles.row, { gap: 8 }]}>
        <TextInput
          style={[commonStyles.input, { flex: 1, marginVertical: 0 }]}
          value={manualCode}
          onChangeText={setManualCode}
          placeholder="e.g. NIAH-0001"
          placeholderTextColor="#688065"
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={commonStyles.btnPrimary}
          onPress={() => handleScanCode(manualCode)}
        >
          <Text style={commonStyles.btnPrimaryText}>Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewfinderContainer: {
    marginVertical: 14,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(155, 207, 106, 0.4)',
    backgroundColor: '#000',
    height: 380,
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  statusText: {
    color: COLORS.textMuted,
    marginTop: 10,
    fontSize: 13,
  },
  permissionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    width: '100%',
  },
  permissionIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  permissionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  permissionText: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  galleryFallbackBtn: {
    backgroundColor: '#16301e',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  galleryFallbackText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 80, 80, 0.4)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4d4f',
    marginRight: 6,
  },
  liveText: {
    color: '#ff4d4f',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cameraControlBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cameraControlBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  cameraControlText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  hudBottomRow: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(155, 207, 106, 0.35)',
  },
  hudHint: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    marginBottom: 12,
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#122618',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  galleryBtnIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  galleryBtnTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  galleryBtnSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  galleryBtnArrow: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
  },
  pickedImageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d2215',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  pickedThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#06130b',
  },
  pickedImageTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  pickedImageDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  repickBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  repickBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
