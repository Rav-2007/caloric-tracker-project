import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
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
  TrendingUp,
  X,
} from "@/components/icons";
import { FloatingNav } from "@/components/FloatingNav";

// ─── Design tokens ───────────────────────────────────────────────────────────
const BG       = "#F8F9FA";
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

// ─── Calorie budget ──────────────────────────────────────────────────────────
const TARGET_KCAL    = 2500;
const CONSUMED_KCAL  = 655;
const REMAINING_KCAL = TARGET_KCAL - CONSUMED_KCAL;

// ─── Hero ring geometry ──────────────────────────────────────────────────────
const RING_SIZE      = 116;
const RING_CENTER    = RING_SIZE / 2;
const RING_RADIUS    = 46;
const STROKE_WIDTH   = 9;
const CIRCUMFERENCE  = 2 * Math.PI * RING_RADIUS;
const REMAINING_FRAC = REMAINING_KCAL / TARGET_KCAL;
const RING_OFFSET    = CIRCUMFERENCE * (1 - REMAINING_FRAC);
const PCT_DISPLAY    = Math.floor(REMAINING_FRAC * 100);

// ─── Static data ─────────────────────────────────────────────────────────────
const HEALTH_SCORE = 7.8;
const STREAK       = 21;
const TREND_7      = [false, false, false, false, false, false, true];

const MACROS = [
  { label: "Protein", val: 112, target: 160, unit: "g", pct: 0.70, color: "#F97316", remaining: 48 },
  { label: "Carbs",   val: 182, target: 250, unit: "g", pct: 0.73, color: "#0EA5E9", remaining: 68 },
  { label: "Fats",    val: 58,  target: 70,  unit: "g", pct: 0.83, color: "#F59E0B", remaining: 12 },
];

const SCANS = [
  { emoji: "🥘", name: "Masala Dosa",          mealType: "Breakfast", time: "8:30", kcal: 380, from: "#FEF3C7", to: "#FDE68A" },
  { emoji: "🍛", name: "Paneer Butter Masala",  mealType: "Lunch",     time: "1:15", kcal: 470, from: "#DCFCE7", to: "#BBF7D0" },
];

