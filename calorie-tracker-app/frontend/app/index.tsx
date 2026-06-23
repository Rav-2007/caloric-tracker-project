import React, { useRef } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  BarChart2,
  BookOpen,
  Camera,
  ChevronRight,
  Flame,
  History,
  Home,
  MoreHorizontal,
  User,
} from "lucide-react-native";
import { PremiumProfileCard } from "@/components/PremiumProfileCard";

// ─── Design tokens ───────────────────────────────────────────────────────────
const OFF_WHITE  = "#F8FAFC";
const SKY_BLUE   = "#55CDFC";
const CHARCOAL   = "#0F172A";
const SLATE_GRAY = "#64748B";
const SCAN_BTN_SIZE = 60;

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
interface MacroData {
  label: string;
  current: number;
  target: number;
  unit: string;
  pct: number;
  color: string;
}

interface MealEntry {
  emoji: string;
  name: string;
  mealType: string;
  kcal: number;
}

const MACROS: MacroData[] = [
  { label: "Protein", current: 112, target: 160, unit: "g", pct: 70, color: "#F97316" },
  { label: "Carbs",   current: 182, target: 250, unit: "g", pct: 73, color: "#55CDFC" },
  { label: "Fats",    current: 58,  target: 70,  unit: "g", pct: 83, color: "#F59E0B" },
];

const MEALS: MealEntry[] = [
  { emoji: "🥘", name: "Masala Dosa + Chutney",       mealType: "Breakfast", kcal: 380 },
  { emoji: "🍛", name: "Paneer Butter Masala + Roti", mealType: "Lunch",     kcal: 470 },
];

// ─── Header Avatar (light-theme) ─────────────────────────────────────────────
function HeaderAvatar() {
  return (
    <View style={styles.avatarWrap}>
      <User size={20} color={SKY_BLUE} strokeWidth={2} />
    </View>
  );
}

// ─── Macro Card (white surface) ──────────────────────────────────────────────
function MacroCard({ label, current, target, unit, pct, color }: MacroData) {
  return (
    <View style={styles.macroCard}>
      <View style={[styles.macroIcon, { backgroundColor: `${color}18` }]}>
        <Text style={[styles.macroIconLetter, { color }]}>{label[0]}</Text>
      </View>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroNumber}>
        {current}
        <Text style={styles.macroUnit}> {unit}</Text>
      </Text>
      <Text style={styles.macroTarget}>/ {target} {unit}</Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.macroPct, { color }]}>{pct}%</Text>
    </View>
  );
}

// ─── Meal Row ────────────────────────────────────────────────────────────────
function MealRow({ emoji, name, mealType, kcal }: MealEntry) {
  return (
    <View style={styles.mealRow}>
      <View style={styles.mealEmojiBox}>
        <Text style={styles.mealEmoji}>{emoji}</Text>
      </View>
      <View style={styles.mealInfo}>
        <Text style={styles.mealName} numberOfLines={1}>{name}</Text>
        <Text style={styles.mealType}>{mealType}</Text>
      </View>
      <View style={styles.mealKcalCol}>
        <Text style={styles.mealKcal}>{kcal}</Text>
        <Text style={styles.mealKcalUnit}>kcal</Text>
      </View>
    </View>
  );
}

