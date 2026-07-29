import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { FloatingNav } from "@/components/FloatingNav";
import { apiFetch } from "@/constants/api";
import type { TodaySummary, UserProfile } from "@/types/api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const SKY      = "#4A9EFF";
const CHARCOAL = "#1A1D20";
const BG       = "#F5F7FF";
const MUTED    = "#94A3B8";
const WHITE    = "#FFFFFF";

const CARD_SHADOW = {
  shadowColor:   "#000",
  shadowOffset:  { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius:  16,
  elevation:     6,
} as const;

// ─── Ring geometry ────────────────────────────────────────────────────────────
const RING_SIZE     = 110;
const RING_CENTER   = RING_SIZE / 2;
const RING_RADIUS   = 42;
const STROKE_WIDTH  = 10;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";
}

// ─── MacroStrip ───────────────────────────────────────────────────────────────
function MacroStrip({
  protein,
  carbs,
  fat,
  proteinTarget,
  carbsTarget,
  fatTarget,
}: {
  protein: number;
  carbs: number;
  fat: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
}) {
  const macros = [
    {
      label: "Protein",
      val: protein,
      target: proteinTarget,
      color: "#F97316",
      remaining: Math.max(proteinTarget - protein, 0),
    },
    {
      label: "Carbs",
      val: carbs,
      target: carbsTarget,
      color: SKY,
      remaining: Math.max(carbsTarget - carbs, 0),
    },
    {
      label: "Fat",
      val: fat,
      target: fatTarget,
      color: "#EF4444",
      remaining: Math.max(fatTarget - fat, 0),
    },
  ];

  const barAnims = useRef(macros.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel(
      macros.map((m, i) =>
        Animated.timing(barAnims[i], {
          toValue: 1,
          duration: 1200,
          delay: 600 + i * 120,
          useNativeDriver: false,
        }),
      ),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protein, carbs, fat]);

  return (
    <View style={[ms.card, CARD_SHADOW]}>
      {macros.map((m, i) => (
        <React.Fragment key={m.label}>
          {i > 0 && <View style={ms.divider} />}
          <View style={ms.col}>
            <Text style={ms.label}>{m.label}</Text>
            <Text style={[ms.val, { color: CHARCOAL }]}>
              {m.val}
              <Text style={ms.unit}>g</Text>
            </Text>
            <View style={ms.track}>
              <Animated.View
                style={[
                  ms.fill,
                  {
                    width: barAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        "0%",
                        `${Math.min(
                          Math.round((m.val / Math.max(m.target, 1)) * 100),
                          100,
                        )}%`,
                      ],
                    }),
                    backgroundColor: m.color,
                  },
                ]}
              />
            </View>
            <Text style={[ms.rem, { color: m.color }]}>
              {m.remaining}g left
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const ms = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 20,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  col: { flex: 1, alignItems: "center", gap: 5 },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(0,0,0,0.07)",
    marginHorizontal: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  val: { fontSize: 20, fontWeight: "800", letterSpacing: -0.8 },
  unit: { fontSize: 11, fontWeight: "500" },
  track: {
    width: "82%",
    height: 5,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 10 },
  rem: { fontSize: 10, fontWeight: "600" },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [summary, setSummary] = useState<TodaySummary>({
    total_calories: 0,
    total_protein_g: 0,
    total_carbs_g: 0,
    total_fat_g: 0,
    meals: [],
  });
  const [profile, setProfile] = useState<UserProfile>({
    id: 0,
    updated_at: "",
    name: "Racer",
    age: null,
    weight_kg: null,
    height_cm: null,
    calorie_target: 2000,
    protein_target_g: 120,
    carbs_target_g: 250,
    fat_target_g: 65,
  });

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, profRes] = await Promise.all([
        apiFetch("/api/v1/today-summary"),
        apiFetch("/api/v1/profile"),
      ]);
      if (sumRes.ok) setSummary(await sumRes.json());
      if (profRes.ok) setProfile(await profRes.json());
    } catch (err) {
      console.log(
        "[HomeScreen] Failed to fetch data:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }, []);

  // Re-fetch on focus to keep totals fresh after logging a meal
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  // ── Derived values ──────────────────────────────────────────────────────────
  const consumedKcal  = Math.round(summary.total_calories);
  const targetKcal    = profile.calorie_target;
  const remainingKcal = Math.max(targetKcal - consumedKcal, 0);
  const remainingFrac = targetKcal > 0 ? remainingKcal / targetKcal : 0;
  const pctDisplay    = Math.floor(remainingFrac * 100);

  const ringOffset = CIRCUMFERENCE * (1 - Math.min(remainingFrac, 1));

  const proteinDisplay = Math.round(summary.total_protein_g);
  const carbsDisplay   = Math.round(summary.total_carbs_g);
  const fatDisplay     = Math.round(summary.total_fat_g);

  const initials = getInitials(profile.name);
  const greeting = getGreeting();
  const firstName = profile.name.split(" ")[0];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          {/* Left: leaf + brand */}
          <View style={styles.brand}>
            <Text style={styles.brandLeaf}>🌿</Text>
            <Text style={styles.brandName}>Swasth</Text>
          </View>

          {/* Right: bell + avatar */}
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.bellBtn}
              activeOpacity={0.75}
              onPress={() => {}}
            >
              <Text style={styles.bellIcon}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarCircle}
              activeOpacity={0.8}
              onPress={() => router.push("/profile")}
            >
              <Text style={styles.avatarInitials}>{initials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Greeting ────────────────────────────────────────────── */}
        <View style={styles.greetingWrap}>
          <Text style={styles.greetingText}>
            {greeting}, {firstName}! 👋
          </Text>
          <Text style={styles.greetingSub}>
            You're on track to a healthier you.
          </Text>
        </View>

        {/* ── Main Calorie Card ────────────────────────────────────── */}
        <View style={[styles.calorieCard, CARD_SHADOW]}>
          {/* Blue gradient background */}
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFillObject}
          >
            <Defs>
              <LinearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%"   stopColor="#4A9EFF" />
                <Stop offset="100%" stopColor="#2563EB" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={100} height={100} fill="url(#cardGrad)" />
          </Svg>

          {/* Card content */}
          <View style={styles.cardBody}>
            {/* Left: calorie info */}
            <View style={styles.cardLeft}>
              <Text style={styles.cardLabel}>Calories Left</Text>
              <Text style={styles.cardBigNum}>
                {remainingKcal.toLocaleString()}
              </Text>
              <Text style={styles.cardSubLabel}>kcal</Text>
              <Text style={styles.cardOfTarget}>
                of {targetKcal.toLocaleString()} kcal
              </Text>
            </View>

            {/* Right: donut ring */}
            <View style={styles.ringWrap}>
              <Svg
                width={RING_SIZE}
                height={RING_SIZE}
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              >
                {/* Track */}
                <Circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  r={RING_RADIUS}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                />
                {/* Progress arc */}
                <G
                  transform={`rotate(-90, ${RING_CENTER}, ${RING_CENTER})`}
                >
                  <Circle
                    cx={RING_CENTER}
                    cy={RING_CENTER}
                    r={RING_RADIUS}
                    stroke="#FFFFFF"
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                    strokeDasharray={String(CIRCUMFERENCE)}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                  />
                </G>
              </Svg>
              {/* Centre label */}
              <View style={styles.ringOverlay}>
                <Text style={styles.ringPct}>{pctDisplay}%</Text>
                <Text style={styles.ringLabel}>left</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Macro Strip ──────────────────────────────────────────── */}
        <View style={styles.macroWrap}>
          <MacroStrip
            protein={proteinDisplay}
            carbs={carbsDisplay}
            fat={fatDisplay}
            proteinTarget={profile.protein_target_g}
            carbsTarget={profile.carbs_target_g}
            fatTarget={profile.fat_target_g}
          />
        </View>
      </ScrollView>

      <FloatingNav
        active="home"
        onHome={() => {}}
        onProgress={() => router.navigate("/progress")}
        onDiary={() => router.navigate("/diary")}
        onCamera={() => router.push("/camera")}
        onMore={() => router.push("/profile")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { paddingBottom: 120 },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  brandLeaf: { fontSize: 22 },
  brandName: {
    fontSize: 22,
    fontWeight: "800",
    color: SKY,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  bellIcon: { fontSize: 17 },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: SKY,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "800",
    color: WHITE,
    letterSpacing: -0.3,
  },

  // ── Greeting
  greetingWrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 4,
  },
  greetingText: {
    fontSize: 26,
    fontWeight: "800",
    color: CHARCOAL,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  greetingSub: {
    fontSize: 14,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 20,
  },

  // ── Calorie card
  calorieCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    overflow: "hidden",
    minHeight: 160,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  cardLeft: { flex: 1, gap: 2 },
  cardLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.80)",
    marginBottom: 4,
  },
  cardBigNum: {
    fontSize: 56,
    fontWeight: "900",
    color: WHITE,
    letterSpacing: -3,
    lineHeight: 58,
  },
  cardSubLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
  },
  cardOfTarget: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.60)",
    marginTop: 4,
  },

  // ── Ring
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPct: {
    fontSize: 22,
    fontWeight: "800",
    color: WHITE,
    letterSpacing: -1,
  },
  ringLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.70)",
  },

  // ── Macro strip
  macroWrap: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
});
