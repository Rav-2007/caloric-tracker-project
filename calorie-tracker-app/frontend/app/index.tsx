import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
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
  G,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import {
  ChevronRight,
  Flame,
  History,
  Plus,
  ShieldCheck,
  X,
} from "@/components/icons";
import { FloatingNav } from "@/components/FloatingNav";
import { apiFetch } from "@/constants/api";
import type { TodaySummary, UserProfile } from "@/types/api";

// ─── Design tokens ───────────────────────────────────────────────────────────
const BG       = "#F8FAFC";
const SKY      = "#55CDFC";
const CHARCOAL = "#1A1D20";
const MUTED    = "#94A3B8";
const WHITE    = "#FFFFFF";

const CARD_SHADOW = {
  shadowColor:   "#000",
  shadowOffset:  { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius:  16,
  elevation:     6,
} as const;

// ─── Calorie budget — filled from API ────────────────────────────────────────
// (target comes from profile.calorie_target at runtime)

// ─── Hero ring geometry ──────────────────────────────────────────────────────
const RING_SIZE      = 116;
const RING_CENTER    = RING_SIZE / 2;
const RING_RADIUS    = 46;
const STROKE_WIDTH   = 9;
const CIRCUMFERENCE  = 2 * Math.PI * RING_RADIUS;

// ─── Static data ─────────────────────────────────────────────────────────────
const STREAK       = 0;
const TREND_7      = [false, false, false, false, false, false, false];

// Real health score (0–10) from today's calorie + macro adherence to targets.
// Returns null when nothing has been logged yet so the UI shows "—" instead of
// a fabricated number.
function computeHealthScore(summary: TodaySummary, profile: UserProfile): number | null {
  if (!summary.meals.length) return null;
  const adherence = (value: number, target: number) =>
    target > 0 ? 1 - Math.min(Math.abs(value - target) / target, 1) : 0;
  const cal   = adherence(summary.total_calories, profile.calorie_target);
  const macro = (
    adherence(summary.total_protein_g, profile.protein_target_g) +
    adherence(summary.total_carbs_g,   profile.carbs_target_g) +
    adherence(summary.total_fat_g,     profile.fat_target_g)
  ) / 3;
  return Math.round((0.5 * cal + 0.5 * macro) * 10 * 10) / 10;
}

// ─── AvatarWithRing ───────────────────────────────────────────────────────────
function AvatarWithRing({ initials }: { initials: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 5000, useNativeDriver: true }),
    ).start();
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={av.wrap}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Svg width={52} height={52} viewBox="0 0 52 52">
          <Defs>
            <LinearGradient id="avRingG" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%"   stopColor="#55CDFC" />
              <Stop offset="28%"  stopColor="#F97316" />
              <Stop offset="58%"  stopColor="#34D399" />
              <Stop offset="100%" stopColor="#A78BFA" />
            </LinearGradient>
          </Defs>
          <Circle cx={26} cy={26} r={24} stroke="url(#avRingG)" strokeWidth={2.5} fill="none" />
        </Svg>
      </Animated.View>
      <View style={av.inner}>
        <Text style={av.initials}>{initials}</Text>
      </View>
    </View>
  );
}

