// apps/mobile/components/bits/charts.js
// Park map preview and sparkline sensor trend charts.
import React from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { useTheme } from '../Theme.js';
import { Txt } from './text.js';

// Simple park map: ground colour, a river and a trail, and plant dots (x, y from 0 to 1).
export function MiniMap({ height = 150, width = 350, dots = [], label, onPress, rounded = true }) {
  const { c } = useTheme();
  const w = width; // pass the real width for a full-screen map so dots line up with tap targets
  const h = height;

  const body = (
    <View style={{ height, borderRadius: rounded ? 14 : 0, overflow: 'hidden', backgroundColor: c.mapTile }}>
      <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <Path d={`M-10 ${h * 0.72} C 60 ${h * 0.55}, 120 ${h * 0.85}, 200 ${h * 0.62} S 330 ${h * 0.25}, 370 ${h * 0.4}`} fill="none" stroke={c.mapLine} strokeWidth={10} strokeLinecap="round" />
        <Path d={`M40 -10 C 70 ${h * 0.3}, 60 ${h * 0.65}, 110 ${h + 10}`} fill="none" stroke={c.mapLine} strokeWidth={4} strokeDasharray="2 8" strokeLinecap="round" />
        {dots.map((d, i) =>
          d.selected ? (
            <React.Fragment key={i}>
              <Circle cx={d.x * w} cy={d.y * h} r={22} fill={c.accent} fillOpacity={0.18} />
              <Circle cx={d.x * w} cy={d.y * h} r={9} fill={c.accent} stroke={c.surface} strokeWidth={3} />
            </React.Fragment>
          ) : (
            <Circle key={i} cx={d.x * w} cy={d.y * h} r={7} fill={d.color || c.accent} stroke={c.surface} strokeWidth={2.5} />
          ),
        )}
      </Svg>
      {label ? (
        <View style={{ position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.surface }}>
          <Txt v="caption" color={c.ink2}>{label}</Txt>
        </View>
      ) : null}
    </View>
  );

  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="Open map" onPress={onPress}>{body}</Pressable> : body;
}

// Line chart for sensor readings with a dashed limit line.
export function Spark({ values = [], limit, height = 64 }) {
  const { c } = useTheme();
  if (values.length < 2) return <Txt v="small" color={c.ink2}>No readings yet.</Txt>;

  const w = 320;
  const all = limit == null ? values : [...values, limit];
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const x = (i) => (i / (values.length - 1)) * w;
  const y = (v) => height - ((v - lo) / (hi - lo)) * height;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" accessibilityLabel={`Latest ${values[values.length - 1]}`}>
      {limit != null ? <Line x1="0" x2={w} y1={y(limit)} y2={y(limit)} stroke={c.danger} strokeWidth={1.5} strokeDasharray="4 4" /> : null}
      <Polyline points={pts} fill="none" stroke={c.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
