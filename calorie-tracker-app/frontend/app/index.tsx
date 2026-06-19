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
import Svg, { Circle, G } from "react-native-svg";
import { History, User } from "lucide-react-native";
import { Colors, alpha } from "@/constants/colors";

// ─── Design tokens ───────────────────────────────────────────────────────────
const EMERALD_LEAF = "#059669";
const FAB_HEIGHT = 58;

// ─── Calorie budget constants ────────────────────────────────────────────────
const TARGET_KCAL = 2300;
const CONSUMED_KCAL = 850;
const REMAINING_KCAL = TARGET_KCAL - CONSUMED_KCAL; // 1,450

// ─── SVG ring geometry ───────────────────────────────────────────────────────
const RING_SIZE = 190;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 76;
const STROKE_WIDTH = 14;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const REMAINING_FRAC = REMAINING_KCAL / TARGET_KCAL;
const RING_DASH_OFFSET = CIRCUMFERENCE * (1 - REMAINING_FRAC);

// ─── Static data types ───────────────────────────────────────────────────────
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
  { label: "Protein", current: 30,   target: 85,  unit: "g", pct: 35, color: Colors.protein },
  { label: "Carbs",   current: 150,  target: 250, unit: "g", pct: 60, color: Colors.carbs },
  { label: "Fats",    current: 10.5, target: 70,  unit: "g", pct: 15, color: Colors.fat },
];

const MEALS: MealEntry[] = [
  { emoji: "🥘", name: "Masala Dosa + Chutney",        mealType: "Breakfast", kcal: 380 },
  { emoji: "🍛", name: "Paneer Butter Masala + Roti",  mealType: "Lunch",     kcal: 470 },
];