const av = StyleSheet.create({
  wrap:     { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  inner:    { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: SKY, alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 14, fontWeight: "800", color: WHITE, letterSpacing: -0.3 },
});

// ─── HealthScoreCard ──────────────────────────────────────────────────────────
function HealthScoreCard({ score }: { score: number | null }) {
  const has   = score !== null;
  const s     = score ?? 0;
  const color = !has ? MUTED : s >= 9 ? "#0D9488" : s >= 7 ? "#22C55E" : s >= 4 ? "#EAB308" : "#EF4444";
  const label = !has
    ? "Log a meal to see today's score"
    : s >= 9
    ? "Optimal — Peak Performance! 🎯"
    : s >= 7
    ? "Healthy — Great work! 💪"
    : s >= 4
    ? "Moderate — Keep pushing forward"
    : "Needs work — refuel mindfully";

  return (
    <View style={[hsc.card, CARD_SHADOW]}>
      {/* Score row */}
      <View style={hsc.top}>
        <View style={{ flex: 1 }}>
          <Text style={hsc.heading}>Health Score</Text>
          <Text style={hsc.sub}>{label}</Text>
        </View>
        <View style={hsc.numRow}>
          <Text style={[hsc.num, { color }]}>{has ? s.toFixed(1) : "—"}</Text>
          <Text style={hsc.den}>/10</Text>
        </View>
      </View>

      {/* 7-day trend squares */}
      <Text style={hsc.trendTitle}>7-Day Trend</Text>
      <View style={hsc.trendRow}>
        {TREND_7.map((on, i) => (
          <View
            key={i}
            style={[
              hsc.sq,
              on && { backgroundColor: color, shadowColor: color, shadowOpacity: 0.4, shadowRadius: 5, elevation: 3 },
            ]}
          />
        ))}
      </View>

      {/* Streak footer */}
      <View style={hsc.foot}>
        <Text style={hsc.footLabel}>Current Streak</Text>
        <View style={hsc.footRight}>
          <Flame size={12} color="#F97316" fill="#F97316" />
          <Text style={hsc.streak}>{STREAK} days</Text>
        </View>
      </View>
    </View>
  );
}

const hsc = StyleSheet.create({
  card:       { backgroundColor: WHITE, borderRadius: 24, padding: 20, gap: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  top:        { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  heading:    { fontSize: 11, fontWeight: "700", color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 },
  sub:        { fontSize: 13, fontWeight: "500", color: CHARCOAL, lineHeight: 19 },
  numRow:     { flexDirection: "row", alignItems: "baseline", gap: 1 },
  num:        { fontSize: 44, fontWeight: "800", letterSpacing: -2.5, lineHeight: 48 },
  den:        { fontSize: 13, fontWeight: "500", color: MUTED },
  trendTitle: { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: -4 },
  trendRow:   { flexDirection: "row", gap: 5 },
  sq:         { flex: 1, height: 26, borderRadius: 6, backgroundColor: "#EEF2FF" },
  foot:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footLabel:  { fontSize: 10, fontWeight: "600", color: MUTED },
  footRight:  { flexDirection: "row", alignItems: "center", gap: 4 },
  streak:     { fontSize: 12, fontWeight: "700", color: "#F97316" },
});

// ─── MacroStrip ───────────────────────────────────────────────────────────────
function MacroStrip({ protein, carbs, fat, proteinTarget, carbsTarget, fatTarget }: {
  protein: number; carbs: number; fat: number;
  proteinTarget: number; carbsTarget: number; fatTarget: number;
}) {
  const macros = [
    { label: "Protein", val: protein, target: proteinTarget, unit: "g", color: "#F97316", remaining: Math.max(proteinTarget - protein, 0) },
    { label: "Carbs",   val: carbs,   target: carbsTarget,   unit: "g", color: "#0EA5E9", remaining: Math.max(carbsTarget - carbs, 0) },
    { label: "Fats",    val: fat,     target: fatTarget,     unit: "g", color: "#F59E0B", remaining: Math.max(fatTarget - fat, 0) },
  ];
  const barAnims = useRef(macros.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel(
      macros.map((m, i) =>
        Animated.timing(barAnims[i], {
          toValue:         1,
          duration:        1300,
          delay:           800 + i * 140,
          useNativeDriver: false,
        }),
      ),
    ).start();
  }, [protein, carbs, fat]);

  return (
    <View style={[ms.card, CARD_SHADOW]}>
      {macros.map((m, i) => (
        <React.Fragment key={m.label}>
          {i > 0 && <View style={ms.divider} />}
          <View style={ms.col}>
            <Text style={ms.label}>{m.label}</Text>
            <Text style={ms.val}>
              {m.val}
              <Text style={ms.unit}>{m.unit}</Text>
            </Text>
            <View style={ms.track}>
              <Animated.View
                style={[
                  ms.fill,
                  {
                    width: barAnims[i].interpolate({
                      inputRange:  [0, 1],
                      outputRange: ["0%", `${Math.min(Math.round((m.val / Math.max(m.target, 1)) * 100), 100)}%`],
                    }),
                    backgroundColor: m.color,
                  },
                ]}
              />
            </View>
            <Text style={[ms.rem, { color: m.color }]}>
              {m.remaining}{m.unit} left
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const ms = StyleSheet.create({
  card:    { backgroundColor: WHITE, borderRadius: 20, padding: 18, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.04)" },
  col:     { flex: 1, alignItems: "center", gap: 5 },
  divider: { width: 1, alignSelf: "stretch", backgroundColor: "rgba(0,0,0,0.07)", marginHorizontal: 2 },
  label:   { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.4, textTransform: "uppercase" },
  val:     { fontSize: 20, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.8 },
  unit:    { fontSize: 11, fontWeight: "500" },
  track:   { width: "82%", height: 5, borderRadius: 10, backgroundColor: "#EEF2FF", overflow: "hidden" },
  fill:    { height: "100%", borderRadius: 10 },
  rem:     { fontSize: 10, fontWeight: "600" },
});

// ─── ScanCarousel ─────────────────────────────────────────────────────────────
const SCAN_COLORS = [
  { from: "#FEF3C7", to: "#FDE68A" },
  { from: "#DCFCE7", to: "#BBF7D0" },
  { from: "#DBEAFE", to: "#BFDBFE" },
  { from: "#EDE9FE", to: "#DDD6FE" },
];
const MEAL_EMOJIS: Record<string, string> = {
  Breakfast: "🥘", Lunch: "🍛", Snacks: "🍎", Dinner: "🌙",
};

function ScanCarousel({ meals, onAdd }: { meals: TodaySummary["meals"]; onAdd: () => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={sc.row}
    >
      {meals.map((meal, idx) => {
        const col = SCAN_COLORS[idx % SCAN_COLORS.length];
        const time = new Date(meal.logged_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        return (
          <View key={meal.id} style={[sc.card, { backgroundColor: col.from }, CARD_SHADOW]}>
            <Text style={sc.emoji}>{MEAL_EMOJIS[meal.meal_type] ?? "🍽️"}</Text>
            <Text style={sc.name} numberOfLines={2}>
              {(meal.food_items as any[]).map(f => f.item_name).join(", ")}
            </Text>
            <Text style={sc.meta}>{meal.meal_type}  •  {time}</Text>
            <View style={sc.kcalRow}>
              <Text style={sc.kcal}>{Math.round(meal.total_calories)}</Text>
              <Text style={sc.kcalU}>kcal</Text>
            </View>
          </View>
        );
      })}
      <TouchableOpacity style={sc.addCard} onPress={onAdd} activeOpacity={0.75}>
        <View style={sc.addCircle}>
          <Plus size={20} color={SKY} strokeWidth={2.5} />
        </View>
        <Text style={sc.addLabel}>{"Scan\nFood"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const sc = StyleSheet.create({
  row:      { paddingHorizontal: 20, gap: 12, paddingVertical: 4 },
  card:     { width: 142, borderRadius: 20, padding: 14, gap: 4 },
  emoji:    { fontSize: 30 },
  name:     { fontSize: 13, fontWeight: "700", color: CHARCOAL, lineHeight: 18, marginTop: 4 },
  meta:     { fontSize: 10, fontWeight: "500", color: MUTED },
  kcalRow:  { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 4 },
  kcal:     { fontSize: 20, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.8 },
  kcalU:    { fontSize: 10, fontWeight: "600", color: MUTED },
  addCard:  { width: 100, minHeight: 130, borderRadius: 20, borderWidth: 2, borderColor: "rgba(85,205,252,0.35)", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 8 },
  addCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(85,205,252,0.12)", alignItems: "center", justifyContent: "center" },
  addLabel: { fontSize: 12, fontWeight: "700", color: SKY, textAlign: "center", lineHeight: 18 },
});

// ─── Profile bottom sheet ─────────────────────────────────────────────────────
function ProfileSheet({ visible, onClose, profile, router, consumedKcal, targetKcal, healthScore }: { visible: boolean; onClose: () => void; profile: UserProfile; router: ReturnType<typeof useRouter>; consumedKcal: number; targetKcal: number; healthScore: number | null }) {
  const sheetInsets = useSafeAreaInsets();
  const hsHas   = healthScore !== null;
  const hsText  = hsHas ? healthScore!.toFixed(1) : "—";
  const hsColor = !hsHas ? MUTED : healthScore! >= 9 ? "#0D9488" : healthScore! >= 7 ? "#22C55E" : healthScore! >= 4 ? "#EAB308" : "#EF4444";
  const hsPct   = hsHas ? Math.max(0, Math.min(100, healthScore! * 10)) : 0;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity style={pb.backdrop} activeOpacity={1} onPress={onClose} />

      {/* Sheet */}
      <View style={[pb.sheet, { paddingBottom: Math.max(sheetInsets.bottom, 24) }]}>
        {/* Handle + close */}
        <View style={pb.handleRow}>
          <View style={pb.handle} />
          <TouchableOpacity onPress={onClose} style={pb.closeBtn} activeOpacity={0.75}>
            <X size={16} color={CHARCOAL} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* Avatar + name */}
        <View style={pb.avatarRow}>
          <View style={pb.avatarCircle}>
            <Text style={pb.avatarInitials}>
              {profile.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={pb.nameText}>{profile.name}</Text>
            <View style={pb.tierRow}>
              <ShieldCheck size={10} color={SKY} strokeWidth={2.5} />
              <Text style={pb.tierText}>SWASTH PRO</Text>
            </View>
            {profile.weight_kg && (
              <Text style={pb.streakSub}>{profile.weight_kg} kg{profile.height_cm ? ` · ${profile.height_cm} cm` : ""}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => { onClose(); router.push("/profile"); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#EFF6FF", borderRadius: 10 }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: SKY }}>Edit ›</Text>
          </TouchableOpacity>
        </View>

        <View style={pb.divider} />

        {/* Day streak */}
        <View style={[pb.section, pb.streakSection]}>
          <View style={pb.sectionHeader}>
            <Text style={pb.sectionLabel}>DAY STREAK</Text>
          </View>
          <View style={pb.streakRow}>
            <View style={pb.streakBig}>
              <Text style={pb.streakNum}>{STREAK}</Text>
              <Flame size={22} color="#F97316" fill="#F97316" />
            </View>
            <Text style={pb.streakHint}>
              {STREAK > 0
                ? `${STREAK}-day logging streak — keep it going!`
                : "Log a meal today to start your streak."}
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={pb.statsGrid}>
          {/* Health score */}
          <View style={[pb.statCard, { flex: 1.2 }]}>
            <Text style={pb.statLabel}>HEALTH SCORE</Text>
            <Text style={[pb.statBig, { color: hsColor }]}>{hsText}</Text>
            <Text style={pb.statSub}>out of 10</Text>
            <View style={[pb.statBlob, { backgroundColor: "rgba(148,163,184,0.10)" }]} />
          </View>
          <View style={pb.statsRight}>
            {/* Calories */}
            <View style={pb.statCard}>
              <Text style={pb.statLabel}>CALORIES</Text>
              <Text style={[pb.statBig, { color: "#0EA5E9", fontSize: 22 }]}>{consumedKcal}</Text>
              <Text style={pb.statSub}>of {targetKcal.toLocaleString()}</Text>
              <View style={[pb.statBlob, { backgroundColor: "rgba(14,165,233,0.12)" }]} />
            </View>
            {/* Weight */}
            <View style={pb.statCard}>
              <Text style={pb.statLabel}>WEIGHT</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
                <Text style={[pb.statBig, { color: "#22C55E", fontSize: 22 }]}>
                  {profile.weight_kg ?? "—"}
                </Text>
                <Text style={[pb.statSub, { marginBottom: 2 }]}>kg</Text>
              </View>
              <Text style={pb.statSub}>{profile.height_cm ? `${profile.height_cm} cm` : "Set in profile"}</Text>
              <View style={[pb.statBlob, { backgroundColor: "rgba(34,197,94,0.12)" }]} />
            </View>
          </View>
        </View>

        {/* Score scale bar */}
        <View style={pb.scaleRow}>
          <Text style={pb.scaleLabel}>HEALTH SCORE SCALE</Text>
          <Text style={[pb.scaleBig, { color: hsColor }]}>{hsText} <Text style={pb.scaleDen}>/10</Text></Text>
        </View>
        <View style={pb.scaleBar}>
          {["#EF4444","#F97316","#EAB308","#22C55E","#0D9488"].map((c, i) => (
            <View key={i} style={[pb.scaleSegment, { backgroundColor: c }]} />
          ))}
          {hsHas && (
            <View style={[pb.scaleDot, { left: `${hsPct}%`, borderColor: hsColor }]} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const pb = StyleSheet.create({
  backdrop:       { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:          { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: WHITE, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 20, paddingTop: 12 },
  handleRow:      { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  handle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0" },
  closeBtn:       { position: "absolute", right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  avatarRow:      { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  avatarCircle:   { width: 56, height: 56, borderRadius: 28, backgroundColor: SKY, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(85,205,252,0.3)" },
  avatarInitials: { fontSize: 20, fontWeight: "800", color: WHITE },
  nameText:       { fontSize: 18, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.4 },
  tierRow:        { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  tierText:       { fontSize: 10, fontWeight: "700", color: SKY, letterSpacing: 0.3 },
  tierDot:        { fontSize: 10, color: MUTED },
  streakSub:      { fontSize: 11, fontWeight: "500", color: MUTED, marginTop: 3 },
  divider:        { height: 1, backgroundColor: "#F1F5F9", marginBottom: 16 },
  section:        { marginBottom: 16 },
  sectionHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  sectionLabel:   { fontSize: 9, fontWeight: "700", color: MUTED, letterSpacing: 0.8 },
  xpNum:          { fontSize: 11, fontWeight: "700", color: CHARCOAL },
  xpTrack:        { height: 6, backgroundColor: "#EEF2FF", borderRadius: 3, overflow: "hidden" },
  xpFill:         { height: 6, borderRadius: 3, backgroundColor: SKY },
  xpSub:          { fontSize: 10, fontWeight: "500", color: MUTED, marginTop: 5 },
  streakSection:  { backgroundColor: "#FAFBFF", borderRadius: 18, padding: 14 },
  streakRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  streakBig:      { flexDirection: "row", alignItems: "center", gap: 4 },
  streakNum:      { fontSize: 40, fontWeight: "900", color: "#F97316", letterSpacing: -2 },
  streakHint:     { flex: 1, fontSize: 12, fontWeight: "500", color: MUTED, lineHeight: 17 },
  streakChips:    { flex: 1, gap: 6 },
  chip:           { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, alignSelf: "flex-start" },
  chipTxt:        { fontSize: 11, fontWeight: "700" },
  streakSub2:     { fontSize: 10, fontWeight: "600", color: "#F97316" },
  statsGrid:      { flexDirection: "row", gap: 10, marginBottom: 14 },
  statsRight:     { flex: 1, gap: 10 },
  statCard:       { backgroundColor: "#F8FAFF", borderRadius: 18, padding: 14, overflow: "hidden" },
  statLabel:      { fontSize: 8, fontWeight: "700", color: MUTED, letterSpacing: 0.8, marginBottom: 4 },
  statBig:        { fontSize: 28, fontWeight: "900", letterSpacing: -1.5, lineHeight: 30 },
  statSub:        { fontSize: 10, fontWeight: "500", color: MUTED },
  statBlob:       { position: "absolute", width: 80, height: 80, borderRadius: 40, right: -20, top: -20 },
  scaleRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  scaleLabel:     { fontSize: 9, fontWeight: "700", color: MUTED, letterSpacing: 0.8 },
  scaleBig:       { fontSize: 16, fontWeight: "800", letterSpacing: -0.5 },
  scaleDen:       { fontSize: 11, fontWeight: "500", color: MUTED },
  scaleBar:       { height: 8, borderRadius: 4, flexDirection: "row", overflow: "hidden", marginBottom: 4, position: "relative" },
  scaleSegment:   { flex: 1 },
  scaleDot:       { position: "absolute", top: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: WHITE, borderWidth: 2.5, borderColor: "#22C55E", marginLeft: -7 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const shimmer = useRef(new Animated.Value(0)).current;
  const [showProfile, setShowProfile] = useState(false);

  const [summary, setSummary] = useState<TodaySummary>({
    total_calories: 0, total_protein_g: 0,
    total_carbs_g: 0,  total_fat_g: 0, meals: [],
  });
  const [profile, setProfile] = useState<UserProfile>({
    id: 0, updated_at: "", name: "User",
    age: null, weight_kg: null, height_cm: null,
    calorie_target: 2000, protein_target_g: 120,
    carbs_target_g: 250,  fat_target_g: 65,
  });

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, profRes] = await Promise.all([
        apiFetch("/api/v1/today-summary"),
        apiFetch("/api/v1/profile"),
      ]);
      if (sumRes.ok)  setSummary(await sumRes.json());
      if (profRes.ok) setProfile(await profRes.json());
    } catch (err) {
      // Offline or network error - keep existing data
      console.log("[HomeScreen] Failed to fetch data:", err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Re-fetch whenever the screen regains focus (e.g. after logging a meal),
  // not only on first mount — keeps today's totals fresh.
  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const consumedKcal  = Math.round(summary.total_calories);
  const targetKcal    = profile.calorie_target;
  const remainingKcal = Math.max(targetKcal - consumedKcal, 0);
  // Guard against division by zero when target is 0
  const remainingFrac = targetKcal > 0 ? remainingKcal / targetKcal : 0;
  const ringOffset    = CIRCUMFERENCE * (1 - Math.min(remainingFrac, 1));
  const pctDisplay    = Math.floor(remainingFrac * 100);
  const healthScore   = computeHealthScore(summary, profile);

  // shimmer is a ref (useRef) that persists across renders and doesn't need to be
  // in the dependency array - the animation runs once on mount and loops forever.
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ]),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shimmerX = shimmer.interpolate({
    inputRange:  [0, 1],
    outputRange: [-300, 500],
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => setShowProfile(true)} activeOpacity={0.8}>
              <AvatarWithRing initials={profile.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() || "U"} />
            </TouchableOpacity>
            <View>
              <Text style={styles.greeting}>Namaste, {profile.name}! 🙏</Text>
              <View style={styles.badgeRow}>
                <ShieldCheck size={10} color={SKY} strokeWidth={2.5} />
                <Text style={styles.badge}>SWASTH PRO</Text>
                <View style={styles.streakPill}>
                  <Flame size={9} color="#F97316" fill="#F97316" />
                  <Text style={styles.streakText}>{STREAK}d streak</Text>
                </View>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.historyBtn} onPress={() => router.push("/diary")} activeOpacity={0.75}>
            <History size={13} color={SKY} strokeWidth={2} />
            <Text style={styles.historyTxt}>History</Text>
          </TouchableOpacity>
        </View>

        {/* ── Health Score ───────────────────────────────────────── */}
        <View style={styles.padH}>
          <HealthScoreCard score={healthScore} />
        </View>

        {/* ── Hero Calorie Card ──────────────────────────────────── */}
        <View style={[styles.heroCard, CARD_SHADOW]}>
          {/* Gradient background */}
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFillObject}
          >
            <Defs>
              <LinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%"   stopColor="#55CDFC" />
                <Stop offset="100%" stopColor="#38BDF8" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={100} height={100} fill="url(#heroGrad)" />
          </Svg>

          {/* Shimmer stripe */}
          <Animated.View
            style={[styles.shimmer, { transform: [{ translateX: shimmerX }] }]}
            pointerEvents="none"
          />

          {/* Content */}
          <View style={styles.heroBody}>
            <View style={styles.heroLeft}>
              <View style={styles.heroLabelRow}>
                <Flame size={14} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                <Text style={styles.heroLabelTxt}>Calories Left</Text>
              </View>
              <Text style={styles.heroNum}>{remainingKcal.toLocaleString()}</Text>
              <Text style={styles.heroUnit}>kcal remaining</Text>
              <Text style={styles.heroBurn}>🔥 {consumedKcal} consumed today</Text>
            </View>

            <View style={styles.ringWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                <Circle
                  cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS}
                  stroke="rgba(255,255,255,0.25)" strokeWidth={STROKE_WIDTH} fill="none"
                />
                <G transform={`rotate(-90, ${RING_CENTER}, ${RING_CENTER})`}>
                  <Circle
                    cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS}
                    stroke="#FFFFFF" strokeWidth={STROKE_WIDTH} fill="none"
                    strokeDasharray={String(CIRCUMFERENCE)}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                  />
                </G>
              </Svg>
              <View style={styles.ringOverlay}>
                <Text style={styles.ringPct}>{pctDisplay}%</Text>
                <Text style={styles.ringGoal}>remaining</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.heroPill} onPress={() => router.push("/diary")} activeOpacity={0.85}>
            <Text style={styles.heroPillTxt}>
              {consumedKcal} / {targetKcal} kcal consumed
            </Text>
            <ChevronRight size={14} color="rgba(255,255,255,0.75)" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* ── Macros ─────────────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Macros Today</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/diary")}>
            <Text style={styles.sectionLink}>Details ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.padH}>
          <MacroStrip
            protein={Math.round(summary.total_protein_g)}
            carbs={Math.round(summary.total_carbs_g)}
            fat={Math.round(summary.total_fat_g)}
            proteinTarget={profile.protein_target_g}
            carbsTarget={profile.carbs_target_g}
            fatTarget={profile.fat_target_g}
          />
        </View>

        {/* ── Today's Scans ──────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Today's Meals</Text>
          <View style={styles.badge2}>
            <Text style={styles.badge2Txt}>{summary.meals.length}</Text>
          </View>
        </View>
        <ScanCarousel meals={summary.meals} onAdd={() => router.push("/camera")} />
      </ScrollView>

      <ProfileSheet visible={showProfile} onClose={() => setShowProfile(false)} profile={profile} router={router} consumedKcal={consumedKcal} targetKcal={targetKcal} healthScore={healthScore} />

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
  root:   { flex: 1, backgroundColor: BG },
  scroll: { paddingBottom: 120, gap: 0 },
  padH:   { paddingHorizontal: 20 },

  // Header
  header:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: 12 },
  greeting:    { fontSize: 16, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.3 },
  badgeRow:    { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  badge:       { fontSize: 9, fontWeight: "800", color: SKY, letterSpacing: 0.6 },
  streakPill:  { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FFF7ED", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  streakText:  { fontSize: 9, fontWeight: "700", color: "#F97316" },
  historyBtn:  { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: WHITE, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, ...CARD_SHADOW },
  historyTxt:  { fontSize: 11, fontWeight: "700", color: SKY },

  // Hero card
  heroCard:     { marginHorizontal: 20, marginTop: 16, marginBottom: 0, borderRadius: 28, overflow: "hidden", minHeight: 178 },
  shimmer:      { position: "absolute", top: 0, bottom: 0, width: 80, backgroundColor: "rgba(255,255,255,0.18)", transform: [{ skewX: "-15deg" }] },
  heroBody:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 22, paddingBottom: 12 },
  heroLeft:     { flex: 1, gap: 2 },
  heroLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  heroLabelTxt: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.85)" },
  heroNum:      { fontSize: 52, fontWeight: "900", color: WHITE, letterSpacing: -3, lineHeight: 54 },
  heroUnit:     { fontSize: 13, fontWeight: "500", color: "rgba(255,255,255,0.7)" },
  heroBurn:     { fontSize: 11, fontWeight: "500", color: "rgba(255,255,255,0.65)", marginTop: 5 },
  ringWrap:     { width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" },
  ringOverlay:  { position: "absolute", alignItems: "center" },
  ringPct:      { fontSize: 22, fontWeight: "800", color: WHITE, letterSpacing: -1 },
  ringGoal:     { fontSize: 9,  fontWeight: "600", color: "rgba(255,255,255,0.7)" },
  heroPill:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.1)", marginHorizontal: 16, marginBottom: 16, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16 },
  heroPillTxt:  { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.9)" },

  // Section headers
  sectionRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.3 },
  sectionLink:  { fontSize: 12, fontWeight: "600", color: SKY },
  badge2:       { backgroundColor: SKY, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badge2Txt:    { fontSize: 11, fontWeight: "700", color: WHITE },
});