// ─── Tab item ────────────────────────────────────────────────────────────────
function TabItem({
  icon,
  label,
  active = false,
}: {
  icon: (color: string) => React.ReactNode;
  label: string;
  active?: boolean;
}) {
  const color = active ? SKY_BLUE : SLATE_GRAY;
  return (
    <TouchableOpacity style={styles.tabItem} activeOpacity={0.7}>
      {icon(color)}
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Premium Tab Bar ─────────────────────────────────────────────────────────
function PremiumTabBar({ onScan }: { onScan: () => void }) {
  const insets   = useSafeAreaInsets();
  const btnScale = useRef(new Animated.Value(1)).current;

  const onPressIn  = () =>
    Animated.spring(btnScale, { toValue: 0.90, useNativeDriver: true, speed: 60, bounciness: 6 }).start();
  const onPressOut = () =>
    Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 14 }).start();

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TabItem
        icon={(c) => <Home size={22} color={c} strokeWidth={2} />}
        label="Home"
        active
      />
      <TabItem
        icon={(c) => <BookOpen size={22} color={c} strokeWidth={2} />}
        label="Diary"
      />

      {/* Central floating scan button */}
      <View style={styles.tabCenterSlot}>
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <TouchableOpacity
            style={styles.scanBtn}
            activeOpacity={1}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            onPress={onScan}
          >
            <Camera size={26} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      <TabItem
        icon={(c) => <BarChart2 size={22} color={c} strokeWidth={2} />}
        label="Progress"
      />
      <TabItem
        icon={(c) => <MoreHorizontal size={22} color={c} strokeWidth={2} />}
        label="More"
      />
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 20 }]}
        style={styles.scrollFlex}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <HeaderAvatar />
            <View>
              <Text style={styles.greeting}>Namaste, Ravi! 🙏</Text>
              <Text style={styles.headerSub}>Swasth Profile</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.historyBadge} activeOpacity={0.75}>
            <History size={13} color={SKY_BLUE} strokeWidth={2} />
            <Text style={styles.historyText}>Scan History</Text>
          </TouchableOpacity>
        </View>

        {/* ── Premium Profile Card ─────────────────────────────────────── */}
        <View style={styles.cardRow}>
          <PremiumProfileCard
            name="Ravi Kumar"
            avatarInitials="RK"
            streak={21}
            targetCalories={TARGET_KCAL}
            consumedCalories={CONSUMED_KCAL}
            tier="Swasth Pro"
            weightKg={72}
            protein={MACROS[0].current}
            carbs={MACROS[1].current}
            fats={MACROS[2].current}
          />
        </View>

        {/* ── Hero Gradient Calorie Card ───────────────────────────────── */}
        <View style={styles.heroCard}>
          {/* Sky→Azure gradient fill */}
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFillObject}
          >
            <Defs>
              <LinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%"   stopColor="#55CDFC" stopOpacity="1" />
                <Stop offset="100%" stopColor="#38BDF8" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={100} height={100} fill="url(#heroGrad)" />
          </Svg>

          {/* Top row: metrics left, ring right */}
          <View style={styles.heroBody}>
            <View style={styles.heroLeft}>
              <View style={styles.heroLabelRow}>
                <Flame size={14} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                <Text style={styles.heroLabelText}>Calories Left</Text>
              </View>
              <Text style={styles.heroNumber}>{REMAINING_KCAL.toLocaleString()}</Text>
              <Text style={styles.heroKcalUnit}>kcal left</Text>
            </View>

            <View style={styles.heroRingWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                {/* Track */}
                <Circle
                  cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                />
                {/* Progress arc — starts at 12 o'clock */}
                <G transform={`rotate(-90, ${RING_CENTER}, ${RING_CENTER})`}>
                  <Circle
                    cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS}
                    stroke="#FFFFFF"
                    strokeWidth={STROKE_WIDTH}
                    fill="none"
                    strokeDasharray={String(CIRCUMFERENCE)}
                    strokeDashoffset={RING_OFFSET}
                    strokeLinecap="round"
                  />
                </G>
              </Svg>
              <View style={styles.heroRingOverlay}>
                <Text style={styles.heroRingPct}>{PCT_DISPLAY}%</Text>
                <Text style={styles.heroRingGoal}>of daily goal</Text>
              </View>
            </View>
          </View>

          {/* Progress pill — bleeds to card edges */}
          <TouchableOpacity style={styles.heroPill} activeOpacity={0.85}>
            <Text style={styles.heroPillText}>
              {CONSUMED_KCAL.toLocaleString()} / {TARGET_KCAL.toLocaleString()} kcal consumed
            </Text>
            <ChevronRight size={14} color="rgba(255,255,255,0.75)" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* ── Macros ──────────────────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Macros</Text>
          <TouchableOpacity>
            <Text style={styles.sectionLink}>View Details ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.macroRow}>
          {MACROS.map((m) => (
            <MacroCard key={m.label} {...m} />
          ))}
        </View>

        {/* ── Meal Log ────────────────────────────────────────────────── */}
        <View style={styles.mealCard}>
          <View style={styles.mealCardHeader}>
            <Text style={styles.mealCardTitle}>Today's Swasth Scans</Text>
            <View style={styles.mealCountBadge}>
              <Text style={styles.mealCountText}>{MEALS.length}</Text>
            </View>
          </View>
          {MEALS.map((meal, i) => (
            <React.Fragment key={meal.name}>
              <MealRow {...meal} />
              {i < MEALS.length - 1 && <View style={styles.mealDivider} />}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>

      <PremiumTabBar onScan={() => router.push("/camera")} />
    </View>
  );
}

// ─── Shared card shadow ───────────────────────────────────────────────────────
const CARD_SHADOW = {
  shadowColor: SLATE_GRAY,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.10,
  shadowRadius: 12,
  elevation: 4,
} as const;

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:       { flex: 1, backgroundColor: OFF_WHITE },
  scrollFlex: { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  cardRow: { alignItems: "center" },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${SKY_BLUE}18`,
    borderWidth: 1.5,
    borderColor: `${SKY_BLUE}50`,
  },
  greeting: {
    fontSize: 17,
    fontWeight: "700",
    color: CHARCOAL,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: SLATE_GRAY,
    fontWeight: "500",
    marginTop: 1,
  },
  historyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: `${SKY_BLUE}14`,
    borderWidth: 1,
    borderColor: `${SKY_BLUE}40`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  historyText: {
    fontSize: 12,
    fontWeight: "600",
    color: SKY_BLUE,
  },

  // ── Hero Gradient Card ─────────────────────────────────────────────────────
  heroCard: {
    borderRadius: 24,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: "#38BDF8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  heroBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
  },
  heroLeft: {
    flex: 1,
    gap: 2,
  },
  heroLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  heroLabelText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  heroNumber: {
    fontSize: 52,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -2.5,
    lineHeight: 56,
  },
  heroKcalUnit: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  heroRingWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  heroRingOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  heroRingPct: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  heroRingGoal: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.80)",
    textAlign: "center",
    marginTop: 1,
  },
  // Negative horizontal margins bleed through padding to reach card edges;
  // overflow:hidden on heroCard clips corners cleanly.
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.22)",
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  heroPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.90)",
  },

  // ── Section header ─────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: -4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: CHARCOAL,
    letterSpacing: -0.3,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: "600",
    color: SKY_BLUE,
  },

  // ── Macro Row — white surface cards ───────────────────────────────────────
  macroRow: {
    flexDirection: "row",
    gap: 10,
  },
  macroCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 14,
    gap: 4,
    ...CARD_SHADOW,
  },
  macroIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  macroIconLetter: {
    fontSize: 13,
    fontWeight: "800",
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: SLATE_GRAY,
  },
  macroNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: CHARCOAL,
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  macroUnit: {
    fontSize: 12,
    fontWeight: "500",
    color: SLATE_GRAY,
  },
  macroTarget: {
    fontSize: 11,
    fontWeight: "500",
    color: SLATE_GRAY,
  },
  macroTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
    marginTop: 2,
  },
  macroFill: {
    height: "100%",
    borderRadius: 2,
  },
  macroPct: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },

  // ── Meal Card — white surface ──────────────────────────────────────────────
  mealCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 4,
    ...CARD_SHADOW,
  },
  mealCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  mealCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: CHARCOAL,
    letterSpacing: -0.2,
  },
  mealCountBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: `${SKY_BLUE}20`,
    alignItems: "center",
    justifyContent: "center",
  },
  mealCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: SKY_BLUE,
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  mealEmojiBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: OFF_WHITE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mealEmoji:    { fontSize: 22 },
  mealInfo:     { flex: 1, gap: 3 },
  mealName: {
    fontSize: 14,
    fontWeight: "600",
    color: CHARCOAL,
  },
  mealType: {
    fontSize: 12,
    color: SLATE_GRAY,
  },
  mealKcalCol: {
    alignItems: "flex-end",
    gap: 1,
  },
  mealKcal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#059669",
    letterSpacing: -0.5,
  },
  mealKcalUnit: {
    fontSize: 10,
    fontWeight: "500",
    color: SLATE_GRAY,
  },
  mealDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginLeft: 58,
  },

  // ── Premium Tab Bar ────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 0.5,
    borderTopColor: "#E2E8F0",
    paddingTop: 10,
    paddingHorizontal: 4,
    // Lift bar above scroll content on iOS
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingBottom: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  tabCenterSlot: {
    flex: 1,
    alignItems: "center",
  },
  // Floats SCAN_BTN_SIZE px circle upward so half sits above the bar edge
  scanBtn: {
    width: SCAN_BTN_SIZE,
    height: SCAN_BTN_SIZE,
    borderRadius: SCAN_BTN_SIZE / 2,
    backgroundColor: SKY_BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -(SCAN_BTN_SIZE / 2),
    shadowColor: SKY_BLUE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.50,
    shadowRadius: 14,
    elevation: 12,
  },
});
