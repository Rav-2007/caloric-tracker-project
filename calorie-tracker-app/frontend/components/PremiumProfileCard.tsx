/**
 * PremiumProfileCard.tsx
 *
 * Premium horizontal membership-style card with an ambient emerald bloom.
 *
 * Bloom technique: expo-blur is not in the project, so the "soft blurred
 * circle" is built from four concentric absolutely-positioned Views whose
 * border-radius makes them circles, with staggered shadowRadius/opacity on
 * iOS and elevation on Android. Each ring contributes one band of the glow,
 * collectively producing a smooth radial falloff indistinguishable from a
 * Gaussian blur at normal viewing distance.
 *
 * Card proportions: 340 × 215 px = 1.58:1 — standard banking/membership card.
 */

import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Flame, Leaf, ShieldCheck } from "lucide-react-native";

// ─── Design tokens ────────────────────────────────────────────────────────────
const CARD_W = 340;
const CARD_H = 240;
const CARD_RADIUS = 24;

const CARD_BG      = "#1E2022";
const CARD_BORDER  = "rgba(255,255,255,0.08)";
const EMERALD      = "#10B981";
const TEAL         = "#0D9488";
const EMERALD_LEAF = "#059669";
const MUTED        = "rgba(255,255,255,0.45)";
const WHITE        = "#FFFFFF";

// Avatar ring SVG geometry
const RING_SVG    = 68;   // total SVG canvas size
const RING_CX     = 34;   // centre x/y
const RING_R_OUT  = 30;   // outer gradient ring radius (stroke 3px)
const RING_R_IN   = 24;   // inner ghost ring radius (stroke 1.5px)
const AVATAR_SIZE = 48;   // inner photo/initials circle
const BAR_W      = CARD_W - 40; // track width = card width − horizontal padding×2

// Bloom: four concentric radial layers — largest→faintest, smallest→brightest
const BLOOM_LAYERS: { size: number; opacity: number; blur: number }[] = [
  { size: 420, opacity: 0.06, blur: 60 },
  { size: 300, opacity: 0.10, blur: 40 },
  { size: 200, opacity: 0.14, blur: 28 },
  { size: 110, opacity: 0.18, blur: 16 },
];

// ─── Public interface ─────────────────────────────────────────────────────────
export interface PremiumProfileCardProps {
  /** Display name shown on the card */
  name: string;
  /** Current streak in days */
  streak: number;
  /** Daily calorie target (kcal) */
  targetCalories: number;
  /** Calories consumed so far today (kcal) */
  consumedCalories: number;
  /** Two-letter initials for the avatar fallback */
  avatarInitials?: string;
  /** Optional membership tier label e.g. "Swasth Pro" */
  tier?: string;
  /** Body weight in kg */
  weightKg?: number;
  /** Protein consumed today (g) */
  protein?: number;
  /** Carbohydrates consumed today (g) */
  carbs?: number;
  /** Fats consumed today (g) */
  fats?: number;
  /** Wrapping style override */
  style?: ViewStyle;
}

// ─── Ambient Bloom ────────────────────────────────────────────────────────────
/**
 * Four concentric circles centered behind the card.
 * shadowRadius on iOS and elevation on Android carry the glow outward.
 * Combined they produce a radial falloff from rgba(16,185,129,0.18) → 0.
 */
