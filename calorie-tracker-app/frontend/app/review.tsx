/**
 * review.tsx — Interactive portion adjustment & meal log confirmation
 *
 * Receives analysis data from camera.tsx via router params.
 * Renders a custom PanResponder-based gram slider for each detected food item.
 * All macro values scale in real-time as the user drags the slider.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, CheckCircle, RefreshCw, Zap } from "lucide-react-native";
import { Colors, alpha } from "@/constants/colors";

// ─── Design tokens ───────────────────────────────────────────────────────────
const EMERALD_LEAF = "#059669";
const ICE          = "#55CDFC";

// Slider range & snap
const SLIDER_MIN  = 50;
const SLIDER_MAX  = 500;
const SLIDER_STEP = 5;

// Rotating accent colors for item cards
const ACCENT_POOL = [
  Colors.protein,
  Colors.carbs,
  Colors.fat,
  Colors.teal,
  Colors.emerald,
] as const;

// ─── Shared domain types (mirrors camera.tsx) ────────────────────────────────
type NutritionSource = "icmr_nin" | "estimated";

interface FoodItem {
  item_name: string;
  estimated_grams: number;
  visual_confidence: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrition_source: NutritionSource;
}

interface FoodAnalysisResult {
  food_items: FoodItem[];
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
}

// ─── Custom gram slider ───────────────────────────────────────────────────────
/**
 * Pure-RN horizontal slider — no native modules required.
 * Uses a flex-split track so the thumb sits naturally at the fill/empty boundary.
 * The PanResponder callback is kept in a ref so the gesture object is never
 * recreated while the component re-renders with each onChange call.
 */
interface SliderProps {
  value:    number;
  color:    string;
  onChange: (v: number) => void;
}

function GramSlider({ value, color, onChange }: SliderProps) {
  const trackRef  = useRef<View>(null);
  const layoutRef = useRef({ x: 0, width: 1 });

  // Always-fresh callback — avoids stale closure in the stable PanResponder
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const pct = (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        const { x, width } = layoutRef.current;
        const rel = Math.max(0, Math.min(width, e.nativeEvent.pageX - x));
        const raw = SLIDER_MIN + (rel / width) * (SLIDER_MAX - SLIDER_MIN);
        onChangeRef.current(
          Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(raw / SLIDER_STEP) * SLIDER_STEP)),
        );
      },
      onPanResponderMove: (e) => {
        const { x, width } = layoutRef.current;
        const rel = Math.max(0, Math.min(width, e.nativeEvent.pageX - x));
        const raw = SLIDER_MIN + (rel / width) * (SLIDER_MAX - SLIDER_MIN);
        onChangeRef.current(
          Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(raw / SLIDER_STEP) * SLIDER_STEP)),
        );
      },
    }),
  ).current;

  return (
    <View
      ref={trackRef}
      style={styles.sliderOuter}
      onLayout={() =>
        trackRef.current?.measureInWindow((x, _y, w) => {
          layoutRef.current = { x, width: Math.max(w, 1) };
        })
      }
      {...panResponder.panHandlers}
    >
      {/* Filled portion */}
      <View style={[styles.sliderFill, { flex: Math.max(pct, 0.001), backgroundColor: color }]} />
      {/* Draggable thumb */}
      <View style={[styles.sliderThumb, { backgroundColor: color }]} />
      {/* Empty portion */}
      <View style={[styles.sliderEmpty, { flex: Math.max(1 - pct, 0.001) }]} />
    </View>
  );
}

