import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  ChevronLeft,
  ChevronRight,
  Coffee,
  Moon,
  Plus,
  Sun,
  Sunset,
  UtensilsCrossed,
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

// ─── Data ────────────────────────────────────────────────────────────────────
interface MealEntry {
  id:       string;
  emoji:    string;
  name:     string;
  mealType: string;
  kcal:     number;
  protein?: number;
  carbs?:   number;
  fat?:     number;
}

const TARGET_KCAL = 2500;

const DIARY_DATA: Record<string, MealEntry[]> = {
  "2026-07-03": [
    { id: "d1", emoji: "🥘", name: "Masala Dosa",             mealType: "Breakfast", kcal: 380, protein: 8,  carbs: 56, fat: 12 },
    { id: "d2", emoji: "☕", name: "Filter Coffee",            mealType: "Breakfast", kcal: 60,  protein: 2,  carbs: 8,  fat: 2  },
    { id: "d3", emoji: "🍛", name: "Paneer Butter Masala",     mealType: "Lunch",     kcal: 470, protein: 22, carbs: 38, fat: 26 },
    { id: "d4", emoji: "🍚", name: "Steamed Rice (1 cup)",     mealType: "Lunch",     kcal: 210, protein: 4,  carbs: 46, fat: 0  },
    { id: "d5", emoji: "🍎", name: "Apple",                    mealType: "Snacks",    kcal: 95,  protein: 0,  carbs: 25, fat: 0  },
    { id: "d6", emoji: "🥜", name: "Mixed Nuts (30g)",         mealType: "Snacks",    kcal: 180, protein: 6,  carbs: 6,  fat: 16 },
  ],
  "2026-07-02": [
    { id: "e1", emoji: "🥞", name: "Oats Porridge",            mealType: "Breakfast", kcal: 290, protein: 10, carbs: 48, fat: 6  },
    { id: "e2", emoji: "🥗", name: "Sprout Salad",             mealType: "Lunch",     kcal: 220, protein: 14, carbs: 28, fat: 4  },
    { id: "e3", emoji: "🍗", name: "Grilled Chicken + Veggies", mealType: "Dinner",   kcal: 420, protein: 42, carbs: 18, fat: 14 },
  ],
};

const MEAL_SECTIONS = [
  { key: "Breakfast", label: "Breakfast", color: "#F97316", bg: "#FEF3C7", icon: Coffee  },
  { key: "Lunch",     label: "Lunch",     color: "#0EA5E9", bg: "#DBEAFE", icon: Sun     },
  { key: "Snacks",    label: "Snacks",    color: "#A78BFA", bg: "#EDE9FE", icon: Sunset  },
  { key: "Dinner",    label: "Dinner",    color: "#22C55E", bg: "#DCFCE7", icon: Moon    },
];

// ─── Calorie ring ─────────────────────────────────────────────────────────────
const RING = 96;
const R    = 40;
const CIRC = 2 * Math.PI * R;

function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const pct  = Math.min(consumed / target, 1);
  const dash = pct * CIRC;

  return (
    <View style={rs.wrap}>
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
        <Defs>
          <LinearGradient id="ringG" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%"   stopColor="#55CDFC" />
            <Stop offset="50%"  stopColor="#818CF8" />
            <Stop offset="100%" stopColor="#F97316" />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={RING / 2} cy={RING / 2} r={R}
          stroke="#EEF2FF" strokeWidth={8} fill="none"
        />
        {/* Progress */}
        <Circle
          cx={RING / 2} cy={RING / 2} r={R}
          stroke="url(#ringG)" strokeWidth={8} fill="none"
          strokeDasharray={`${dash} ${CIRC}`}
          strokeLinecap="round"
          rotation={-90} origin={`${RING / 2},${RING / 2}`}
        />
      </Svg>
      <View style={rs.center}>
        <Text style={rs.kcalNum}>{consumed}</Text>
        <Text style={rs.kcalLbl}>kcal</Text>
      </View>
    </View>
  );
}

