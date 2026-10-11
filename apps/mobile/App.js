// apps/mobile/App.js
import React, { useState, useRef, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  ScrollView,
  SafeAreaView,
  View,
  TouchableOpacity,
  Text,
  Modal,
  Platform,
  StatusBar as RNStatusBar,
  Dimensions,
  Animated,
  PanResponder,
  Pressable,
  BackHandler,
} from 'react-native';

import StoreProvider from '../shared/StoreProvider.js';
import { useStore } from '../shared/store.js';
import { can, staffLinks, ROLES, ROLE_LABEL } from '../shared/permissions.js';
import { SITE, PARK } from '../shared/site.js';

// Mobile Pages
import {
  MobileHome,
  MobileAbout,
  MobileContact,
  MobileStaff,
  MobileNoAccess,
  MobileNotFound,
} from './pages/Public.js';
import MobileScan from './pages/Scan.js';
import MobileLogin from './pages/Login.js';
import MobileDashboard from './pages/Dashboard.js';
import MobileMapPage from './pages/MapPage.js';
import MobileAddPlant from './pages/AddPlant.js';
import MobileRecords from './pages/Records.js';
import MobileReview from './pages/Review.js';
import MobileReports from './pages/Reports.js';
import MobileSpecies from './pages/Species.js';
import MobileMonitoring from './pages/Monitoring.js';
import { MobileUsers, MobileAudit } from './pages/Admin.js';
import MobileTags from './pages/Tags.js';
import MobileNotifications from './pages/Notifications.js';
import MobileDiscussion from './pages/Discussion.js';

import { COLORS } from './components/Theme.js';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 330);

const NEEDS = {
  add: 'add',
  records: 'records',
  review: 'review',
  reports: 'reports',
  species: 'species',
  monitoring: 'monitor',
  users: 'users',
  audit: 'audit',
  tags: 'tags',
  notifications: 'bell',
  discussion: 'discuss',
  // Note: 'scan' is NOT in NEEDS so even visitors can scan!
};

// Always the exact same 4 bottom buttons no matter the screen or access
const FIXED_BOTTOM_NAV = [
  { page: 'home', label: 'Home', icon: '🏠' },
  { page: 'scan', label: 'Scan', icon: '📷' },
  { page: 'dashboard', label: 'Plants', icon: '🌿' },
  { page: 'map', label: 'Map', icon: '🗺️' },
];

