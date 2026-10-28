// apps/mobile/components/Logo.js
// Exact Daun Sense brand logo (apps/web/public/logo.svg) rendered with react-native-svg.
import React from 'react';
import Svg, { Rect, Path, G } from 'react-native-svg';

export default function Logo({ size = 32, style }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      accessibilityLabel="Daun Sense logo"
      style={style}
    >
      {/* Background rounded rectangle */}
      <Rect
        width="120"
        height="120"
        rx="28"
        ry="28"
        fill="#294f33"
      />

      {/* Scan corners: the "sense" ground-truthing mark */}
      <G
        fill="none"
        stroke="#e9f7c8"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      >
        <Path d="M22 38V28a6 6 0 0 1 6-6h10" />
        <Path d="M82 22h10a6 6 0 0 1 6 6v10" />
        <Path d="M98 82v10a6 6 0 0 1-6 6H82" />
        <Path d="M38 98H28a6 6 0 0 1-6-6V82" />
      </G>

      {/* Leaf */}
      <Path
        d="M 35.217939,86.207523 C 27.950965,54.267092 51.766415,32.067446 85.781931,33.783456 88.065781,67.765569 68.23349,87.931884 35.217939,86.207523 Z"
        fill="#d6f093"
      />

      {/* Midrib */}
      <Path
        d="M38 83C52 66 66 52 80 40"
        fill="none"
        stroke="#0b3322"
        strokeWidth="2.6"
        strokeLinecap="round"
      />

      {/* Circuit veins */}
      <G
        fill="none"
        stroke="#0b3322"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      >
        <Path d="M 50.656076,67.487408 C 47.484414,63.932091 48.348335,54.524379 50.694686,51.201694" />
        <Path d="m 60.588801,56.939614 c -2.522038,-3.777843 -2.253682,-9.787875 0.03861,-12.347491" />
        <Path d="M 70,48.798738 C 68.376713,47.088022 68.846136,42.774771 70,41.23166" />
        <Path d="M 41.672355,77.845125 C 39.182019,74.97119 39.562317,69.676489 40.6864,65.523526" />
        <Path d="M 67.950649,68.319647 C 64.395332,71.491309 54.98762,70.627388 51.664935,68.281037" />
        <Path d="M 74.082391,57.769161 C 70.304548,60.291199 64.294516,60.022843 61.7349,57.730551" />
        <Path d="m 78.142287,49.284603 c -1.710716,1.623287 -6.023967,1.153864 -7.567078,0" />
        <Path d="m 55.065118,78.075569 c -2.87393,2.490336 -8.168632,2.110038 -12.321595,0.985955" />
      </G>
    </Svg>
  );
}