const rs = StyleSheet.create({
  wrap:    { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  center:  { position: "absolute", alignItems: "center" },
  kcalNum: { fontSize: 20, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.5 },
  kcalLbl: { fontSize: 9,  fontWeight: "600", color: MUTED,    marginTop: -1 },
});

// ─── Macro pill ───────────────────────────────────────────────────────────────
function MacroPill({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <View style={mp.pill}>
      <Text style={[mp.val, { color }]}>{val}g</Text>
      <Text style={mp.lbl}>{label}</Text>
    </View>
  );
}
const mp = StyleSheet.create({
  pill: { alignItems: "center", gap: 1 },
  val:  { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  lbl:  { fontSize: 9,  fontWeight: "600", color: MUTED, letterSpacing: 0.1 },
});

// ─── Meal section ─────────────────────────────────────────────────────────────
function MealSection({
  section,
  meals,
  onScan,
}: {
  section: typeof MEAL_SECTIONS[0];
  meals:   MealEntry[];
  onScan:  () => void;
}) {
  const total = meals.reduce((s, m) => s + m.kcal, 0);
  const Icon  = section.icon;

  return (
    <View style={[ms.card, CARD_SHADOW]}>
      {/* Section header */}
      <View style={ms.header}>
        <View style={[ms.iconBg, { backgroundColor: section.bg }]}>
          <Icon size={14} color={section.color} strokeWidth={2.5} />
        </View>
        <Text style={ms.title}>{section.label}</Text>
        {total > 0 && (
          <Text style={[ms.totalKcal, { color: section.color }]}>{total} kcal</Text>
        )}
        <TouchableOpacity style={[ms.addBtn, { backgroundColor: section.bg }]} onPress={onScan}>
          <Plus size={12} color={section.color} strokeWidth={3} />
        </TouchableOpacity>
      </View>

      {/* Meal rows */}
      {meals.length === 0 ? (
        <View style={ms.emptyRow}>
          <UtensilsCrossed size={16} color={MUTED} strokeWidth={1.5} />
          <Text style={ms.emptyText}>Nothing logged yet</Text>
        </View>
      ) : (
        meals.map((meal, idx) => (
          <View key={meal.id} style={[ms.row, idx > 0 && ms.rowBorder]}>
            <Text style={ms.emoji}>{meal.emoji}</Text>
            <View style={ms.rowText}>
              <Text style={ms.name} numberOfLines={1}>{meal.name}</Text>
              {(meal.protein !== undefined) && (
                <Text style={ms.macroLine}>
                  P {meal.protein}g · C {meal.carbs}g · F {meal.fat}g
                </Text>
              )}
            </View>
            <Text style={ms.kcal}>{meal.kcal}</Text>
            <Text style={ms.unit}>kcal</Text>
          </View>
        ))
      )}
    </View>
  );
}

const ms = StyleSheet.create({
  card:      { backgroundColor: WHITE, borderRadius: 20, marginHorizontal: 20, marginBottom: 12, padding: 16 },
  header:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  iconBg:    { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title:     { fontSize: 14, fontWeight: "700", color: CHARCOAL, flex: 1 },
  totalKcal: { fontSize: 12, fontWeight: "700" },
  addBtn:    { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyRow:  { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  emptyText: { fontSize: 12, color: MUTED, fontStyle: "italic" },
  row:       { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  emoji:     { fontSize: 22, width: 32, textAlign: "center" },
  rowText:   { flex: 1, gap: 2 },
  name:      { fontSize: 13, fontWeight: "600", color: CHARCOAL },
  macroLine: { fontSize: 10, color: MUTED, fontWeight: "500" },
  kcal:      { fontSize: 14, fontWeight: "700", color: CHARCOAL },
  unit:      { fontSize: 10, color: MUTED, fontWeight: "500", marginTop: 2 },
});

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtHeader(d: Date) {
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DiaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(new Date(2026, 6, 3)); // July 3 2026

  const key   = toKey(date);
  const meals = DIARY_DATA[key] ?? [];

  const { consumed, protein, carbs, fat } = useMemo(() => {
    return meals.reduce(
      (acc, m) => ({
        consumed: acc.consumed + m.kcal,
        protein:  acc.protein  + (m.protein ?? 0),
        carbs:    acc.carbs    + (m.carbs   ?? 0),
        fat:      acc.fat      + (m.fat     ?? 0),
      }),
      { consumed: 0, protein: 0, carbs: 0, fat: 0 },
    );
  }, [meals]);

  const remaining = Math.max(TARGET_KCAL - consumed, 0);

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d);
  };
  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d);
  };

  const mealsBySection = (key: string) => meals.filter(m => m.mealType === key);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevDay} style={styles.navBtn}>
          <ChevronLeft size={20} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerDate}>{fmtHeader(date)}</Text>
          <Text style={styles.headerSub}>Food Diary</Text>
        </View>
        <TouchableOpacity onPress={nextDay} style={styles.navBtn}>
          <ChevronRight size={20} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* ── Calorie summary card ── */}
      <View style={[styles.summaryCard, CARD_SHADOW]}>
        <CalorieRing consumed={consumed} target={TARGET_KCAL} />
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRight}>
          <View style={styles.budgetRow}>
            <View style={styles.budgetItem}>
              <Text style={styles.budgetNum}>{TARGET_KCAL}</Text>
              <Text style={styles.budgetLbl}>Budget</Text>
            </View>
            <Text style={styles.budgetMinus}>−</Text>
            <View style={styles.budgetItem}>
              <Text style={styles.budgetNum}>{consumed}</Text>
              <Text style={styles.budgetLbl}>Eaten</Text>
            </View>
            <Text style={styles.budgetMinus}>=</Text>
            <View style={styles.budgetItem}>
              <Text style={[styles.budgetNum, { color: remaining > 0 ? "#22C55E" : "#EF4444" }]}>
                {remaining}
              </Text>
              <Text style={styles.budgetLbl}>Left</Text>
            </View>
          </View>
          <View style={styles.macroPillRow}>
            <MacroPill label="Protein" val={protein} color="#F97316" />
            <View style={styles.macroDivider} />
            <MacroPill label="Carbs"   val={carbs}   color="#0EA5E9" />
            <View style={styles.macroDivider} />
            <MacroPill label="Fat"     val={fat}      color="#F59E0B" />
          </View>
        </View>
      </View>

      {/* ── Meal sections ── */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >
        {MEAL_SECTIONS.map(sec => (
          <MealSection
            key={sec.key}
            section={sec}
            meals={mealsBySection(sec.key)}
            onScan={() => router.push("/camera")}
          />
        ))}

        {/* Daily note */}
        <View style={[styles.noteCard, CARD_SHADOW]}>
          <Text style={styles.noteLabel}>AI INSIGHT</Text>
          <Text style={styles.noteText}>
            {consumed === 0
              ? "No meals logged yet. Start by scanning your first meal of the day."
              : consumed > 2200
              ? `High intake day — ${consumed} kcal. Consider a lighter dinner to stay within budget.`
              : `Good day! ${consumed} kcal logged with ${remaining} kcal remaining. You're on track.`}
          </Text>
        </View>
      </ScrollView>

      <FloatingNav
        active="diary"
        onHome={()     => router.push("/")}
        onProgress={() => router.push("/progress")}
        onDiary={()    => {}}
        onCamera={()   => router.push("/camera")}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: BG,
  },
  header: {
    flexDirection:   "row",
    alignItems:      "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navBtn: {
    width:          36,
    height:         36,
    borderRadius:   18,
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: WHITE,
    ...CARD_SHADOW,
  },
  headerCenter: {
    flex:      1,
    alignItems: "center",
    gap:        2,
  },
  headerDate: {
    fontSize:    16,
    fontWeight:  "700",
    color:       CHARCOAL,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize:  11,
    fontWeight: "600",
    color:      MUTED,
    letterSpacing: 0.08,
  },
  summaryCard: {
    flexDirection:   "row",
    alignItems:      "center",
    backgroundColor: WHITE,
    borderRadius:    24,
    marginHorizontal: 20,
    marginBottom:    16,
    padding:         20,
    gap:             16,
  },
  summaryDivider: {
    width:           1,
    height:          72,
    backgroundColor: "#EEF2FF",
  },
  summaryRight: {
    flex: 1,
    gap:  12,
  },
  budgetRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  budgetItem: {
    alignItems: "center",
    flex:       1,
  },
  budgetNum: {
    fontSize:    15,
    fontWeight:  "800",
    color:       CHARCOAL,
    letterSpacing: -0.3,
  },
  budgetLbl: {
    fontSize:  9,
    fontWeight: "600",
    color:      MUTED,
    letterSpacing: 0.1,
  },
  budgetMinus: {
    fontSize:  14,
    color:     MUTED,
    fontWeight: "300",
  },
  macroPillRow: {
    flexDirection:  "row",
    alignItems:     "center",
    backgroundColor: "#F8FAFF",
    borderRadius:   12,
    padding:        10,
  },
  macroDivider: {
    width:           1,
    height:          28,
    backgroundColor: "#E2E8F0",
    flex:            0,
    marginHorizontal: 8,
  },
  noteCard: {
    backgroundColor: WHITE,
    borderRadius:    20,
    marginHorizontal: 20,
    marginTop:       4,
    padding:         16,
    gap:             6,
  },
  noteLabel: {
    fontSize:      9,
    fontWeight:    "700",
    color:         SKY,
    letterSpacing: 0.12,
  },
  noteText: {
    fontSize:   13,
    fontWeight: "500",
    color:      CHARCOAL,
    lineHeight: 19,
  },
});