// ─── AvatarWithRing ───────────────────────────────────────────────────────────
function AvatarWithRing() {
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
        <Text style={av.initials}>RK</Text>
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
function HealthScoreCard() {
  const s     = HEALTH_SCORE;
  const color = s >= 9 ? "#0D9488" : s >= 7 ? "#22C55E" : s >= 4 ? "#EAB308" : "#EF4444";
  const label = s >= 9
    ? "Optimal — Peak Performance! 🎯"
    : s >= 7
    ? "Healthy — Great work, Ravi! 💪"
    : "Moderate — Keep pushing forward";

  return (
    <View style={[hsc.card, CARD_SHADOW]}>
      {/* Score row */}
      <View style={hsc.top}>
        <View style={{ flex: 1 }}>
          <Text style={hsc.heading}>Health Score</Text>
          <Text style={hsc.sub}>{label}</Text>
        </View>
        <View style={hsc.numRow}>
          <Text style={[hsc.num, { color }]}>{s.toFixed(1)}</Text>
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
function MacroStrip() {
  const barAnims = useRef(MACROS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.parallel(
      MACROS.map((m, i) =>
        Animated.timing(barAnims[i], {
          toValue:         1,
          duration:        1300,
          delay:           800 + i * 140,
          useNativeDriver: false,
        }),
      ),
    ).start();
  }, []);

  return (
    <View style={[ms.card, CARD_SHADOW]}>
      {MACROS.map((m, i) => (
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
                      outputRange: ["0%", `${Math.round(m.pct * 100)}%`],
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
function ScanCarousel({ onAdd }: { onAdd: () => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={sc.row}
    >
      {SCANS.map((item) => (
        <View key={item.name} style={[sc.card, { backgroundColor: item.from }, CARD_SHADOW]}>
          <Text style={sc.emoji}>{item.emoji}</Text>
          <Text style={sc.name} numberOfLines={2}>{item.name}</Text>
          <Text style={sc.meta}>{item.mealType}  •  {item.time}</Text>
          <View style={sc.kcalRow}>
            <Text style={sc.kcal}>{item.kcal}</Text>
            <Text style={sc.kcalU}>kcal</Text>
          </View>
        </View>
      ))}

      {/* Add scan button */}
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
const XP_CURRENT = 2340;
const XP_NEXT    = 3000;
const XP_LABEL   = "Health Champion";

function XpBar() {
  const pct  = XP_CURRENT / XP_NEXT;
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: pct, duration: 900, delay: 200, useNativeDriver: false }).start();
  }, []);
  return (
    <View style={pb.xpTrack}>
      <Animated.View
        style={[
          pb.xpFill,
          { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
        ]}
      />
    </View>
  );
}

function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const sheetInsets = useSafeAreaInsets();
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
            <Text style={pb.avatarInitials}>RK</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={pb.nameText}>Ravi Kumar</Text>
            <View style={pb.tierRow}>
              <ShieldCheck size={10} color={SKY} strokeWidth={2.5} />
              <Text style={pb.tierText}>SWASTH PRO</Text>
              <Text style={pb.tierDot}>·</Text>
              <Text style={pb.tierText}>LVL 8</Text>
            </View>
            <Text style={pb.streakSub}>21-day streak · June 2026</Text>
          </View>
        </View>

        <View style={pb.divider} />

        {/* Level progress */}
        <View style={pb.section}>
          <View style={pb.sectionHeader}>
            <Text style={pb.sectionLabel}>LEVEL PROGRESS</Text>
            <Text style={pb.xpNum}>{XP_CURRENT.toLocaleString()} / {XP_NEXT.toLocaleString()} XP</Text>
          </View>
          <XpBar />
          <Text style={pb.xpSub}>
            {(XP_NEXT - XP_CURRENT).toLocaleString()} XP to Level 9 — {XP_LABEL}
          </Text>
        </View>

        {/* Day streak */}
        <View style={[pb.section, pb.streakSection]}>
          <View style={pb.sectionHeader}>
            <Text style={pb.sectionLabel}>DAY STREAK</Text>
            <Text style={pb.streakSub2}>Personal best</Text>
          </View>
          <View style={pb.streakRow}>
            <View style={pb.streakBig}>
              <Text style={pb.streakNum}>21</Text>
              <Flame size={22} color="#F97316" fill="#F97316" />
            </View>
            <View style={pb.streakChips}>
              <View style={[pb.chip, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[pb.chipTxt, { color: "#F97316" }]}>🏆 Personal best</Text>
              </View>
              <View style={[pb.chip, { backgroundColor: "#DCFCE7" }]}>
                <TrendingUp size={10} color="#22C55E" strokeWidth={2.5} />
                <Text style={[pb.chipTxt, { color: "#22C55E" }]}>+3 this week</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats grid */}
        <View style={pb.statsGrid}>
          {/* Health score */}
          <View style={[pb.statCard, { flex: 1.2 }]}>
            <Text style={pb.statLabel}>HEALTH SCORE</Text>
            <Text style={[pb.statBig, { color: "#22C55E" }]}>7.5</Text>
            <Text style={pb.statSub}>out of 10</Text>
            <View style={[pb.statBlob, { backgroundColor: "rgba(34,197,94,0.12)" }]} />
          </View>
          <View style={pb.statsRight}>
            {/* Calories */}
            <View style={pb.statCard}>
              <Text style={pb.statLabel}>CALORIES</Text>
              <Text style={[pb.statBig, { color: "#0EA5E9", fontSize: 22 }]}>{CONSUMED_KCAL}</Text>
              <Text style={pb.statSub}>of {TARGET_KCAL.toLocaleString()}</Text>
              <View style={[pb.statBlob, { backgroundColor: "rgba(14,165,233,0.12)" }]} />
            </View>
            {/* Weight */}
            <View style={pb.statCard}>
              <Text style={pb.statLabel}>WEIGHT</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
                <Text style={[pb.statBig, { color: "#22C55E", fontSize: 22 }]}>72</Text>
                <Text style={[pb.statSub, { marginBottom: 2 }]}>kg</Text>
              </View>
              <Text style={pb.statSub}>−0.8 kg week</Text>
              <View style={[pb.statBlob, { backgroundColor: "rgba(34,197,94,0.12)" }]} />
            </View>
          </View>
        </View>

        {/* Score scale bar */}
        <View style={pb.scaleRow}>
          <Text style={pb.scaleLabel}>HEALTH SCORE SCALE</Text>
          <Text style={[pb.scaleBig, { color: "#22C55E" }]}>7.5 <Text style={pb.scaleDen}>/10</Text></Text>
        </View>
        <View style={pb.scaleBar}>
          {["#EF4444","#F97316","#EAB308","#22C55E","#0D9488"].map((c, i) => (
            <View key={i} style={[pb.scaleSegment, { backgroundColor: c }]} />
          ))}
          <View style={[pb.scaleDot, { left: `${(7.5 / 10) * 100}%` as any }]} />
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

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ]),
    ).start();
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
              <AvatarWithRing />
            </TouchableOpacity>
            <View>
              <Text style={styles.greeting}>Namaste, Ravi! 🙏</Text>
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
          <TouchableOpacity style={styles.historyBtn} activeOpacity={0.75}>
            <History size={13} color={SKY} strokeWidth={2} />
            <Text style={styles.historyTxt}>History</Text>
          </TouchableOpacity>
        </View>

        {/* ── Health Score ───────────────────────────────────────── */}
        <View style={styles.padH}>
          <HealthScoreCard />
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
              <Text style={styles.heroNum}>{REMAINING_KCAL.toLocaleString()}</Text>
              <Text style={styles.heroUnit}>kcal remaining</Text>
              <Text style={styles.heroBurn}>🔥 {CONSUMED_KCAL} consumed today</Text>
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
                    strokeDashoffset={RING_OFFSET}
                    strokeLinecap="round"
                  />
                </G>
              </Svg>
              <View style={styles.ringOverlay}>
                <Text style={styles.ringPct}>{PCT_DISPLAY}%</Text>
                <Text style={styles.ringGoal}>of goal</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.heroPill} activeOpacity={0.85}>
            <Text style={styles.heroPillTxt}>
              {CONSUMED_KCAL} / {TARGET_KCAL} kcal consumed
            </Text>
            <ChevronRight size={14} color="rgba(255,255,255,0.75)" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* ── Macros ─────────────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Macros Today</Text>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={styles.sectionLink}>Details ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.padH}>
          <MacroStrip />
        </View>

        {/* ── Today's Scans ──────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Today's Scans</Text>
          <View style={styles.badge2}>
            <Text style={styles.badge2Txt}>{SCANS.length}</Text>
          </View>
        </View>
        <ScanCarousel onAdd={() => router.push("/camera")} />
      </ScrollView>

      <ProfileSheet visible={showProfile} onClose={() => setShowProfile(false)} />

      <FloatingNav
        active="home"
        onHome={() => {}}
        onProgress={() => router.push("/progress")}
        onDiary={() => router.push("/diary")}
        onCamera={() => router.push("/camera")}
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