function MobileMain() {
  const { role, me, db, toast, setRole, logout } = useStore();
  const [route, setRoute] = useState({ page: 'home', arg: null });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const isDraggingRef = useRef(false);

  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // Handle Android hardware back press when drawer is open
  useEffect(() => {
    const onBackPress = () => {
      if (drawerOpen || drawerVisible) {
        closeDrawer();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [drawerOpen, drawerVisible]);

  const openDrawer = () => {
    setDrawerVisible(true);
    setDrawerOpen(true);
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setDrawerOpen(false);
      setDrawerVisible(false);
    });
  };

  const navigate = (page, arg = null) => {
    setRoute({ page, arg });
    if (drawerOpen || drawerVisible) {
      closeDrawer();
    }
  };

  // Edge PanResponder: Swipe from left edge (0-40px) to right smoothly follows finger in real-time
  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        isDraggingRef.current = true;
        setDrawerVisible(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          const currentX = Math.min(0, -DRAWER_WIDTH + gestureState.dx);
          drawerAnim.setValue(currentX);
          const progress = Math.max(0, Math.min(1, gestureState.dx / DRAWER_WIDTH));
          overlayAnim.setValue(progress);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        isDraggingRef.current = false;
        if (gestureState.dx > DRAWER_WIDTH * 0.25 || gestureState.vx > 0.3) {
          openDrawer();
        } else {
          closeDrawer();
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        closeDrawer();
      },
    })
  ).current;

  // Drawer PanResponder: Swiping left inside the drawer follows finger in real-time to slide closed
  const drawerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx < -10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        isDraggingRef.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          const currentX = Math.max(-DRAWER_WIDTH, gestureState.dx);
          drawerAnim.setValue(currentX);
          const progress = Math.max(0, Math.min(1, 1 + currentX / DRAWER_WIDTH));
          overlayAnim.setValue(progress);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        isDraggingRef.current = false;
        if (gestureState.dx < -DRAWER_WIDTH * 0.25 || gestureState.vx < -0.3) {
          closeDrawer();
        } else {
          // snap back open
          Animated.parallel([
            Animated.timing(drawerAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
            Animated.timing(overlayAnim, { toValue: 1, duration: 160, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        closeDrawer();
      },
    })
  ).current;

  const unread = me
    ? db.notifications.filter((n) => n.user_id === me.id && !n.is_read).length
    : 0;

  const currentPerm = NEEDS[route.page];
  const isAllowed = !currentPerm || can(role, currentPerm);

  const renderCurrentPage = () => {
    if (!isAllowed) {
      return <MobileNoAccess onNavigate={navigate} />;
    }

    switch (route.page) {
      case 'home':
        return <MobileHome park={PARK} onNavigate={navigate} />;
      case 'scan':
        return <MobileScan onNavigate={navigate} />;
      case 'about':
        return <MobileAbout site={SITE} park={PARK} />;
      case 'contact':
        return <MobileContact />;
      case 'staff':
        return <MobileStaff park={PARK} onNavigate={navigate} />;
      case 'login':
        return <MobileLogin onNavigate={navigate} />;
      case 'dashboard':
        return <MobileDashboard arg={route.arg} onNavigate={navigate} />;
      case 'map':
        return <MobileMapPage arg={route.arg} onNavigate={navigate} />;
      case 'add':
        return <MobileAddPlant onNavigate={navigate} />;
      case 'records':
        return <MobileRecords onNavigate={navigate} />;
      case 'review':
        return <MobileReview onNavigate={navigate} />;
      case 'reports':
        return <MobileReports onNavigate={navigate} />;
      case 'species':
        return <MobileSpecies onNavigate={navigate} />;
      case 'monitoring':
        return <MobileMonitoring onNavigate={navigate} />;
      case 'users':
        return <MobileUsers onNavigate={navigate} />;
      case 'audit':
        return <MobileAudit onNavigate={navigate} />;
      case 'tags':
        return <MobileTags onNavigate={navigate} />;
      case 'notifications':
        return <MobileNotifications onNavigate={navigate} />;
      case 'discussion':
        return <MobileDiscussion arg={route.arg} onNavigate={navigate} />;
      default:
        return <MobileNotFound onNavigate={navigate} />;
    }
  };

  const sLinks = staffLinks(role);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Application Bar - enlarged & accounts for notification shades */}
      <View style={styles.topBar}>
        {/* Left: Hamburger menu button */}
        <TouchableOpacity
          style={styles.menuIconBtn}
          onPress={openDrawer}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          activeOpacity={0.7}
        >
          <Text style={styles.menuIconText}>☰</Text>
        </TouchableOpacity>

        {/* Center: Brand Logo */}
        <TouchableOpacity
          style={styles.logoBtn}
          onPress={() => navigate('home')}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.8}
        >
          <Text style={styles.logoText}>🌿 {SITE}</Text>
        </TouchableOpacity>

        {/* Right side: Role Switcher Chip & Notification Bell on top right */}
        <View style={styles.topRight}>
          {/* Quick Role switcher chip */}
          <TouchableOpacity
            style={styles.roleChip}
            onPress={() => setRoleModalOpen(true)}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.roleChipText}>
              {ROLE_LABEL[role] || (role === 'visitor' ? 'Visitor' : role)}
            </Text>
          </TouchableOpacity>

          {/* Notification button/icon on top right - always visible */}
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigate('notifications')}
            hitSlop={{ top: 16, bottom: 16, left: 12, right: 16 }}
            activeOpacity={0.7}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.container}>
        {renderCurrentPage()}
      </ScrollView>

      {/* Left Edge Swipe Detection Strip to open drawer with thumb gesture */}
      <View style={styles.edgeSwipeStrip} {...edgePanResponder.panHandlers} />

      {/* Bottom Bar Navigation - Fixed 4 buttons (Home, Scan, Plants, Map) & extra padding for gesture bars */}
      <View style={styles.bottomNav}>
        {FIXED_BOTTOM_NAV.map((l) => {
          const isActive = route.page === l.page;

          return (
            <TouchableOpacity
              key={l.page}
              style={[styles.bottomTab, isActive && styles.bottomTabActive]}
              onPress={() => navigate(l.page)}
              hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <View style={styles.tabIconWrap}>
                <Text style={[styles.tabIconEmoji, isActive && styles.tabIconEmojiActive]}>
                  {l.icon}
                </Text>
              </View>
              <Text style={[styles.bottomTabText, isActive && styles.bottomTabTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Toast Notification Alert */}
      {toast ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      {/* Slide Drawer - Follows Finger in Real Time & Closes On Outside Tap */}
      {drawerVisible || drawerOpen ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
          {/* Full-Screen Dim Backdrop with Tap-Outside-To-Close */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeDrawer}
            accessibilityLabel="Tap outside to close sidebar"
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.drawerOverlay,
                { opacity: overlayAnim },
              ]}
            />
          </Pressable>

          {/* Animated Drawer Sheet Sliding from Left */}
          <Animated.View
            style={[
              styles.drawerSheet,
              {
                width: DRAWER_WIDTH,
                transform: [{ translateX: drawerAnim }],
              },
            ]}
            onStartShouldSetResponder={() => true}
            {...drawerPanResponder.panHandlers}
          >
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Menu</Text>
                <TouchableOpacity
                  onPress={closeDrawer}
                  style={styles.closeDrawerBtn}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  <Text style={styles.closeDrawerText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.drawerBody}>
                <Text style={styles.sectionHeader}>PUBLIC PAGES</Text>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('home')}>
                  <Text style={styles.drawerItemText}>🏠 Home</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('scan')}>
                  <Text style={styles.drawerItemText}>📷 Scan Plant QR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('dashboard')}>
                  <Text style={styles.drawerItemText}>🌿 Plant Library (Plants)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('map')}>
                  <Text style={styles.drawerItemText}>🗺️ Botanical Map</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('about')}>
                  <Text style={styles.drawerItemText}>ℹ️ About DaunSense</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('contact')}>
                  <Text style={styles.drawerItemText}>✉️ Contact SFC</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('staff')}>
                  <Text style={styles.drawerItemText}>🔐 Staff Area</Text>
                </TouchableOpacity>

                {sLinks.length > 0 && (
                  <>
                    <Text style={[styles.sectionHeader, { marginTop: 18 }]}>STAFF ACTIONS</Text>
                    {sLinks.map((sl) => {
                      const targetPage = sl.to.replace('/', '');
                      return (
                        <TouchableOpacity
                          key={sl.to}
                          style={styles.drawerItem}
                          onPress={() => navigate(targetPage)}
                        >
                          <Text style={styles.drawerItemStaffText}>• {sl.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* Staff Communication & Alerts */}
                <Text style={[styles.sectionHeader, { marginTop: 18 }]}>COMMUNICATION</Text>
                <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('notifications')}>
                  <Text style={styles.drawerItemStaffText}>
                    🔔 Notifications {unread > 0 ? `(${unread})` : ''}
                  </Text>
                </TouchableOpacity>
                {role !== 'visitor' && (
                  <TouchableOpacity style={styles.drawerItem} onPress={() => navigate('discussion')}>
                    <Text style={styles.drawerItemStaffText}>💬 Discussion Forum</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.drawerDivider} />

                {/* Demo Role Switcher */}
                <Text style={styles.sectionHeader}>VIEW APPLICATION AS</Text>
                <View style={styles.roleButtonsRow}>
                  {ROLES.map((r) => (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.roleSelectBtn, role === r.key && styles.roleSelectBtnActive]}
                      onPress={() => {
                        setRole(r.key);
                        closeDrawer();
                      }}
                    >
                      <Text
                        style={[
                          styles.roleSelectBtnText,
                          role === r.key && styles.roleSelectBtnTextActive,
                        ]}
                      >
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {role !== 'visitor' ? (
                  <TouchableOpacity
                    style={[styles.drawerItem, { marginTop: 16 }]}
                    onPress={() => {
                      logout();
                      navigate('home');
                    }}
                  >
                    <Text style={[styles.drawerItemText, { color: '#ff8787', fontWeight: '700' }]}>
                      🚪 Sign out
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.drawerItem, { marginTop: 16 }]}
                    onPress={() => navigate('login')}
                  >
                    <Text style={[styles.drawerItemText, { color: COLORS.primary, fontWeight: '700' }]}>
                      🔐 Staff Login
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </View>
      ) : null}

      {/* Role Switcher Dialog */}
      <Modal
        visible={roleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.roleModalOverlay}
          activeOpacity={1}
          onPress={() => setRoleModalOpen(false)}
        >
          <View style={styles.roleModalBox}>
            <Text style={styles.roleModalTitle}>Switch Demo Role</Text>
            <Text style={styles.roleModalSubtitle}>
              Test how different roles view and interact with the biodiversity system:
            </Text>

            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.roleChoiceItem, role === r.key && styles.roleChoiceItemActive]}
                onPress={() => {
                  setRole(r.key);
                  setRoleModalOpen(false);
                }}
              >
                <Text style={styles.roleChoiceIcon}>
                  {r.key === 'visitor' && '👁️'}
                  {r.key === 'botanist' && '🌿'}
                  {r.key === 'officer' && '📋'}
                  {r.key === 'admin' && '🛡️'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.roleChoiceLabel,
                      role === r.key && { color: COLORS.primary, fontWeight: '800' },
                    ]}
                  >
                    {r.label}
                  </Text>
                  <Text style={styles.roleChoiceDesc}>
                    {r.key === 'visitor' && 'Public plant library, safe maps, no editing.'}
                    {r.key === 'botanist' && 'Add plants, field records, and photo editing.'}
                    {r.key === 'officer' && 'Review queue, species management, monitoring.'}
                    {r.key === 'admin' && 'User management, sensor setup, audit logs.'}
                  </Text>
                </View>
                {role === r.key && <Text style={styles.checkIcon}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <MobileMain />
    </StoreProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a1a11',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 26) + 12 : 16,
    paddingBottom: 14,
    backgroundColor: '#122618',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    minHeight: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 26) + 58 : 66,
  },
  menuIconBtn: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconText: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 30,
  },
  logoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  logoText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleChip: {
    backgroundColor: '#183622',
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  roleChipText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  bellBtn: {
    position: 'relative',
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellIcon: {
    fontSize: 22,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  container: {
    padding: 14,
    paddingBottom: 120, // generous bottom padding to keep all content clear of the enlarged bottom nav
  },
  edgeSwipeStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 40,
    zIndex: 90,
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#122618',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 22, // protects against Android navigation buttons & iOS home bar
    paddingHorizontal: 8,
    minHeight: Platform.OS === 'ios' ? 84 : 76,
  },
  bottomTab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 6,
    minHeight: 46,
  },
  bottomTabActive: {
    borderTopWidth: 3,
    borderTopColor: COLORS.primary,
    marginTop: -3,
  },
  tabIconWrap: {
    position: 'relative',
    marginBottom: 2,
  },
  tabIconEmoji: {
    fontSize: 22,
    opacity: 0.7,
  },
  tabIconEmojiActive: {
    opacity: 1,
  },
  bottomTabText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  bottomTabTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  toastWrap: {
    position: 'absolute',
    bottom: 86,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(20, 48, 29, 0.95)',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 200,
  },
  toastText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  drawerSheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#122618',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 16,
    zIndex: 1000,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 26) + 14 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  drawerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  closeDrawerBtn: {
    padding: 8,
  },
  closeDrawerText: {
    color: COLORS.textMuted,
    fontSize: 22,
    fontWeight: '700',
  },
  drawerBody: {
    padding: 18,
    paddingBottom: 50,
  },
  sectionHeader: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  drawerItem: {
    paddingVertical: 11,
  },
  drawerItemText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  drawerItemStaffText: {
    color: '#bde09c',
    fontSize: 15,
    fontWeight: '600',
  },
  drawerDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  roleButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  roleSelectBtn: {
    backgroundColor: '#0a1a11',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  roleSelectBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleSelectBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  roleSelectBtnTextActive: {
    color: COLORS.textDark,
    fontWeight: '800',
  },
  roleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  roleModalBox: {
    backgroundColor: '#16301e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    width: '100%',
    maxWidth: 360,
  },
  roleModalTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  roleModalSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  roleChoiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a11',
    borderRadius: 10,
    padding: 10,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  roleChoiceItemActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(155, 207, 106, 0.12)',
  },
  roleChoiceIcon: {
    fontSize: 22,
  },
  roleChoiceLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  roleChoiceDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  checkIcon: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 16,
  },
});