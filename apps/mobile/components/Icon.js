// apps/mobile/components/Icon.js
// Line icons from Lucide, the same set the website uses (apps/web/src/components/Icon.jsx).
// 24px grid, 1.75 stroke. No emoji anywhere in the interface.
import React from 'react';
import {
  Activity, ArrowRight, Bell, Camera, ChartColumn, Check, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardCheck, Droplet, Ellipsis, Eye, EyeOff, FileText, Flashlight, House, Info, Keyboard, Leaf,
  Lock, LogOut, Mail, Map, MapPin, MessageSquare, Plus, QrCode, RefreshCw, ScanLine, Search, Send,
  Share2, Shield, Thermometer, Undo2, Users, X, Compass, Layers, Locate,
} from 'lucide-react-native';

const ICONS = {
  activity: Activity, arrowRight: ArrowRight, bell: Bell, camera: Camera, chart: ChartColumn, check: Check,
  chevD: ChevronDown, chevL: ChevronLeft, chevR: ChevronRight, clipboard: ClipboardCheck, drop: Droplet,
  more: Ellipsis, eye: Eye, eyeOff: EyeOff, file: FileText, torch: Flashlight, home: House, info: Info,
  keyboard: Keyboard, leaf: Leaf, lock: Lock, logout: LogOut, mail: Mail, map: Map, pin: MapPin,
  chat: MessageSquare, plus: Plus, qr: QrCode, refresh: RefreshCw, scan: ScanLine, search: Search,
  send: Send, share: Share2, shield: Shield, thermo: Thermometer, undo: Undo2, users: Users, x: X,
  compass: Compass, layers: Layers, locate: Locate,
};

export default function Icon({ name, size = 24, color, strokeWidth = 1.75 }) {
  const Cmp = ICONS[name] || Info;
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} />;
}
