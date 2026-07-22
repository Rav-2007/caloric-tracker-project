import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Star,
  Tag,
  Zap,
} from "@/components/icons";
import { FloatingNav } from "@/components/FloatingNav";
import { apiFetch } from "@/constants/api";
import type { LoggedMeal, MealsListResponse } from "@/types/api";
import { toDateParam } from "@/types/api";

// ─── Design tokens ───────────────────────────────────────────────────────────
const BG       = "#F8FAFC";
const SKY      = "#55CDFC";
const CHARCOAL = "#1A1D20";
const MUTED    = "#94A3B8";
const WHITE    = "#FFFFFF";
const PURPLE   = "#7C3AED";

const CARD_SHADOW = {
  shadowColor:   "#000",
  shadowOffset:  { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius:  16,
  elevation:     6,
} as const;

// ─── Calendar constants ───────────────────────────────────────────────────────
const DAY_LABELS  = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Performance dot colors per calendar day ──────────────────────────────────
const PERF: Record<string, string> = {
  "2026-06-01": "#22C55E", "2026-06-02": "#0EA5E9", "2026-06-03": "#22C55E",
  "2026-06-04": "#EAB308", "2026-06-05": "#22C55E", "2026-06-06": "#EF4444",
  "2026-06-07": "#0EA5E9", "2026-06-08": "#22C55E", "2026-06-09": "#22C55E",
  "2026-06-10": "#EAB308", "2026-06-11": "#0EA5E9", "2026-06-12": "#22C55E",
  "2026-06-13": "#EF4444", "2026-06-14": "#22C55E", "2026-06-15": "#0EA5E9",
  "2026-06-16": "#22C55E", "2026-06-17": "#EAB308", "2026-06-18": "#22C55E",
  "2026-06-19": "#0EA5E9", "2026-06-20": "#22C55E", "2026-06-21": "#22C55E",
  "2026-06-22": "#0EA5E9", "2026-06-23": "#EAB308", "2026-06-24": "#22C55E",
  "2026-06-25": "#22C55E", "2026-06-26": "#22C55E", "2026-06-27": "#0EA5E9",
  "2026-06-28": "#22C55E", "2026-06-29": "#22C55E", "2026-06-30": "#0EA5E9",
  "2026-07-01": "#22C55E", "2026-07-02": "#0EA5E9",
};

// ─── Monthly summary ──────────────────────────────────────────────────────────
const MONTHLY_STATS = [
  { label: "On Track",  value: "68%",  color: "#22C55E" },
  { label: "Streak",    value: "🔥 21d", color: "#F97316" },
  { label: "Avg Score", value: "7.4",  color: SKY },
];
const MONTH_OVERVIEW = [
  { label: "Days",    value: "30" },
  { label: "Logged",  value: "19" },
  { label: "Avg Cal", value: "1,845" },
  { label: "Goal",    value: "79%" },
];

// ─── 4-week journey data ──────────────────────────────────────────────────────
const JOURNEY = {
  health: [65, 72, 68, 78],
  goal:   [58, 64, 71, 76],
  macros: [45, 52, 58, 63],
};
const WEEK_LABELS = ["Wk 1", "Wk 2", "Wk 3", "Wk 4"];

// ─── Meal data ────────────────────────────────────────────────────────────────
// Replaced with live API data — see ProgressScreen state below

// ─── Snack options (Activity Thread) ─────────────────────────────────────────
const SNACK_OPTIONS = [
  { emoji: "🥚", name: "Boiled Eggs (3 pcs)",   sub: "18g protein · Low carb",    kcal: 210 },
  { emoji: "🍗", name: "Grilled Chicken Breast", sub: "31g protein · Zero fat",    kcal: 165 },
  { emoji: "🫘", name: "Paneer Bhurji + Roti",   sub: "22g protein · Medium carb", kcal: 310 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayStr(): string {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}
const TODAY_STR = todayStr();

// ─── Chart helpers ────────────────────────────────────────────────────────────
const CHART_H   = 152;
const CHART_PAD = { top: 10, bottom: 28, left: 28, right: 8 };

function dataToXY(values: number[], chartW: number) {
  const w = chartW - CHART_PAD.left - CHART_PAD.right;
  const h = CHART_H  - CHART_PAD.top  - CHART_PAD.bottom;
  return values.map((v, i) => ({
    x: CHART_PAD.left + (i / (values.length - 1)) * w,
    y: CHART_PAD.top  + (1 - v / 100) * h,
  }));
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpX = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    d += ` C ${cpX} ${pts[i - 1].y.toFixed(1)} ${cpX} ${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return d;
}

function areaPath(pts: { x: number; y: number }[], baseY: number): string {
  if (!pts.length) return "";
  let d = `M ${pts[0].x.toFixed(1)} ${baseY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpX = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    d += ` C ${cpX} ${pts[i - 1].y.toFixed(1)} ${cpX} ${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
  return d;
}

// ─── Journey Chart ────────────────────────────────────────────────────────────
function JourneyChart() {
  const [scrubIdx, setScrubIdx] = useState(3);
  const chartW = Dimensions.get("window").width - 80;

  const hPts = dataToXY(JOURNEY.health, chartW);
  const gPts = dataToXY(JOURNEY.goal,   chartW);
  const mPts = dataToXY(JOURNEY.macros, chartW);
  const baseY = CHART_H - CHART_PAD.bottom;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => updateScrub(e.nativeEvent.locationX),
      onPanResponderMove:  (e) => updateScrub(e.nativeEvent.locationX),
    }),
  ).current;

  function updateScrub(x: number) {
    const avail = chartW - CHART_PAD.left - CHART_PAD.right;
    const norm  = (x - CHART_PAD.left) / avail;
    setScrubIdx(Math.max(0, Math.min(3, Math.round(norm * 3))));
  }

  const scrubX = hPts[scrubIdx]?.x ?? CHART_PAD.left;

  return (
    <View style={[jc.card, CARD_SHADOW]}>
      <View style={jc.titleRow}>
        <Text style={jc.title}>4-Week Journey</Text>
        <View style={jc.legend}>
          {[
            { label: "Health",  color: "#22C55E" },
            { label: "Goal",    color: SKY },
            { label: "Macros",  color: "#F97316" },
          ].map((l) => (
            <View key={l.label} style={jc.legItem}>
              <View style={[jc.legDot, { backgroundColor: l.color }]} />
              <Text style={jc.legLabel}>{l.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View {...panResponder.panHandlers} style={{ width: chartW, height: CHART_H }}>
        <Svg width={chartW} height={CHART_H}>
          <Defs>
            <LinearGradient id="healthArea" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%"   stopColor="#22C55E" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Grid lines */}
          {[25, 50, 75].map((v) => {
            const gy = CHART_PAD.top + (1 - v / 100) * (CHART_H - CHART_PAD.top - CHART_PAD.bottom);
            return (
              <React.Fragment key={v}>
                <Path
                  d={`M ${CHART_PAD.left} ${gy.toFixed(1)} L ${chartW - CHART_PAD.right} ${gy.toFixed(1)}`}
                  stroke="rgba(0,0,0,0.055)" strokeWidth={1}
                />
                <SvgText x={CHART_PAD.left - 5} y={gy + 4} textAnchor="end"
                  fontSize={8} fill={MUTED}>{v}</SvgText>
              </React.Fragment>
            );
          })}

          {/* Area under health */}
          <Path d={areaPath(hPts, baseY)} fill="url(#healthArea)" />

          {/* Series lines */}
          <Path d={smoothPath(mPts)} stroke="#F97316" strokeWidth={2}   fill="none" strokeLinecap="round" />
          <Path d={smoothPath(gPts)} stroke={SKY}     strokeWidth={2}   fill="none" strokeLinecap="round" />
          <Path d={smoothPath(hPts)} stroke="#22C55E" strokeWidth={2.5} fill="none" strokeLinecap="round" />

          {/* Scrubber */}
          <Path
            d={`M ${scrubX.toFixed(1)} ${CHART_PAD.top} L ${scrubX.toFixed(1)} ${baseY}`}
            stroke="rgba(0,0,0,0.13)" strokeWidth={1.5} strokeDasharray="4 3"
          />

          {/* Dots at scrubber position */}
          {[
            { pts: hPts, color: "#22C55E" },
            { pts: gPts, color: SKY },
            { pts: mPts, color: "#F97316" },
          ].map(({ pts, color }) => (
            <Circle key={color}
              cx={pts[scrubIdx].x} cy={pts[scrubIdx].y}
              r={4} fill={color} stroke={WHITE} strokeWidth={2}
            />
          ))}

          {/* X-axis labels */}
          {hPts.map((pt, i) => (
            <SvgText key={i}
              x={pt.x} y={CHART_H - 6} textAnchor="middle"
              fontSize={9} fill={i === scrubIdx ? CHARCOAL : MUTED}
              fontWeight={i === scrubIdx ? "700" : "400"}
            >
              {WEEK_LABELS[i]}
            </SvgText>
          ))}
        </Svg>
      </View>

      {/* Tooltip */}
      <View style={jc.tooltip}>
        <Text style={jc.tooltipWk}>{WEEK_LABELS[scrubIdx]}</Text>
        {[
          { label: "Health",  val: JOURNEY.health[scrubIdx], color: "#22C55E" },
          { label: "Goal",    val: JOURNEY.goal[scrubIdx],   color: SKY },
          { label: "Macros",  val: JOURNEY.macros[scrubIdx], color: "#F97316" },
        ].map((s) => (
          <View key={s.label} style={jc.tooltipStat}>
            <View style={[jc.tooltipDot, { backgroundColor: s.color }]} />
            <Text style={jc.tooltipLabel}>{s.label}</Text>
            <Text style={[jc.tooltipVal, { color: s.color }]}>{s.val}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const jc = StyleSheet.create({
  card:        { backgroundColor: WHITE, borderRadius: 24, padding: 18, gap: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  titleRow:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title:       { fontSize: 15, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.3 },
  legend:      { flexDirection: "row", gap: 10 },
  legItem:     { flexDirection: "row", alignItems: "center", gap: 4 },
  legDot:      { width: 7, height: 7, borderRadius: 3.5 },
  legLabel:    { fontSize: 9, fontWeight: "600", color: MUTED },
  tooltip:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F8FAFC", borderRadius: 12, padding: 10, flexWrap: "wrap" },
  tooltipWk:   { fontSize: 11, fontWeight: "800", color: CHARCOAL },
  tooltipStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  tooltipDot:  { width: 6, height: 6, borderRadius: 3 },
  tooltipLabel: { fontSize: 10, fontWeight: "600", color: MUTED },
  tooltipVal:  { fontSize: 11, fontWeight: "700" },
});

// ─── Water Tracker ────────────────────────────────────────────────────────────
function WaterTracker({ count, onToggle }: { count: number; onToggle: (i: number) => void }) {
  return (
    <View style={[wt.card, CARD_SHADOW]}>
      <View style={wt.header}>
        <Droplets size={14} color={SKY} strokeWidth={2} />
        <Text style={wt.title}>Hydration</Text>
        <Text style={wt.count}>{count} / 8 glasses</Text>
      </View>
      <View style={wt.row}>
        {Array.from({ length: 8 }, (_, i) => (
          <TouchableOpacity
            key={i}
            style={[wt.glass, i < count && wt.glassFull]}
            onPress={() => onToggle(i)}
            activeOpacity={0.7}
          >
            <Droplets size={14} color={i < count ? WHITE : "#CBD5E1"} strokeWidth={2} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const wt = StyleSheet.create({
  card:      { backgroundColor: WHITE, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  header:    { flexDirection: "row", alignItems: "center", gap: 6 },
  title:     { fontSize: 13, fontWeight: "700", color: CHARCOAL, flex: 1 },
  count:     { fontSize: 11, fontWeight: "600", color: SKY },
  row:       { flexDirection: "row", gap: 5 },
  glass:     { flex: 1, aspectRatio: 1, borderRadius: 10, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  glassFull: { backgroundColor: SKY },
});

// ─── Sleep Index Card ─────────────────────────────────────────────────────────
function SleepIndexCard() {
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: 1, duration: 900, delay: 200, useNativeDriver: false }).start();
  }, []);

  return (
    <View style={[sl.card, CARD_SHADOW]}>
      {/* Header */}
      <View style={sl.hdr}>
        <View style={sl.hdrLeft}>
          <View style={sl.moonBox}>
            <Text style={sl.moonEmoji}>🌙</Text>
          </View>
          <View>
            <Text style={sl.title}>Sleep Index</Text>
            <View style={sl.subRow}>
              <Text style={sl.duration}>7h 45m</Text>
              <Text style={sl.dotSep}>•</Text>
              <Text style={sl.quality}>Excellent Quality</Text>
            </View>
          </View>
        </View>
        <View style={sl.scoreBox}>
          <Text style={sl.score}>88</Text>
          <Text style={sl.scorePct}>%</Text>
        </View>
      </View>

      {/* Animated progress bar */}
      <View style={sl.track}>
        <Animated.View
          style={[
            sl.bar,
            { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "88%"] }) },
          ]}
        />
      </View>

      {/* Stats row */}
      <View style={sl.stats}>
        <View style={sl.stat}>
          <View style={sl.blueBox}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Rect x="2"  y="14" width="4" height="8"  rx="1" fill="#3B82F6" />
              <Rect x="9"  y="9"  width="4" height="13" rx="1" fill="#3B82F6" fillOpacity="0.6" />
              <Rect x="16" y="4"  width="4" height="18" rx="1" fill="#3B82F6" fillOpacity="0.3" />
            </Svg>
          </View>
          <View>
            <Text style={sl.statLabel}>Deep Sleep</Text>
            <Text style={sl.statVal}>2h 15m</Text>
          </View>
        </View>

        <View style={sl.divider} />

        <View style={sl.stat}>
          <View style={sl.purpleBox}>
            <Text style={sl.remEmoji}>💤</Text>
          </View>
          <View>
            <Text style={sl.statLabel}>REM Sleep</Text>
            <Text style={sl.statVal}>1h 50m</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const sl = StyleSheet.create({
  card:       { backgroundColor: WHITE, borderRadius: 20, padding: 16, gap: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  hdr:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hdrLeft:    { flexDirection: "row", alignItems: "center", gap: 12 },
  moonBox:    { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(167,139,250,0.12)", alignItems: "center", justifyContent: "center" },
  moonEmoji:  { fontSize: 20 },
  title:      { fontSize: 15, fontWeight: "700", color: CHARCOAL, letterSpacing: -0.3 },
  subRow:     { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  duration:   { fontSize: 11, fontWeight: "500", color: MUTED },
  dotSep:     { fontSize: 11, color: "#CBD5E1" },
  quality:    { fontSize: 11, fontWeight: "600", color: PURPLE },
  scoreBox:   { flexDirection: "row", alignItems: "baseline", gap: 1 },
  score:      { fontSize: 28, fontWeight: "800", color: PURPLE, letterSpacing: -1 },
  scorePct:   { fontSize: 13, fontWeight: "600", color: PURPLE },
  track:      { height: 6, borderRadius: 3, backgroundColor: "rgba(167,139,250,0.15)", overflow: "hidden" },
  bar:        { height: 6, borderRadius: 3, backgroundColor: PURPLE },
  stats:      { flexDirection: "row", alignItems: "center" },
  stat:       { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  blueBox:    { width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(59,130,246,0.1)", alignItems: "center", justifyContent: "center" },
  purpleBox:  { width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(167,139,250,0.12)", alignItems: "center", justifyContent: "center" },
  remEmoji:   { fontSize: 14 },
  statLabel:  { fontSize: 8, fontWeight: "700", color: MUTED, letterSpacing: 1, textTransform: "uppercase" },
  statVal:    { fontSize: 14, fontWeight: "700", color: CHARCOAL, letterSpacing: -0.3, marginTop: 1 },
  divider:    { width: 1, height: 36, backgroundColor: "#F1F5F9", marginHorizontal: 8 },
});

// ─── AI Nutrition Insight Card ────────────────────────────────────────────────
type InsightData = { insight: string; tip: string; action: string };

function AIInsightCard() {
  const [data,    setData]    = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchInsight = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/nutrition-insight");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `Server error ${res.status}`);
      }
      const json: InsightData = await res.json();
      setData(json);
    } catch (err) {
      console.log("[AIInsightCard] Failed to fetch insight:", err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : "Could not load insight.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => { fetchInsight(); }, [fetchInsight]);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[ai.card, CARD_SHADOW]}>
        <View style={ai.hdr}>
          <View style={ai.hdrLeft}>
            <Text style={ai.star}>★</Text>
            <Text style={ai.label}>AI Nutrition Insight</Text>
          </View>
          <View style={[ai.livePill, { backgroundColor: "rgba(22,160,133,0.07)" }]}>
            <View style={[ai.liveDot, { backgroundColor: "#94A3B8" }]} />
            <Text style={[ai.liveText, { color: "#94A3B8" }]}>Loading…</Text>
          </View>
        </View>
        <View style={ai.skeletonLine} />
        <View style={[ai.skeletonLine, { width: "70%" }]} />
        <View style={[ai.skeletonLine, { width: "50%", marginTop: 4 }]} />
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[ai.card, CARD_SHADOW]}>
        <View style={ai.hdr}>
          <View style={ai.hdrLeft}>
            <Text style={ai.star}>★</Text>
            <Text style={ai.label}>AI Nutrition Insight</Text>
          </View>
        </View>
        <Text style={ai.errorTxt}>⚠️ {error}</Text>
        <TouchableOpacity style={ai.retryBtn} onPress={fetchInsight} activeOpacity={0.8}>
          <Text style={ai.retryTxt}>🔄 Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Live data ──────────────────────────────────────────────────────────────
  return (
    <View style={[ai.card, CARD_SHADOW]}>
      <View style={ai.hdr}>
        <View style={ai.hdrLeft}>
          <Text style={ai.star}>★</Text>
          <Text style={ai.label}>AI Nutrition Insight</Text>
        </View>
        <View style={ai.livePill}>
          <View style={ai.liveDot} />
          <Text style={ai.liveText}>Live</Text>
        </View>
      </View>

      {/* Main insight */}
      <Text style={ai.body}>{data?.insight}</Text>

      {/* Tip row */}
      {data?.tip ? (
        <View style={ai.tipRow}>
          <Text style={ai.tipIcon}>💡</Text>
          <Text style={ai.tipTxt}>{data.tip}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      <View style={ai.btnRow}>
        <TouchableOpacity style={ai.primaryBtn} activeOpacity={0.82}>
          <Text style={ai.primaryTxt}>⚡ {data?.action ?? "View Details"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ai.altBtn} onPress={fetchInsight} activeOpacity={0.82}>
          <Text style={ai.altTxt}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const ai = StyleSheet.create({
  card:       { backgroundColor: WHITE, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: "rgba(22,160,133,0.15)" },
  hdr:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hdrLeft:    { flexDirection: "row", alignItems: "center", gap: 5 },
  star:       { fontSize: 12, color: "#16A085" },
  label:      { fontSize: 10, fontWeight: "700", color: "#16A085", letterSpacing: 1.2, textTransform: "uppercase" },
  livePill:   { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(22,160,133,0.1)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  liveDot:    { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#16A085" },
  liveText:   { fontSize: 8, fontWeight: "700", color: "#16A085" },
  body:       { fontSize: 13, fontWeight: "500", color: "#2C3E50", lineHeight: 20 },
  boldTxt:    { fontWeight: "700", color: CHARCOAL },
  tipRow:     { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "rgba(22,160,133,0.06)", borderRadius: 12, padding: 10 },
  tipIcon:    { fontSize: 13 },
  tipTxt:     { flex: 1, fontSize: 12, fontWeight: "500", color: "#2C3E50", lineHeight: 18 },
  btnRow:     { flexDirection: "row", gap: 8 },
  primaryBtn: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#2ECC71", borderRadius: 22, paddingVertical: 10, shadowColor: "#2ECC71", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.38, shadowRadius: 10, elevation: 6 },
  primaryTxt: { fontSize: 11, fontWeight: "700", color: WHITE },
  altBtn:     { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#BDC3C7", borderRadius: 22, paddingVertical: 10, paddingHorizontal: 13 },
  altTxt:     { fontSize: 11, fontWeight: "600", color: "#2C3E50" },
  // Loading skeleton
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.07)", width: "100%" },
  // Error state
  errorTxt:   { fontSize: 12, fontWeight: "500", color: "#EF4444", lineHeight: 18 },
  retryBtn:   { alignSelf: "flex-start", borderWidth: 1, borderColor: "#EF4444", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  retryTxt:   { fontSize: 11, fontWeight: "700", color: "#EF4444" },
});

// ─── Activity Thread ──────────────────────────────────────────────────────────
const MEAL_EMOJIS_AT: Record<string, string> = {
  Breakfast: "🥘", Lunch: "🍛", Snacks: "🍎", Dinner: "🌙",
};

interface ActivityThreadProps {
  meals:         LoggedMeal[];   // today's real meals from API
  calorieTarget: number;         // from user profile
  loading:       boolean;
}

function ActivityThread({ meals, calorieTarget, loading }: ActivityThreadProps) {
  const [showSnacks, setShowSnacks] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 450, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,   duration: 450, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  // ── Derived values from real data ──────────────────────────────────────────
  const totalConsumed = Math.round(meals.reduce((s, m) => s + m.total_calories, 0));
  const remaining     = Math.max(calorieTarget - totalConsumed, 0);
  const isOver        = totalConsumed > calorieTarget;
  const overBy        = Math.max(totalConsumed - calorieTarget, 0);

  // Filter snack recommendations based on remaining calories
  const recommendedSnacks = SNACK_OPTIONS.filter(s => s.kcal <= (remaining > 0 ? remaining : 400));

  // Format logged_at timestamp → "HH:MM AM/PM"
  function formatTime(iso: string): string {
    const d = new Date(iso);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  return (
    <View style={[at.card, CARD_SHADOW]}>
      <View style={at.hdr}>
        <Text style={at.hdrTitle}>⏰ Activity Thread</Text>
        {/* Live indicator */}
        <View style={at.liveBadge}>
          <View style={at.liveDotAt} />
          <Text style={at.liveBadgeTxt}>Today</Text>
        </View>
      </View>

      {/* ── Loading state ───────────────────────────────────────────── */}
      {loading && (
        <View style={at.loadingRow}>
          <Text style={at.loadingTxt}>Loading today's activity…</Text>
        </View>
      )}

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {!loading && meals.length === 0 && (
        <View style={at.emptyRow}>
          <Text style={at.emptyTxt}>No meals logged yet today.</Text>
          <Text style={at.emptySub}>Scan your first meal to see it here! 📸</Text>
        </View>
      )}

      {/* ── Real logged meals ────────────────────────────────────────── */}
      {!loading && meals.map((meal, idx) => {
        const itemNames = (meal.food_items as { item_name: string }[])
          .map(f => f.item_name).join(", ");
        const isLast = idx === meals.length - 1;
        return (
          <View key={meal.id} style={at.row}>
            <View style={at.nodeCol}>
              {!isLast && <View style={at.lineGray} />}
              <View style={at.dotGreen} />
            </View>
            <View style={isLast ? at.rowBody : at.rowBody}>
              <Text style={at.time}>{formatTime(String(meal.logged_at))}</Text>
              <Text style={at.name} numberOfLines={2}>
                {MEAL_EMOJIS_AT[meal.meal_type] ?? "🍽️"} {itemNames || meal.meal_type}
              </Text>
              <Text style={at.sub}>
                {Math.round(meal.total_calories)} kcal · {meal.meal_type}
                {"  "}P {Math.round(meal.total_protein_g)}g · C {Math.round(meal.total_carbs_g)}g · F {Math.round(meal.total_fat_g)}g
              </Text>
            </View>
          </View>
        );
      })}

      {/* ── NOW divider (only show if there are meals or loading is done) ── */}
      {!loading && (
        <View style={at.row}>
          <View style={at.nodeCol}>
            <View style={at.lineOrange} />
            <Animated.View style={[at.dotOrange, { opacity: pulse }]} />
          </View>
          <View style={[at.rowBody, at.nowDivRow]}>
            <View style={at.nowDash} />
            <View style={at.nowBadge}>
              <Animated.View style={[at.nowBadgeDot, { opacity: pulse }]} />
              <Text style={at.nowBadgeTxt}>Now</Text>
            </View>
            <View style={at.nowDash} />
          </View>
        </View>
      )}

      {/* ── Calorie summary + snack CTA ──────────────────────────────── */}
      {!loading && (
        <View style={at.row}>
          <View style={at.nodeCol}>
            <Animated.View style={[at.dotAmber, { opacity: pulse }]} />
          </View>
          <View style={at.rowBodyLast}>
            {isOver ? (
              <>
                <Text style={[at.name, { color: "#EF4444" }]}>Over Target</Text>
                <Text style={[at.sub, { marginBottom: 8, color: "#EF4444" }]}>
                  {overBy} kcal over · {totalConsumed} / {calorieTarget} kcal consumed
                </Text>
              </>
            ) : (
              <>
                <Text style={[at.name, { color: "#F39C12" }]}>
                  {remaining > 0 ? "Calories Remaining" : "Target Reached 🎯"}
                </Text>
                <Text style={[at.sub, { marginBottom: 8 }]}>
                  {remaining > 0
                    ? `${remaining} kcal left · ${totalConsumed} / ${calorieTarget} kcal consumed`
                    : `${totalConsumed} / ${calorieTarget} kcal — great work today!`}
                </Text>
              </>
            )}

            {/* Only show snack CTA if there are calories left */}
            {remaining > 0 && recommendedSnacks.length > 0 && (
              <TouchableOpacity
                style={at.ctaCard}
                onPress={() => setShowSnacks((s) => !s)}
                activeOpacity={0.8}
              >
                <View style={at.ctaTop}>
                  <View style={at.ctaDot} />
                  <Text style={at.ctaTxt}>
                    {showSnacks ? "⚡ Hide Options" : "⚡ Quick Log Recommended Snack"}
                  </Text>
                </View>
                {showSnacks && (
                  <View style={at.snackList}>
                    {recommendedSnacks.map((s, i) => (
                      <View key={i} style={[at.snackRow, i < recommendedSnacks.length - 1 && at.snackDiv]}>
                        <Text style={at.snackEmoji}>{s.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={at.snackName}>{s.name}</Text>
                          <Text style={at.snackSub}>{s.sub}</Text>
                        </View>
                        <Text style={at.snackKcal}>
                          {s.kcal}<Text style={at.snackUnit}> kcal</Text>
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const at = StyleSheet.create({
  card:        { backgroundColor: WHITE, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  hdr:         { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  hdrTitle:    { flex: 1, fontSize: 11, fontWeight: "700", color: MUTED, letterSpacing: 1.1, textTransform: "uppercase" },
  // Live badge
  liveBadge:   { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(34,197,94,0.1)", borderWidth: 1, borderColor: "rgba(34,197,94,0.25)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  liveDotAt:   { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#22C55E" },
  liveBadgeTxt: { fontSize: 9, fontWeight: "700", color: "#22C55E" },
  // Loading / empty
  loadingRow:  { paddingVertical: 16, alignItems: "center" },
  loadingTxt:  { fontSize: 12, fontWeight: "500", color: MUTED },
  emptyRow:    { paddingVertical: 16, alignItems: "center", gap: 4 },
  emptyTxt:    { fontSize: 13, fontWeight: "600", color: CHARCOAL },
  emptySub:    { fontSize: 11, fontWeight: "400", color: MUTED },

  row:         { flexDirection: "row" },
  nodeCol:     { width: 38, alignItems: "center" },
  lineGray:    { position: "absolute", top: 0, bottom: 0, width: 1.5, backgroundColor: "rgba(226,232,240,0.9)" },
  lineOrange:  { position: "absolute", top: 0, bottom: 0, width: 1.5, backgroundColor: "rgba(249,115,22,0.2)" },
  dotGreen:    { width: 11, height: 11, borderRadius: 5.5, backgroundColor: "#22C55E", borderWidth: 2, borderColor: "#27AE60", marginTop: 2, zIndex: 1 },
  dotOrange:   { width: 11, height: 11, borderRadius: 5.5, backgroundColor: "#F97316", borderWidth: 2, borderColor: "#F97316", marginTop: 2, zIndex: 1 },
  dotAmber:    { width: 11, height: 11, borderRadius: 5.5, backgroundColor: "rgba(243,156,18,0.18)", borderWidth: 2, borderColor: "#F39C12", marginTop: 2, zIndex: 1 },

  rowBody:     { flex: 1, paddingBottom: 10 },
  rowBodyLast: { flex: 1, paddingBottom: 0 },
  time:        { fontSize: 8, fontWeight: "600", color: MUTED, letterSpacing: 0.3, marginBottom: 2, lineHeight: 12 },
  name:        { fontSize: 11, fontWeight: "700", color: CHARCOAL, letterSpacing: -0.1, lineHeight: 16 },
  sub:         { fontSize: 9, color: MUTED, fontWeight: "500", marginTop: 1 },

  nowDivRow:   { flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 8 },
  nowDash:     { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(249,115,22,0.55)" },
  nowBadge:    { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(249,115,22,0.1)", borderWidth: 1, borderColor: "rgba(249,115,22,0.28)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  nowBadgeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#F97316" },
  nowBadgeTxt: { fontSize: 8, fontWeight: "800", color: "#F97316", letterSpacing: 0.8 },

  ctaCard:    { borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(243,156,18,0.35)", overflow: "hidden" },
  ctaTop:     { flexDirection: "row", alignItems: "center", gap: 5, padding: 8 },
  ctaDot:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#F39C12" },
  ctaTxt:     { fontSize: 9, fontWeight: "700", color: "#F39C12" },
  snackList:  { borderTopWidth: 1, borderColor: "rgba(243,156,18,0.15)", backgroundColor: "rgba(255,252,245,0.95)" },
  snackRow:   { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, paddingVertical: 7 },
  snackDiv:   { borderBottomWidth: 1, borderColor: "rgba(243,156,18,0.08)" },
  snackEmoji: { fontSize: 16 },
  snackName:  { fontSize: 10, fontWeight: "700", color: CHARCOAL },
  snackSub:   { fontSize: 8, color: MUTED, marginTop: 1 },
  snackKcal:  { fontSize: 11, fontWeight: "800", color: "#F39C12" },
  snackUnit:  { fontSize: 8, fontWeight: "500", color: MUTED },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = new Date();
  const [viewYear,     setViewYear]     = useState(today.getFullYear());
  const [viewMonth,    setViewMonth]    = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(TODAY_STR);
  const [importantDays, setImportantDays] = useState<Set<string>>(new Set());
  const [taggedMeals,   setTaggedMeals]   = useState<Set<string>>(new Set());
  const [waterPerDay,   setWaterPerDay]   = useState<Record<string, number>>({});

  // ── Real meal data from API ──────────────────────────────────────────────────
  // Keyed by date string YYYY-MM-DD; loaded on demand when a date is selected
  const [mealCache, setMealCache] = useState<Record<string, LoggedMeal[]>>({});
  const [loadingMeals, setLoadingMeals] = useState(false);
  // User profile — needed for calorie target in ActivityThread
  const [calorieTarget, setCalorieTarget] = useState(2000);
  // Use a ref to check cache membership without adding mealCache to useCallback deps
  // (adding it would recreate fetchMealsForDate on every fetch → infinite loop).
  // This is intentional: the ref provides a stable reference to the latest cache state
  // without triggering re-renders or dependency changes.
  const mealCacheRef = useRef<Record<string, LoggedMeal[]>>({});

  const fetchMealsForDate = useCallback(async (dateStr: string, force = false) => {
    // Cheap path (mount / date-change) uses the cache; a forced refresh
    // (on focus, after a meal is logged elsewhere) bypasses it and re-fetches.
    if (!force && mealCacheRef.current[dateStr] !== undefined) return; // already fetched
    setLoadingMeals(true);
    try {
      const res = await apiFetch(`/api/v1/meals?date=${dateStr}`);
      if (res.ok) {
        const data: MealsListResponse = await res.json();
        mealCacheRef.current = { ...mealCacheRef.current, [dateStr]: data.meals };
        setMealCache(prev => ({ ...prev, [dateStr]: data.meals }));
      } else {
        mealCacheRef.current = { ...mealCacheRef.current, [dateStr]: [] };
        setMealCache(prev => ({ ...prev, [dateStr]: [] }));
      }
    } catch (err) {
      // Offline or network error - cache empty array to prevent retry spam
      console.log("[ProgressScreen] Failed to fetch meals for", dateStr, ":", err instanceof Error ? err.message : String(err));
      mealCacheRef.current = { ...mealCacheRef.current, [dateStr]: [] };
      setMealCache(prev => ({ ...prev, [dateStr]: [] }));
    } finally {
      setLoadingMeals(false);
    }
  }, []); // ← no mealCache dep — uses ref for cache-hit check (intentional)

  // Fetch today's meals on mount
  useEffect(() => { fetchMealsForDate(TODAY_STR); }, []);

  // Fetch user profile for calorie target
  useEffect(() => {
    apiFetch("/api/v1/profile")
      .then(r => r.ok ? r.json() : null)
      .then((p) => { if (p?.calorie_target) setCalorieTarget(p.calorie_target); })
      .catch((err) => console.log("[ProgressScreen] Failed to fetch profile:", err instanceof Error ? err.message : String(err)));
  }, []);

  // Fetch when selected date changes
  useEffect(() => {
    if (selectedDate) fetchMealsForDate(selectedDate);
  }, [selectedDate]);

  // On focus, force-refresh today + the selected date so a meal logged on
  // another screen shows up here (day detail, monthly totals, calendar dot).
  useFocusEffect(
    useCallback(() => {
      fetchMealsForDate(TODAY_STR, true);
      if (selectedDate && selectedDate !== TODAY_STR) fetchMealsForDate(selectedDate, true);
    }, [selectedDate, fetchMealsForDate]),
  );

  // ── Calendar math ────────────────────────────────────────────────────────────
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = useMemo<(number | null)[]>(() => [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ], [firstDayOfWeek, daysInMonth]);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  const toggleImportant = useCallback((dateStr: string) => {
    setImportantDays(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr);
      return next;
    });
  }, []);

  const toggleMealTag = useCallback((mealId: string) => {
    setTaggedMeals(prev => {
      const next = new Set(prev);
      if (next.has(mealId)) next.delete(mealId); else next.add(mealId);
      return next;
    });
  }, []);

  const toggleWater = useCallback((i: number) => {
    if (!selectedDate) return;
    setWaterPerDay(prev => {
      const curr = prev[selectedDate] ?? 0;
      return { ...prev, [selectedDate]: Math.max(0, i + 1 === curr ? curr - 1 : i + 1) };
    });
  }, [selectedDate]);

  const selectedMeals: LoggedMeal[] = useMemo(
    () => (selectedDate ? (mealCache[selectedDate] ?? []) : []),
    [selectedDate, mealCache],
  );
  const selectedWater       = selectedDate ? (waterPerDay[selectedDate] ?? 0) : 0;
  const isSelectedImportant = selectedDate ? importantDays.has(selectedDate) : false;

  const aiInsight = useMemo(() => {
    if (!selectedDate) return null;
    const meals     = mealCache[selectedDate] ?? [];
    const totalKcal = Math.round(meals.reduce((s, m) => s + m.total_calories, 0));
    if (!meals.length)     return "No meals logged yet. Start tracking to get insights! 🌟";
    if (totalKcal > 2200)  return `High intake day — ${totalKcal} kcal. Consider a lighter dinner. 💡`;
    if (totalKcal < 800)   return "Low intake today. Make sure to hit your protein goal. 💪";
    return `Good day! ${totalKcal} kcal logged. You're on track for your goals. ✅`;
  }, [selectedDate, mealCache]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Month nav header ────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.navBtn} onPress={prevMonth}>
          <ChevronLeft size={18} color={CHARCOAL} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity style={styles.navBtn} onPress={nextMonth}>
          <ChevronRight size={18} color={CHARCOAL} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* ── Monthly stats bar ────────────────────────────────────────── */}
      <View style={styles.statsBar}>
        {MONTHLY_STATS.map((stat, i) => (
          <React.Fragment key={stat.label}>
            {i > 0 && <View style={styles.statDivider} />}
            <View style={styles.statTile}>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Sample-data disclosure ────────────────────────────────── */}
        <View style={styles.sampleBanner}>
          <Text style={styles.sampleBannerText}>
            Trends &amp; sleep cards show sample data. Calendar, Activity Thread and AI Insight are live.
          </Text>
        </View>

        {/* ── Month overview card ───────────────────────────────────── */}
        <View style={[styles.overviewCard, CARD_SHADOW]}>
          {MONTH_OVERVIEW.map((o, i) => (
            <React.Fragment key={o.label}>
              {i > 0 && <View style={styles.ovDivider} />}
              <View style={styles.ovTile}>
                <Text style={styles.ovValue}>{o.value}</Text>
                <Text style={styles.ovLabel}>{o.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* ── Calendar ──────────────────────────────────────────────── */}
        <View style={[styles.calCard, CARD_SHADOW]}>
          {/* Day headers */}
          <View style={styles.calRow}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={styles.calDayHdr}>{d}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.calGrid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={styles.calCell} />;
              const dateStr   = toDateParam(new Date(viewYear, viewMonth, day));
              const isToday   = dateStr === TODAY_STR;
              const isSel     = dateStr === selectedDate;
              const isImp     = importantDays.has(dateStr);
              // Show green dot if we've fetched meals for this day and there are some
              const hasMeals  = (mealCache[dateStr]?.length ?? 0) > 0;
              const dotColor  = hasMeals ? "#22C55E" : PERF[dateStr];

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[styles.calCell, isToday && styles.todayCell, isSel && styles.selCell]}
                  onPress={() => setSelectedDate(dateStr)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.calDayNum, isToday && styles.todayNum, isSel && styles.selNum]}>
                    {day}
                  </Text>
                  {dotColor && !isSel && (
                    <View style={[styles.perfDot, { backgroundColor: dotColor }]} />
                  )}
                  {isImp && (
                    <Star size={8} color={isSel ? WHITE : "#F59E0B"} fill={isSel ? WHITE : "#F59E0B"} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Dot legend */}
          <View style={styles.calLegend}>
            {[
              { color: "#22C55E", label: "Great" },
              { color: "#0EA5E9", label: "Good"  },
              { color: "#EAB308", label: "OK"    },
              { color: "#EF4444", label: "Poor"  },
            ].map((l) => (
              <View key={l.label} style={styles.legItem}>
                <View style={[styles.legDot, { backgroundColor: l.color }]} />
                <Text style={styles.legLabel}>{l.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Journey chart ─────────────────────────────────────────── */}
        <JourneyChart />

        {/* ── Sleep Index ───────────────────────────────────────────── */}
        <SleepIndexCard />

        {/* ── AI Nutrition Insight ─────────────────────────────────── */}
        <AIInsightCard />

        {/* ── Activity Thread ───────────────────────────────────────── */}
        <ActivityThread
          meals={mealCache[TODAY_STR] ?? []}
          calorieTarget={calorieTarget}
          loading={loadingMeals && (mealCache[TODAY_STR] === undefined)}
        />

        {/* ── Selected day detail ───────────────────────────────────── */}
        {selectedDate && (
          <View style={styles.daySection}>
            <View style={styles.daySectionHdr}>
              <Text style={styles.dayTitle}>
                {selectedDate === TODAY_STR ? "Today" : selectedDate}
              </Text>
              <TouchableOpacity
                style={[styles.impBtn, isSelectedImportant && styles.impBtnOn]}
                onPress={() => toggleImportant(selectedDate)}
                activeOpacity={0.75}
              >
                <Star
                  size={12}
                  color={isSelectedImportant ? WHITE : "#F59E0B"}
                  fill={isSelectedImportant ? WHITE : "none"}
                />
                <Text style={[styles.impBtnTxt, isSelectedImportant && { color: WHITE }]}>
                  {isSelectedImportant ? "Important" : "Mark Important"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* AI Insight */}
            {aiInsight && (
              <View style={styles.aiCard}>
                <View style={styles.aiIcon}>
                  <Zap size={13} color={WHITE} strokeWidth={2} />
                </View>
                <Text style={styles.aiText}>{aiInsight}</Text>
              </View>
            )}

            {/* Meals */}
            {selectedMeals.length > 0 ? (
              <View style={[styles.mealsCard, CARD_SHADOW]}>
                <Text style={styles.mealsTitle}>Meals Logged</Text>
                {selectedMeals.map((meal, i) => {
                  const isTagged  = taggedMeals.has(String(meal.id));
                  const itemNames = (meal.food_items as any[]).map(f => f.item_name).join(", ");
                  const MEAL_EMOJIS: Record<string, string> = {
                    Breakfast: "🥘", Lunch: "🍛", Snacks: "🍎", Dinner: "🌙",
                  };
                  return (
                    <View key={meal.id}>
                      {i > 0 && <View style={styles.mealDiv} />}
                      <View style={styles.mealRow}>
                        <Text style={styles.mealEmoji}>{MEAL_EMOJIS[meal.meal_type] ?? "🍽️"}</Text>
                        <View style={styles.mealInfo}>
                          <Text style={styles.mealName} numberOfLines={1}>{itemNames}</Text>
                          <Text style={styles.mealType}>{meal.meal_type}</Text>
                        </View>
                        <Text style={styles.mealKcal}>{Math.round(meal.total_calories)} kcal</Text>
                        <TouchableOpacity
                          style={styles.tagBtn}
                          onPress={() => toggleMealTag(String(meal.id))}
                          activeOpacity={0.7}
                        >
                          <Tag
                            size={14}
                            color={isTagged ? SKY : MUTED}
                            fill={isTagged ? SKY : "none"}
                            strokeWidth={2}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTxt}>
                  {loadingMeals ? "Loading meals…" : "No meals logged for this day"}
                </Text>
              </View>
            )}

            <WaterTracker count={selectedWater} onToggle={toggleWater} />
          </View>
        )}

        {/* ── Important days log ────────────────────────────────────── */}
        {importantDays.size > 0 && (
          <View style={[styles.impListCard, CARD_SHADOW]}>
            <Text style={styles.impListTitle}>Important Days</Text>
            {[...importantDays].sort().map((d) => (
              <TouchableOpacity
                key={d}
                style={styles.impListRow}
                onPress={() => setSelectedDate(d)}
                activeOpacity={0.7}
              >
                <Star size={12} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.impListDate}>{d}</Text>
                <Text style={styles.impListView}>View ›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <FloatingNav
        active="progress"
        onHome={() => router.navigate("/")}
        onProgress={() => {}}
        onDiary={() => router.navigate("/diary")}
        onCamera={() => router.push("/camera")}
        onMore={() => router.push("/profile")}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120, gap: 14 },

  // Sample-data disclosure banner
  sampleBanner:     { backgroundColor: "#FFF7ED", borderRadius: 14, borderWidth: 1, borderColor: "rgba(249,115,22,0.25)", paddingHorizontal: 14, paddingVertical: 10 },
  sampleBannerText: { fontSize: 11, fontWeight: "500", color: "#9A3412", lineHeight: 16 },

  // Header
  header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  navBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: WHITE, alignItems: "center", justifyContent: "center", ...CARD_SHADOW },
  monthTitle: { fontSize: 17, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.4 },

  // Stats bar
  statsBar:    { flexDirection: "row", marginHorizontal: 20, marginBottom: 4, backgroundColor: WHITE, borderRadius: 18, paddingVertical: 12, ...CARD_SHADOW, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  statTile:    { flex: 1, alignItems: "center", gap: 2 },
  statDivider: { width: 1, backgroundColor: "rgba(0,0,0,0.07)", marginVertical: 4 },
  statValue:   { fontSize: 17, fontWeight: "800", letterSpacing: -0.6 },
  statLabel:   { fontSize: 9,  fontWeight: "600", color: MUTED, letterSpacing: 0.3, textTransform: "uppercase" },

  // Month overview
  overviewCard: { backgroundColor: WHITE, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  ovTile:       { flex: 1, alignItems: "center", gap: 3 },
  ovDivider:    { width: 1, alignSelf: "stretch", backgroundColor: "rgba(0,0,0,0.07)", marginVertical: 2 },
  ovValue:      { fontSize: 15, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.5 },
  ovLabel:      { fontSize: 9,  fontWeight: "600", color: MUTED, letterSpacing: 0.3 },

  // Calendar
  calCard:    { backgroundColor: WHITE, borderRadius: 24, padding: 16, gap: 0, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  calRow:     { flexDirection: "row", marginBottom: 6 },
  calDayHdr:  { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.4 },
  calGrid:    { flexDirection: "row", flexWrap: "wrap" },
  calCell:    { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  calDayNum:  { fontSize: 13, fontWeight: "500", color: CHARCOAL },
  todayCell:  { backgroundColor: "rgba(85,205,252,0.1)", borderRadius: 12 },
  todayNum:   { color: SKY, fontWeight: "800" },
  selCell:    { backgroundColor: SKY, borderRadius: 12 },
  selNum:     { color: WHITE, fontWeight: "800" },
  perfDot:    { width: 5, height: 5, borderRadius: 2.5 },
  calLegend:  { flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 10 },
  legItem:    { flexDirection: "row", alignItems: "center", gap: 4 },
  legDot:     { width: 7, height: 7, borderRadius: 3.5 },
  legLabel:   { fontSize: 9, fontWeight: "600", color: MUTED },

  // Day detail section
  daySection:    { gap: 10 },
  daySectionHdr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayTitle:      { fontSize: 16, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.3 },
  impBtn:        { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FEF9C3", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  impBtnOn:      { backgroundColor: "#F59E0B" },
  impBtnTxt:     { fontSize: 11, fontWeight: "700", color: "#F59E0B" },

  // AI insight card
  aiCard:  { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(85,205,252,0.08)", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "rgba(85,205,252,0.2)" },
  aiIcon:  { width: 28, height: 28, borderRadius: 14, backgroundColor: SKY, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  aiText:  { flex: 1, fontSize: 13, fontWeight: "500", color: CHARCOAL, lineHeight: 19 },

  // Meals
  mealsCard:  { backgroundColor: WHITE, borderRadius: 18, padding: 14, gap: 0, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  mealsTitle: { fontSize: 12, fontWeight: "700", color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },
  mealDiv:    { height: 1, backgroundColor: "rgba(0,0,0,0.05)", marginVertical: 8 },
  mealRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  mealEmoji:  { fontSize: 22 },
  mealInfo:   { flex: 1, gap: 1 },
  mealName:   { fontSize: 13, fontWeight: "700", color: CHARCOAL },
  mealType:   { fontSize: 10, fontWeight: "500", color: MUTED },
  mealKcal:   { fontSize: 12, fontWeight: "700", color: SKY },
  tagBtn:     { padding: 4 },

  // Empty state
  emptyCard: { backgroundColor: WHITE, borderRadius: 18, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  emptyTxt:  { fontSize: 13, fontWeight: "500", color: MUTED },

  // Important days list
  impListCard:  { backgroundColor: WHITE, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  impListTitle: { fontSize: 12, fontWeight: "700", color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" },
  impListRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  impListDate:  { flex: 1, fontSize: 13, fontWeight: "600", color: CHARCOAL },
  impListView:  { fontSize: 12, fontWeight: "700", color: SKY },
});