function formatDate(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

// ─── Macro Card ──────────────────────────────────────────────────────────────
function MacroCard({ label, current, target, unit, pct, color }: MacroData) {
  return (
    <View style={[styles.macroCard, { borderColor: alpha(color, 50) }]}>
      <View style={[styles.macroColorDot, { backgroundColor: color }]} />
      <Text style={[styles.macroLabel, { color }]}>{label}</Text>
      <View style={styles.macroBarTrack}>
        <View
          style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
      <Text style={styles.macroDetail}>
        {current}
        {unit} / {target}
        {unit}
      </Text>
    </View>
  );
}

// ─── Meal Row ────────────────────────────────────────────────────────────────
function MealRow({ emoji, name, mealType, kcal }: MealEntry) {
  return (
    <View style={styles.mealRow}>
      <View style={styles.mealEmojiBox}>
        <Text style={styles.mealEmojiText}>{emoji}</Text>
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

// ─── Screen ──────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fabScale = useRef(new Animated.Value(1)).current;

  const onFabPressIn = () =>
    Animated.spring(fabScale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 60,
      bounciness: 8,
    }).start();

  const onFabPressOut = () =>
    Animated.spring(fabScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 14,
    }).start();

  const fabBottom = insets.bottom + 20;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: FAB_HEIGHT + fabBottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <User size={22} color={Colors.emerald} strokeWidth={2} />
            </View>
            <View>
              <Text style={styles.greeting}>Namaste, Ravi! 🙏</Text>
              <Text style={styles.greetingDate}>{formatDate()}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.historyBadge} activeOpacity={0.75}>
            <History size={13} color={Colors.teal} strokeWidth={2} />
            <Text style={styles.historyText}>Scan History</Text>
          </TouchableOpacity>
        </View>

        {/* ── Calorie Ring Card ─────────────────────────────────────── */}
        <View style={styles.ringCard}>
          <Text style={styles.ringCardLabel}>TODAY'S CALORIE BUDGET</Text>

          <View style={styles.ringWrapper}>
            <Svg
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            >
              {/* Background track */}
              <Circle
                cx={RING_CENTER}
                cy={RING_CENTER}
                r={RING_RADIUS}
                stroke={Colors.slate100}
                strokeWidth={STROKE_WIDTH}
                fill="none"
              />
              {/* Remaining arc — rotated so arc begins at 12 o'clock */}
              <G transform={`rotate(-90, ${RING_CENTER}, ${RING_CENTER})`}>
                <Circle
                  cx={RING_CENTER}
                  cy={RING_CENTER}
                  r={RING_RADIUS}
                  stroke={EMERALD_LEAF}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                  strokeDasharray={String(CIRCUMFERENCE)}
                  strokeDashoffset={RING_DASH_OFFSET}
                  strokeLinecap="round"
                />
              </G>
            </Svg>

            {/* Centered numeric overlay */}
            <View style={styles.ringOverlay}>
              <Text style={styles.ringNumber}>1,450</Text>
              <Text style={styles.ringSubLabel}>kcal remaining</Text>
            </View>
          </View>

          <Text style={styles.ringProgress}>
            {CONSUMED_KCAL.toLocaleString()} / {TARGET_KCAL.toLocaleString()} kcal consumed
          </Text>
        </View>

        {/* ── Macro Row ─────────────────────────────────────────────── */}
        <View style={styles.macroRow}>
          {MACROS.map((m) => (
            <MacroCard key={m.label} {...m} />
          ))}
        </View>

        {/* ── Meal Log ──────────────────────────────────────────────── */}
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

      {/* ── Floating Action Button ────────────────────────────────── */}
      <Animated.View
        style={[
          styles.fabWrap,
          { bottom: fabBottom, transform: [{ scale: fabScale }] },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={1}
          onPressIn={onFabPressIn}
          onPressOut={onFabPressOut}
          onPress={() => router.push("/camera")}
        >
          <Text style={styles.fabText}>📷  SCAN NEW THALI</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.backdrop,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 20,
  },

  // Header
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
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: alpha(Colors.emerald, 22),
    borderWidth: 1.5,
    borderColor: alpha(Colors.emerald, 60),
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.slate900,
    letterSpacing: -0.3,
  },
  greetingDate: {
    fontSize: 12,
    color: Colors.slate400,
    marginTop: 2,
  },
  historyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: alpha(Colors.teal, 18),
    borderWidth: 1,
    borderColor: alpha(Colors.teal, 55),
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  historyText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.teal,
  },

  // Calorie Ring Card
  ringCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.zinc,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 12,
    shadowColor: Colors.slate900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  ringCardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.slate400,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringOverlay: {
    position: "absolute",
    alignItems: "center",
  },
  ringNumber: {
    fontSize: 38,
    fontWeight: "800",
    color: EMERALD_LEAF,
    letterSpacing: -1.5,
  },
  ringSubLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.slate600,
    marginTop: 2,
  },
  ringProgress: {
    fontSize: 13,
    color: Colors.slate400,
    fontWeight: "500",
  },

  // Macro Row
  macroRow: {
    flexDirection: "row",
    gap: 10,
  },
  macroCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    shadowColor: Colors.slate900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  macroColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  macroBarTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.slate100,
    overflow: "hidden",
  },
  macroBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  macroDetail: {
    fontSize: 10,
    color: Colors.slate400,
    fontWeight: "500",
  },

  // Meal Card
  mealCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.zinc,
    paddingVertical: 18,
    paddingHorizontal: 16,
    shadowColor: Colors.slate900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 4,
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
    color: Colors.slate900,
    letterSpacing: -0.2,
  },
  mealCountBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: alpha(Colors.emerald, 22),
    alignItems: "center",
    justifyContent: "center",
  },
  mealCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.emerald,
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
    borderRadius: 12,
    backgroundColor: Colors.slate100,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  mealEmojiText: {
    fontSize: 22,
  },
  mealInfo: {
    flex: 1,
    gap: 3,
  },
  mealName: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.slate900,
  },
  mealType: {
    fontSize: 12,
    color: Colors.slate400,
  },
  mealKcalCol: {
    alignItems: "flex-end",
    gap: 1,
  },
  mealKcal: {
    fontSize: 18,
    fontWeight: "700",
    color: EMERALD_LEAF,
    letterSpacing: -0.5,
  },
  mealKcalUnit: {
    fontSize: 10,
    color: Colors.slate400,
    fontWeight: "500",
  },
  mealDivider: {
    height: 1,
    backgroundColor: Colors.slate100,
    marginLeft: 58,
  },

  // FAB
  fabWrap: {
    position: "absolute",
    alignSelf: "center",
  },
  fab: {
    height: FAB_HEIGHT,
    paddingHorizontal: 36,
    borderRadius: FAB_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.emerald,
    shadowColor: Colors.emerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.48,
    shadowRadius: 18,
    elevation: 14,
  },
  fabText: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.white,
    letterSpacing: 0.8,
  },
});