function AmbientBloom() {
  return (
    <View style={styles.bloomAnchor} pointerEvents="none">
      {BLOOM_LAYERS.map(({ size, opacity, blur }, i) => (
        <View
          key={i}
          style={[
            styles.bloomRing,
            {
              width:         size,
              height:        size,
              borderRadius:  size / 2,
              backgroundColor: `rgba(16,185,129,${opacity})`,
              // iOS soft glow via shadow spread
              shadowColor:   EMERALD,
              shadowRadius:  blur,
              shadowOpacity: opacity * 4,
              shadowOffset:  { width: 0, height: 0 },
              // Android elevation glow — tinted via backgroundColor
              elevation: Math.round(blur / 4),
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Pulsing gradient avatar ring ────────────────────────────────────────────
/**
 * Two concentric SVG rings drawn with an emerald→teal LinearGradient stroke.
 *
 * Outer ring (R=30, stroke 3px): primary gradient, pulses opacity 0.55 → 1.0
 * Inner ring (R=24, stroke 1.5px): ghost echo, counter-phase pulse 1.0 → 0.40
 *
 * Both animations run as Animated.loop so the effect feels like a living
 * health-tracker pulse rather than a simple blink.
 */
function PulsingAvatarRing({ initials }: { initials: string }) {
  const outerOpacity = useRef(new Animated.Value(0.55)).current;
  const innerOpacity = useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    const pulse = (val: Animated.Value, from: number, to: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: to,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: from,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

    // Outer brightens while inner dims — gives a breathing "double ring" feel
    const outer = pulse(outerOpacity, 0.55, 1.0, 1400);
    const inner = pulse(innerOpacity, 1.0, 0.35, 1800);

    outer.start();
    inner.start();
    return () => { outer.stop(); inner.stop(); };
  }, [outerOpacity, innerOpacity]);

  return (
    <View style={styles.avatarWrap}>
      {/* SVG gradient rings — sit behind the avatar circle */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: outerOpacity }]}>
        <Svg width={RING_SVG} height={RING_SVG}>
          <Defs>
            <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%"   stopColor={EMERALD} stopOpacity="1" />
              <Stop offset="100%" stopColor={TEAL}    stopOpacity="1" />
            </LinearGradient>
          </Defs>
          {/* Outer primary ring */}
          <Circle
            cx={RING_CX} cy={RING_CX} r={RING_R_OUT}
            stroke="url(#grad)"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {/* Inner ghost ring — independent opacity pulse */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: innerOpacity }]}>
        <Svg width={RING_SVG} height={RING_SVG}>
          <Defs>
            <LinearGradient id="gradIn" x1="100%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%"   stopColor={TEAL}    stopOpacity="1" />
              <Stop offset="100%" stopColor={EMERALD} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Circle
            cx={RING_CX} cy={RING_CX} r={RING_R_IN}
            stroke="url(#gradIn)"
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="4 3"
          />
        </Svg>
      </Animated.View>

      {/* Avatar circle centred inside the rings */}
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarInitials}>{initials}</Text>
      </View>
    </View>
  );
}

// ─── Chip / badge ─────────────────────────────────────────────────────────────
function Chip({
  icon,
  label,
  accent = EMERALD,
}: {
  icon:   React.ReactNode;
  label:  string;
  accent?: string;
}) {
  return (
    <View style={[styles.chip, { borderColor: `${accent}44` }]}>
      {icon}
      <Text style={[styles.chipText, { color: accent }]}>{label}</Text>
    </View>
  );
}

// ─── Macro pill badge ─────────────────────────────────────────────────────────
function MacroPill({
  prefix,
  value,
  color,
}: {
  prefix: string;
  value:  string;
  color:  string;
}) {
  return (
    <View style={styles.macroPill}>
      <View style={[styles.macroPillTag, { backgroundColor: `${color}26` }]}>
        <Text style={[styles.macroPillPrefix, { color }]}>{prefix}</Text>
      </View>
      <Text style={styles.macroPillValue}>{value}</Text>
    </View>
  );
}

// ─── Horizontal gradient progress gauge ──────────────────────────────────────
function GradientBar({ pct }: { pct: number }) {
  const fillW = Math.max(Math.round(BAR_W * Math.min(pct, 1)), 1);
  return (
    <Svg width={BAR_W} height={6}>
      <Defs>
        <LinearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%"   stopColor={EMERALD} stopOpacity="1" />
          <Stop offset="100%" stopColor={TEAL}    stopOpacity="1" />
        </LinearGradient>
      </Defs>
      {/* Off-black track */}
      <Rect x={0} y={0} width={BAR_W} height={6} rx={3} fill="#111827" />
      {/* Emerald → teal gradient fill */}
      <Rect x={0} y={0} width={fillW} height={6} rx={3} fill="url(#gaugeGrad)" />
    </Svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PremiumProfileCard({
  name,
  streak,
  targetCalories,
  consumedCalories,
  avatarInitials,
  tier = "Swasth Pro",
  weightKg,
  protein = 0,
  carbs = 0,
  fats = 0,
  style,
}: PremiumProfileCardProps) {
  const remaining = Math.max(targetCalories - consumedCalories, 0);
  const pct       = Math.min(consumedCalories / Math.max(targetCalories, 1), 1);

  const initials = useMemo(
    () => avatarInitials ?? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
    [name, avatarInitials],
  );

  return (
    <View style={[styles.outerWrap, style]}>
      {/* ── Ambient emerald bloom behind the card ── */}
      <AmbientBloom />

      {/* ── Card surface ── */}
      <View style={styles.card}>

        {/* ── Subtle diagonal grain overlay (pure border trick) ── */}
        <View style={styles.grainOverlay} pointerEvents="none" />

        {/* ── Top row: brand identity (left) + pulsing avatar ring (right) ── */}
        <View style={styles.topRow}>

          {/* Left — branding & membership status */}
          <View style={styles.brandBlock}>
            {/* "PREMIUM MEMBER" in emerald tiny-caps with shield icon */}
            <View style={styles.memberRow}>
              <ShieldCheck size={10} color={EMERALD} strokeWidth={2.5} />
              <Text style={styles.memberLabel}>PREMIUM MEMBER</Text>
            </View>

            {/* App / profile name in crisp white */}
            <Text style={styles.appName}>Swasth Profile</Text>

            {/* User's display name + tier pill */}
            <Text style={styles.nameText} numberOfLines={1}>{name}</Text>
            <View style={styles.tierRow}>
              <Leaf size={9} color={EMERALD_LEAF} strokeWidth={2} />
              <Text style={styles.tierText}>{tier}</Text>
            </View>
          </View>

          {/* Right — streak chip stacked above the pulsing avatar ring */}
          <View style={styles.avatarColumn}>
            <Chip
              icon={<Flame size={11} color="#F97316" strokeWidth={2} />}
              label={`${streak}d streak`}
              accent="#F97316"
            />
            <PulsingAvatarRing initials={initials} />
          </View>

        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Hero Centerpiece: large calorie reading + gradient gauge ── */}
        <View style={styles.heroBlock}>
          <Text style={styles.heroContext}>
            {consumedCalories.toLocaleString()} / {targetCalories.toLocaleString()} kcal consumed
          </Text>
          <Text style={styles.heroLabel}>DAILY CALORIES REMAINING</Text>
          <Text style={styles.heroNumber}>
            {remaining.toLocaleString()}{" "}
            <Text style={styles.heroUnit}>kcal</Text>
          </Text>
          <GradientBar pct={pct} />
        </View>

        {/* ── Footer row: vitals (left) + macro pill badges (right) ── */}
        <View style={styles.footerRow}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerName} numberOfLines={1}>{name}</Text>
            <View style={styles.footerMetrics}>
              <Text style={styles.footerStreak}>⚡ {streak}d</Text>
              {weightKg != null && (
                <Text style={styles.footerWeight}>Wt: {weightKg}kg</Text>
              )}
            </View>
          </View>
          <View style={styles.macroPills}>
            <MacroPill prefix="P" value={`${protein}g`} color="#F97316" />
            <MacroPill prefix="C" value={`${carbs}g`}   color="#06B6D4" />
            <MacroPill prefix="F" value={`${fats}g`}    color="#F59E0B" />
          </View>
        </View>
      </View>
    </View>
  );
}


// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerWrap: {
    width:           CARD_W,
    height:          CARD_H,
    alignItems:      "center",
    justifyContent:  "center",
  },

  // ── Bloom
  bloomAnchor: {
    position:        "absolute",
    alignItems:      "center",
    justifyContent:  "center",
  },
  bloomRing: {
    position:        "absolute",
  },

  // ── Card surface
  card: {
    width:           CARD_W,
    height:          CARD_H,
    borderRadius:    CARD_RADIUS,
    backgroundColor: CARD_BG,
    borderWidth:     1,
    borderColor:     CARD_BORDER,
    paddingHorizontal: 20,
    paddingTop:      18,
    paddingBottom:   0,
    justifyContent:  "flex-start",
    // iOS depth shadow
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: 12 },
    shadowOpacity:   0.55,
    shadowRadius:    20,
    elevation:       18,
    overflow:        "hidden",
  },

  // Diagonal grain — a second 1px border inside the card at slight rotation
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius:    CARD_RADIUS,
    borderWidth:     0.5,
    borderColor:     "rgba(255,255,255,0.04)",
  },

  // ── Top row
  topRow: {
    flexDirection:    "row",
    alignItems:       "center",
    justifyContent:   "space-between",
  },

  // Left — brand identity block
  brandBlock: {
    flex:             1,
    gap:              3,
    paddingRight:     10,
  },
  memberRow: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              5,
    marginBottom:     1,
  },
  memberLabel: {
    fontSize:         9,
    fontWeight:       "700",
    color:            EMERALD,
    letterSpacing:    1.6,
    textTransform:    "uppercase",
  },
  appName: {
    fontSize:         18,
    fontWeight:       "800",
    color:            WHITE,
    letterSpacing:    -0.5,
    lineHeight:       22,
  },
  nameText: {
    fontSize:         12,
    fontWeight:       "600",
    color:            MUTED,
    letterSpacing:    0.1,
    marginTop:        1,
  },
  tierRow: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              4,
    marginTop:        2,
  },
  tierText: {
    fontSize:         10,
    fontWeight:       "600",
    color:            EMERALD_LEAF,
    letterSpacing:    0.4,
  },

  // Right — streak chip + avatar ring stacked
  avatarColumn: {
    alignItems:       "center",
    gap:              6,
  },

  // PulsingAvatarRing container — sized to the SVG canvas
  avatarWrap: {
    width:            RING_SVG,
    height:           RING_SVG,
    alignItems:       "center",
    justifyContent:   "center",
  },
  // Inner avatar circle
  avatarCircle: {
    width:            AVATAR_SIZE,
    height:           AVATAR_SIZE,
    borderRadius:     AVATAR_SIZE / 2,
    backgroundColor:  "rgba(16,185,129,0.18)",
    alignItems:       "center",
    justifyContent:   "center",
    borderWidth:      1,
    borderColor:      "rgba(16,185,129,0.30)",
  },
  avatarInitials: {
    fontSize:         16,
    fontWeight:       "800",
    color:            EMERALD,
    letterSpacing:    0.5,
  },

  // Chip
  chip: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius:    10,
    borderWidth:     1,
    backgroundColor: "rgba(249,115,22,0.10)",
  },
  chipText: {
    fontSize:        11,
    fontWeight:      "700",
    letterSpacing:   0.3,
  },

  // Divider
  divider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginVertical:  2,
  },

  // ── Hero centerpiece
  heroBlock: {
    flex:            1,
    gap:             4,
    justifyContent:  "center",
    paddingTop:      2,
  },
  heroContext: {
    fontSize:        10,
    fontWeight:      "500",
    color:           "#94A3B8",
    letterSpacing:   0.1,
  },
  heroLabel: {
    fontSize:        9,
    fontWeight:      "700",
    color:           MUTED,
    letterSpacing:   1.4,
    textTransform:   "uppercase",
  },
  heroNumber: {
    fontSize:        28,
    fontWeight:      "800",
    color:           WHITE,
    letterSpacing:   -1.0,
    lineHeight:      32,
  },
  heroUnit: {
    fontSize:        16,
    fontWeight:      "600",
    color:           "rgba(255,255,255,0.55)",
    letterSpacing:   0,
  },

  // ── Footer row
  footerRow: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    borderTopWidth:    0.5,
    borderTopColor:    "rgba(255,255,255,0.07)",
    paddingTop:        8,
    paddingBottom:     10,
  },
  footerLeft: {
    gap:               3,
  },
  footerName: {
    fontSize:          12,
    fontWeight:        "700",
    color:             WHITE,
    letterSpacing:     0,
  },
  footerMetrics: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
  },
  footerStreak: {
    fontSize:          10,
    fontWeight:        "600",
    color:             "#F97316",
    letterSpacing:     0.1,
  },
  footerWeight: {
    fontSize:          10,
    fontWeight:        "500",
    color:             MUTED,
    letterSpacing:     0.1,
  },

  // Macro pill badges
  macroPills: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               5,
  },
  macroPill: {
    flexDirection:     "row",
    alignItems:        "center",
    backgroundColor:   "rgba(255,255,255,0.06)",
    borderRadius:      8,
    overflow:          "hidden",
    height:            22,
  },
  macroPillTag: {
    paddingHorizontal: 5,
    alignSelf:         "stretch",
    justifyContent:    "center",
    alignItems:        "center",
  },
  macroPillPrefix: {
    fontSize:          9,
    fontWeight:        "800",
    letterSpacing:     0.3,
  },
  macroPillValue: {
    fontSize:          9,
    fontWeight:        "600",
    color:             WHITE,
    paddingHorizontal: 5,
    letterSpacing:     0.1,
  },
});