// ─── Macro mini-pill ─────────────────────────────────────────────────────────
function MacroPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View
      style={[
        styles.macroPill,
        { backgroundColor: alpha(color, 18), borderColor: alpha(color, 50) },
      ]}
    >
      <Text style={[styles.macroPillLabel, { color }]}>{label}</Text>
      <Text style={[styles.macroPillValue, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Per-item adjustment card ─────────────────────────────────────────────────
interface ItemCardProps {
  item:          FoodItem;
  grams:         number;
  accent:        string;
  onGramsChange: (g: number) => void;
}

const ItemAdjustCard = React.memo(({ item, grams, accent, onGramsChange }: ItemCardProps) => {
  const scale   = item.estimated_grams > 0 ? grams / item.estimated_grams : 1;
  const liveCal = Math.round(item.calories  * scale);
  const livePro = (item.protein_g * scale).toFixed(1);
  const liveCrb = (item.carbs_g   * scale).toFixed(1);
  const liveFat = (item.fat_g     * scale).toFixed(1);
  const isIcmr  = item.nutrition_source === "icmr_nin";

  return (
    <View style={[styles.itemCard, { borderColor: alpha(accent, 40) }]}>
      {/* Food name + data source badge */}
      <View style={styles.itemHeader}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.item_name}
        </Text>
        <View
          style={[
            styles.sourceBadge,
            { backgroundColor: isIcmr ? alpha(Colors.emerald, 20) : "rgba(0,0,0,0.04)" },
          ]}
        >
          <Text
            style={[
              styles.sourceText,
              { color: isIcmr ? Colors.emerald : "#94A3B8" },
            ]}
          >
            {isIcmr ? "ICMR-NIN" : "est."}
          </Text>
        </View>
      </View>

      {/* Weight label + live gram readout */}
      <View style={styles.weightRow}>
        <Text style={styles.weightLabel}>Portion weight</Text>
        <View style={[styles.weightBadge, { borderColor: alpha(accent, 65) }]}>
          <Text style={[styles.weightValue, { color: accent }]}>{grams}</Text>
          <Text style={styles.weightUnit}>g</Text>
        </View>
      </View>

      {/* Interactive slider */}
      <GramSlider value={grams} color={accent} onChange={onGramsChange} />

      {/* Range hint */}
      <View style={styles.rangeRow}>
        <Text style={styles.rangeText}>{SLIDER_MIN}g</Text>
        <Text style={styles.rangeText}>{SLIDER_MAX}g</Text>
      </View>

      {/* Live macro pills — update on every slider tick */}
      <View style={styles.pillRow}>
        <MacroPill label="Cal"  value={String(liveCal)} color={EMERALD_LEAF} />
        <MacroPill label="Pro"  value={`${livePro}g`}   color={Colors.protein} />
        <MacroPill label="Carb" value={`${liveCrb}g`}   color={Colors.carbs} />
        <MacroPill label="Fat"  value={`${liveFat}g`}   color={Colors.fat} />
      </View>
    </View>
  );
});

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function ReviewScreen() {
  const { data, photoUri } = useLocalSearchParams<{
    data:     string;
    photoUri: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const result: FoodAnalysisResult = React.useMemo(() => {
    try {
      return JSON.parse(data ?? "{}");
    } catch {
      return {
        food_items: [],
        total_calories: 0,
        total_protein_g: 0,
        total_carbs_g: 0,
        total_fat_g: 0,
      };
    }
  }, [data]);

  // Per-item weight state keyed by index — avoids collision when two items share the same name
  const [weights, setWeights] = useState<number[]>(() =>
    result.food_items.map((i) => i.estimated_grams),
  );

  // Stable updater — never recreated, so React.memo on ItemAdjustCard actually fires.
  const setWeight = useCallback((index: number, g: number) =>
    setWeights((prev) => prev.map((w, i) => (i === index ? g : w))),
  []);

  // One stable callback per item — created only when the item list changes.
  // Passing (g) => setWeight(i, g) inline would defeat React.memo every render.
  const onGramsChangeCallbacks = useMemo(
    () => result.food_items.map((_, i) => (g: number) => setWeight(i, g)),
    [result.food_items, setWeight],
  );

  // Live total — only recomputed when weights or items change, not on unrelated renders.
  const totalCalories = useMemo(
    () => result.food_items.reduce((sum, item, i) => {
      const w     = weights[i] ?? item.estimated_grams;
      const scale = item.estimated_grams > 0 ? w / item.estimated_grams : 1;
      return sum + Math.round(item.calories * scale);
    }, 0),
    [weights, result.food_items],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.75}
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Adjust Portions</Text>
        {/* Spacer keeps title centred */}
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Math.max(insets.bottom, 16) + 160 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Thumbnail + live calorie total ── */}
        <View style={styles.summaryCard}>
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailFallback]}>
              <Zap size={24} color="#94A3B8" />
            </View>
          )}
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>TOTAL CALORIES</Text>
            <Text style={styles.summaryCalories}>
              {totalCalories.toLocaleString()}
            </Text>
            <Text style={styles.summaryHint}>drag sliders to update</Text>
          </View>
        </View>

        {/* ── Section heading ── */}
        <Text style={styles.sectionLabel}>
          {result.food_items.length} ITEM
          {result.food_items.length !== 1 ? "S" : ""} — DRAG TO ADJUST
        </Text>

        {/* ── Per-item cards ── */}
        {result.food_items.map((item, i) => (
          <ItemAdjustCard
            key={`${item.item_name}-${i}`}
            item={item}
            grams={weights[i] ?? item.estimated_grams}
            accent={ACCENT_POOL[i % ACCENT_POOL.length]}
            onGramsChange={onGramsChangeCallbacks[i]}
          />
        ))}
      </ScrollView>

      {/* ── Sticky action bar ── */}
      <View
        style={[
          styles.actionBar,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        <TouchableOpacity
          style={styles.primaryBtn}
          activeOpacity={0.82}
          onPress={() =>
            Alert.alert(
              "Logged! 🎉",
              `${totalCalories.toLocaleString()} kcal added to your Swasth Journal.\n\nFull history sync coming in the next release.`,
            )
          }
        >
          <CheckCircle size={18} color={Colors.white} strokeWidth={2} />
          <Text style={styles.primaryBtnText}>Log to Swasth Journal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.outlineBtn}
          activeOpacity={0.75}
          onPress={() => router.back()}
        >
          <RefreshCw size={15} color={ICE} strokeWidth={2} />
          <Text style={styles.outlineBtnText}>Retake Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },

  // Top bar
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1, borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(85,205,252,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  topTitle: {
    fontSize: 17, fontWeight: "700", color: "#0F172A", letterSpacing: -0.3,
  },

  // Scroll
  scroll: { paddingHorizontal: 18, paddingTop: 20, gap: 16 },

  // Summary card
  summaryCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 22, borderWidth: 1, borderColor: "#E2E8F0",
    padding: 16,
    shadowColor: "#64748B", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  thumbnail: { width: 82, height: 82, borderRadius: 14, flexShrink: 0 },
  thumbnailFallback: {
    backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center",
  },
  summaryInfo: { flex: 1, gap: 4 },
  summaryLabel: {
    fontSize: 10, fontWeight: "700", color: "#64748B",
    letterSpacing: 1.4, textTransform: "uppercase",
  },
  summaryCalories: {
    fontSize: 44, fontWeight: "800", color: "#0F172A", letterSpacing: -2, lineHeight: 50,
  },
  summaryHint: { fontSize: 12, color: "#64748B", fontWeight: "500" },

  // Section label
  sectionLabel: {
    fontSize: 10, fontWeight: "700", color: "#64748B",
    letterSpacing: 1.4, textTransform: "uppercase", paddingHorizontal: 2,
  },

  // Item card — white surface
  itemCard: {
    backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1,
    borderColor: "#E2E8F0", padding: 18, gap: 12,
    shadowColor: "#64748B", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  itemHeader: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", gap: 10,
  },
  itemName: {
    flex: 1, fontSize: 15, fontWeight: "700",
    color: "#0F172A", letterSpacing: -0.2,
  },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexShrink: 0 },
  sourceText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },

  // Weight row
  weightRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  weightLabel: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  weightBadge: {
    flexDirection: "row", alignItems: "baseline", gap: 2,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1.5, backgroundColor: "#F8FAFC",
  },
  weightValue: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  weightUnit:  { fontSize: 12, color: "#64748B", fontWeight: "600" },

  // Slider
  sliderOuter: {
    flexDirection: "row", alignItems: "center", height: 36, paddingHorizontal: 2,
  },
  sliderFill: {
    height: 6, borderRadius: 3,
  },
  sliderEmpty: {
    height: 6, borderRadius: 3, backgroundColor: "#E2E8F0",
  },
  sliderThumb: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2.5, borderColor: "#FFFFFF", flexShrink: 0,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  rangeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: -6 },
  rangeText: { fontSize: 10, color: "#94A3B8", fontWeight: "500" },

  // Macro pills
  pillRow: { flexDirection: "row", gap: 8 },
  macroPill: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, gap: 2,
  },
  macroPillLabel: {
    fontSize: 9, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase",
  },
  macroPillValue: { fontSize: 13, fontWeight: "800", letterSpacing: -0.3 },

  // Sticky action bar
  actionBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingTop: 14, paddingHorizontal: 20, gap: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1, borderTopColor: "#E2E8F0",
    shadowColor: "#64748B", shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 8,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: ICE, paddingVertical: 16, borderRadius: 16,
    shadowColor: ICE, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38, shadowRadius: 12, elevation: 8,
  },
  primaryBtnText: { color: Colors.white, fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: 16,
    borderWidth: 1.5, borderColor: ICE,
    backgroundColor: "rgba(85,205,252,0.10)",
  },
  outlineBtnText: { color: ICE, fontSize: 15, fontWeight: "600" },
});
