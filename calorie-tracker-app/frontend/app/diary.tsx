import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Moon,
  Plus,
  Sun,
  Sunset,
} from "@/components/icons";
import { FloatingNav } from "@/components/FloatingNav";
import { apiFetch, readErrorDetail } from "@/constants/api";
import type {
  CreatePlannedMealRequest,
  LoggedMeal,
  MealsListResponse,
  MealType,
  PlannedMeal,
  PlannedMealsListResponse,
  UserProfile,
} from "@/types/api";
import { slotDateTimeISO, toDateParam } from "@/types/api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG       = "#F8FAFC";
const SKY      = "#55CDFC";
const CHARCOAL = "#1A1D20";
const MUTED    = "#94A3B8";
const WHITE    = "#FFFFFF";
const CARD_SHADOW = {
  shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07, shadowRadius: 16, elevation: 6,
} as const;

const MEAL_SECTIONS = [
  { key: "Breakfast", label: "Breakfast", color: "#F97316", bg: "#FEF3C7", icon: Coffee  },
  { key: "Lunch",     label: "Lunch",     color: "#0EA5E9", bg: "#DBEAFE", icon: Sun     },
  { key: "Snacks",    label: "Snacks",    color: "#A78BFA", bg: "#EDE9FE", icon: Sunset  },
  { key: "Dinner",    label: "Dinner",    color: "#22C55E", bg: "#DCFCE7", icon: Moon    },
] as const;

const SLOT_BY_KEY: Record<string, typeof MEAL_SECTIONS[number]> = Object.fromEntries(
  MEAL_SECTIONS.map((s) => [s.key, s]),
);

// Curated quick-plan dishes. Names are matched fuzzily to the ICMR-NIN table
// server-side; unmatched ones fall back to the estimate formula, so calories
// always resolve. Grams are typical single servings.
const STAPLES: { name: string; grams: number; emoji: string }[] = [
  { name: "Masala Dosa",              grams: 200, emoji: "🥞" },
  { name: "Idli Sambar",              grams: 250, emoji: "🍚" },
  { name: "Poha",                     grams: 180, emoji: "🍛" },
  { name: "Upma",                     grams: 180, emoji: "🥣" },
  { name: "Aloo Paratha",             grams: 150, emoji: "🫓" },
  { name: "Roti with Dal",            grams: 250, emoji: "🍲" },
  { name: "Rice with Rajma",          grams: 300, emoji: "🍚" },
  { name: "Paneer Butter Masala",     grams: 200, emoji: "🧀" },
  { name: "Chicken Curry with Rice",  grams: 350, emoji: "🍗" },
  { name: "Curd Rice",                grams: 250, emoji: "🥛" },
  { name: "Vegetable Sabzi",          grams: 150, emoji: "🥦" },
  { name: "Boiled Eggs (2)",          grams: 100, emoji: "🥚" },
];

// ─── Calorie ring (animated) ──────────────────────────────────────────────────
const RING = 96;
const R    = 40;
const CIRC = 2 * Math.PI * R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function CalorieRing({ consumed, target, over }: { consumed: number; target: number; over: boolean }) {
  const frac = Math.min(consumed / Math.max(target, 1), 1);
  const anim = useRef(new Animated.Value(0)).current;
  // Fill the ring on mount and re-fill whenever the day's total changes.
  useEffect(() => {
    Animated.timing(anim, { toValue: frac, duration: 800, useNativeDriver: false }).start();
  }, [frac, anim]);
  const dashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] });
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
        <Circle cx={RING/2} cy={RING/2} r={R} stroke="#EEF2FF" strokeWidth={8} fill="none" />
        <AnimatedCircle
          cx={RING/2} cy={RING/2} r={R}
          stroke={over ? "#EF4444" : "url(#ringG)"}
          strokeWidth={8} fill="none"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          rotation={-90} origin={`${RING/2},${RING/2}`}
        />
      </Svg>
      <View style={rs.center}>
        <Text style={[rs.kcalNum, over && { color: "#EF4444" }]}>{consumed}</Text>
        <Text style={rs.kcalLbl}>kcal</Text>
      </View>
    </View>
  );
}

// ─── Entrance animation wrapper ───────────────────────────────────────────────
// Fade + slight rise. Remount it (via a key tied to the selected date) to replay.
function FadeSlideIn({ index = 0, children }: { index?: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 300, delay: index * 60, useNativeDriver: true }).start();
  }, [anim, index]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
const rs = StyleSheet.create({
  wrap:    { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  center:  { position: "absolute", alignItems: "center" },
  kcalNum: { fontSize: 20, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.5 },
  kcalLbl: { fontSize: 9, fontWeight: "600", color: MUTED, marginTop: -1 },
});

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
  lbl:  { fontSize: 9, fontWeight: "600", color: MUTED },
});

// ─── Meal section (logged) ────────────────────────────────────────────────────
function MealSection({
  section, meals, onScan,
}: {
  section: typeof MEAL_SECTIONS[number];
  meals: LoggedMeal[];
  onScan: () => void;
}) {
  const total = meals.reduce((s, m) => s + m.total_calories, 0);
  const Icon  = section.icon;

  // Empty slot → slim, tappable one-line row so an empty day stays compact
  // instead of four tall "Nothing logged yet" cards.
  if (meals.length === 0) {
    return (
      <TouchableOpacity style={[ms.slimRow, CARD_SHADOW]} onPress={onScan} activeOpacity={0.7}>
        <View style={[ms.iconBg, { backgroundColor: section.bg }]}>
          <Icon size={14} color={section.color} strokeWidth={2.5} />
        </View>
        <Text style={ms.slimTitle}>{section.label}</Text>
        <Text style={ms.slimHint}>Add</Text>
        <View style={[ms.addBtn, { backgroundColor: section.bg }]}>
          <Plus size={12} color={section.color} strokeWidth={3} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[ms.card, CARD_SHADOW]}>
      <View style={ms.header}>
        <View style={[ms.iconBg, { backgroundColor: section.bg }]}>
          <Icon size={14} color={section.color} strokeWidth={2.5} />
        </View>
        <Text style={ms.title}>{section.label}</Text>
        <Text style={[ms.totalKcal, { color: section.color }]}>{Math.round(total)} kcal</Text>
        <TouchableOpacity style={[ms.addBtn, { backgroundColor: section.bg }]} onPress={onScan}>
          <Plus size={12} color={section.color} strokeWidth={3} />
        </TouchableOpacity>
      </View>
      {meals.map((meal, idx) => (
        <View key={meal.id} style={[ms.row, idx > 0 && ms.rowBorder]}>
          <View style={ms.rowText}>
            <Text style={ms.name} numberOfLines={1}>
              {meal.food_items.map((f: any) => f.item_name).join(", ")}
            </Text>
            <Text style={ms.macroLine}>
              P {Math.round(meal.total_protein_g)}g · C {Math.round(meal.total_carbs_g)}g · F {Math.round(meal.total_fat_g)}g
            </Text>
          </View>
          <Text style={ms.kcal}>{Math.round(meal.total_calories)}</Text>
          <Text style={ms.unit}>kcal</Text>
        </View>
      ))}
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
  slimRow:   { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: WHITE, borderRadius: 16, marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 12 },
  slimTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: CHARCOAL },
  slimHint:  { fontSize: 11, fontWeight: "600", color: MUTED },
  row:       { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  rowText:   { flex: 1, gap: 2 },
  name:      { fontSize: 13, fontWeight: "600", color: CHARCOAL },
  macroLine: { fontSize: 10, color: MUTED, fontWeight: "500" },
  kcal:      { fontSize: 14, fontWeight: "700", color: CHARCOAL },
  unit:      { fontSize: 10, color: MUTED, fontWeight: "500", marginTop: 2 },
});

// ─── Planned meal row + cards ─────────────────────────────────────────────────
function PlannedRow({
  pm, accent, canEat, onEat, onSwap, onRemove,
}: {
  pm: PlannedMeal;
  accent: string;
  canEat: boolean;
  onEat: (pm: PlannedMeal) => void;
  onSwap: (pm: PlannedMeal) => void;
  onRemove: (pm: PlannedMeal) => void;
}) {
  const names = pm.items.map((i) => i.item_name).join(", ");
  return (
    <View style={pln.row}>
      <View style={[pln.dot, { borderColor: accent }]} />
      <View style={pln.rowText}>
        <Text style={pln.name} numberOfLines={1}>{names}</Text>
        <Text style={pln.meta}>{Math.round(pm.total_calories)} kcal · planned</Text>
      </View>
      <View style={pln.actions}>
        {canEat && (
          <TouchableOpacity style={[pln.actSolid, { backgroundColor: accent }]} onPress={() => onEat(pm)} activeOpacity={0.8}>
            <Text style={pln.actSolidTxt}>Ate it</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={pln.actOutline} onPress={() => onSwap(pm)} activeOpacity={0.75}>
          <Text style={pln.actTxt}>Swap</Text>
        </TouchableOpacity>
        <TouchableOpacity style={pln.actOutline} onPress={() => onRemove(pm)} activeOpacity={0.75}>
          <Text style={[pln.actTxt, { color: "#EF4444" }]}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Per-slot planned card (used on future dates)
function PlanSlotCard({
  section, planned, onAdd, onSwap, onRemove,
}: {
  section: typeof MEAL_SECTIONS[number];
  planned: PlannedMeal[];
  onAdd: (slot: MealType) => void;
  onSwap: (pm: PlannedMeal) => void;
  onRemove: (pm: PlannedMeal) => void;
}) {
  const Icon  = section.icon;
  const total = planned.reduce((s, p) => s + p.total_calories, 0);
  return (
    <View style={[ms.card, CARD_SHADOW]}>
      <View style={ms.header}>
        <View style={[ms.iconBg, { backgroundColor: section.bg }]}>
          <Icon size={14} color={section.color} strokeWidth={2.5} />
        </View>
        <Text style={ms.title}>{section.label}</Text>
        {total > 0 && <Text style={[ms.totalKcal, { color: section.color }]}>{Math.round(total)} kcal</Text>}
        <TouchableOpacity style={[ms.addBtn, { backgroundColor: section.bg }]} onPress={() => onAdd(section.key)}>
          <Plus size={12} color={section.color} strokeWidth={3} />
        </TouchableOpacity>
      </View>
      {planned.length === 0 ? (
        <Text style={pln.emptyHint}>Tap ＋ to plan {section.label.toLowerCase()}</Text>
      ) : (
        planned.map((pm) => (
          <PlannedRow
            key={pm.id}
            pm={pm}
            accent={section.color}
            canEat={false}
            onEat={() => {}}
            onSwap={onSwap}
            onRemove={onRemove}
          />
        ))
      )}
    </View>
  );
}

// "Planned for today" reconciliation card (used on today)
function PlannedTodayCard({
  planned, onEat, onSwap, onRemove,
}: {
  planned: PlannedMeal[];
  onEat: (pm: PlannedMeal) => void;
  onSwap: (pm: PlannedMeal) => void;
  onRemove: (pm: PlannedMeal) => void;
}) {
  return (
    <View style={[pln.card, CARD_SHADOW]}>
      <Text style={pln.cardTitle}>PLANNED FOR TODAY — TAP “ATE IT” TO LOG</Text>
      {planned.map((pm, i) => (
        <View key={pm.id}>
          {i > 0 && <View style={pln.div} />}
          <PlannedRow
            pm={pm}
            accent={SLOT_BY_KEY[pm.meal_type]?.color ?? SKY}
            canEat
            onEat={onEat}
            onSwap={onSwap}
            onRemove={onRemove}
          />
        </View>
      ))}
    </View>
  );
}

const pln = StyleSheet.create({
  card:      { backgroundColor: WHITE, borderRadius: 20, marginHorizontal: 20, marginBottom: 12, padding: 16 },
  cardTitle: { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },
  div:       { height: 1, backgroundColor: "#F1F5F9", marginVertical: 8 },
  row:       { flexDirection: "row", alignItems: "center", gap: 10 },
  dot:       { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderStyle: "dashed", backgroundColor: "transparent" },
  rowText:   { flex: 1, gap: 2 },
  name:      { fontSize: 13, fontWeight: "700", color: CHARCOAL },
  meta:      { fontSize: 10, color: MUTED, fontWeight: "500" },
  actions:   { flexDirection: "row", alignItems: "center", gap: 6 },
  actSolid:  { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  actSolidTxt: { fontSize: 11, fontWeight: "800", color: WHITE },
  actOutline: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderColor: "#E2E8F0" },
  actTxt:    { fontSize: 11, fontWeight: "700", color: CHARCOAL },
  emptyHint: { fontSize: 12, color: MUTED, fontStyle: "italic", paddingVertical: 2 },
});

// ─── Plan picker sheet ────────────────────────────────────────────────────────
function PlanPicker({
  slot, swapping, onClose, onPick,
}: {
  slot: MealType | null;
  swapping: boolean;
  onClose: () => void;
  onPick: (item: { name: string; grams: number }) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={slot != null} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={pk.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[pk.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={pk.handle} />
        <Text style={pk.title}>{swapping ? "Swap dish" : `Plan ${slot ?? ""}`}</Text>
        <Text style={pk.sub}>Pick a dish — you can swap or remove it anytime.</Text>
        <ScrollView style={pk.list} showsVerticalScrollIndicator={false}>
          {STAPLES.map((s) => (
            <TouchableOpacity key={s.name} style={pk.item} onPress={() => onPick(s)} activeOpacity={0.7}>
              <Text style={pk.emoji}>{s.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={pk.name}>{s.name}</Text>
                <Text style={pk.meta}>{s.grams} g serving</Text>
              </View>
              <Plus size={16} color={SKY} strokeWidth={2.5} />
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={pk.cancel} onPress={onClose} activeOpacity={0.8}>
          <Text style={pk.cancelTxt}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const pk = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet:    { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: WHITE, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10 },
  handle:   { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", marginBottom: 14 },
  title:    { fontSize: 18, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.4 },
  sub:      { fontSize: 12, color: MUTED, marginTop: 3, marginBottom: 12 },
  list:     { maxHeight: 400 },
  item:     { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  emoji:    { fontSize: 24 },
  name:     { fontSize: 14, fontWeight: "700", color: CHARCOAL },
  meta:     { fontSize: 11, color: MUTED, marginTop: 1 },
  cancel:   { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  cancelTxt: { fontSize: 14, fontWeight: "700", color: MUTED },
});

// ─── Date picker (custom calendar — no native dependency) ─────────────────────
const DAY_LABELS  = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function DatePickerModal({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean;
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const [viewYear, setViewYear]   = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  // Re-centre on the selected month each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
  }, [visible, selected]);

  const firstDay     = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const selKey   = toDateParam(selected);
  const todayKey = toDateParam(new Date());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={dp.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={dp.centerWrap} pointerEvents="box-none">
        <View style={[dp.card, CARD_SHADOW]}>
          <View style={dp.head}>
            <TouchableOpacity style={dp.navBtn} onPress={prevMonth} activeOpacity={0.7}>
              <ChevronLeft size={18} color={CHARCOAL} strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={dp.title}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
            <TouchableOpacity style={dp.navBtn} onPress={nextMonth} activeOpacity={0.7}>
              <ChevronRight size={18} color={CHARCOAL} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <View style={dp.dowRow}>
            {DAY_LABELS.map(d => <Text key={d} style={dp.dow}>{d}</Text>)}
          </View>

          <View style={dp.grid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`e-${idx}`} style={dp.cell} />;
              const k       = toDateParam(new Date(viewYear, viewMonth, day));
              const isSel   = k === selKey;
              const isToday = k === todayKey;
              return (
                <TouchableOpacity
                  key={k}
                  style={dp.cell}
                  activeOpacity={0.7}
                  onPress={() => { onSelect(new Date(viewYear, viewMonth, day)); onClose(); }}
                >
                  <View style={[dp.dayWrap, isToday && dp.today, isSel && dp.sel]}>
                    <Text style={[dp.dayTxt, isToday && dp.todayTxt, isSel && dp.selTxt]}>{day}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={dp.todayBtn} onPress={() => { onSelect(new Date()); onClose(); }} activeOpacity={0.8}>
            <Text style={dp.todayBtnTxt}>Jump to Today</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const dp = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card:       { width: "100%", maxWidth: 360, backgroundColor: WHITE, borderRadius: 24, padding: 18 },
  head:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  navBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  title:      { fontSize: 16, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.3 },
  dowRow:     { flexDirection: "row", marginBottom: 6 },
  dow:        { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.4 },
  grid:       { flexDirection: "row", flexWrap: "wrap" },
  cell:       { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayWrap:    { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dayTxt:     { fontSize: 13, fontWeight: "600", color: CHARCOAL },
  today:      { backgroundColor: "rgba(85,205,252,0.14)" },
  todayTxt:   { color: SKY, fontWeight: "800" },
  sel:        { backgroundColor: SKY },
  selTxt:     { color: WHITE, fontWeight: "800" },
  todayBtn:   { marginTop: 12, alignItems: "center", paddingVertical: 11, borderRadius: 12, backgroundColor: "#EFF6FF" },
  todayBtnTxt:{ fontSize: 13, fontWeight: "700", color: SKY },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toKey(d: Date) {
  return toDateParam(d);
}
function fmtHeader(d: Date) {
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}
type DayClass = "past" | "today" | "future";
function classifyDay(d: Date): DayClass {
  const sel = toKey(d);
  const today = toDateParam(new Date());
  return sel < today ? "past" : sel > today ? "future" : "today";
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DiaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [date, setDate]       = useState(new Date());
  const [meals, setMeals]     = useState<LoggedMeal[]>([]);
  const [planned, setPlanned] = useState<PlannedMeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [calorieTarget, setCalorieTarget] = useState(2000);

  // Plan picker state: which slot is open, and whether it's a swap of an existing plan
  const [pickerSlot, setPickerSlot] = useState<MealType | null>(null);
  const [swapTarget, setSwapTarget] = useState<PlannedMeal | null>(null);

  // Calendar date picker
  const [showPicker, setShowPicker] = useState(false);

  const dayClass = classifyDay(date);

  // Fetch profile once on mount to get the user's real calorie target
  useEffect(() => {
    apiFetch("/api/v1/profile")
      .then(r => r.ok ? r.json() : null)
      .then((p: UserProfile | null) => { if (p) setCalorieTarget(p.calorie_target); })
      .catch((err) => {
        console.log("[DiaryScreen] Failed to fetch profile:", err instanceof Error ? err.message : String(err));
      });
  }, []);

  const fetchMeals = useCallback(async (d: Date) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/meals?date=${toKey(d)}`);
      if (res.ok) {
        const data: MealsListResponse = await res.json();
        setMeals(data.meals);
      }
    } catch (err) {
      // Offline — keep existing meals, log the error
      console.log("[DiaryScreen] Failed to fetch meals:", err instanceof Error ? err.message : String(err));
    }
    finally { setLoading(false); }
  }, []);

  const fetchPlanned = useCallback(async (d: Date) => {
    // Only today & future carry active plans worth showing.
    if (toKey(d) < toDateParam(new Date())) { setPlanned([]); return; }
    try {
      const res = await apiFetch(`/api/v1/planned-meals?date=${toKey(d)}`);
      if (res.ok) {
        const data: PlannedMealsListResponse = await res.json();
        setPlanned(data.planned_meals);
      }
    } catch (err) {
      console.log("[DiaryScreen] Failed to fetch planned meals:", err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Refetch on focus AND on date change (the memoized callback re-runs when
  // `date` changes while focused), so returning here after logging a meal or
  // reconciling a plan always shows fresh data — even when the deduped tab
  // navigation reuses this screen instead of remounting it.
  useFocusEffect(
    useCallback(() => { fetchMeals(date); fetchPlanned(date); }, [date, fetchMeals, fetchPlanned]),
  );

  const refresh = useCallback(() => { fetchMeals(date); fetchPlanned(date); }, [date, fetchMeals, fetchPlanned]);

  const { consumed, protein, carbs, fat } = useMemo(() => ({
    consumed: Math.round(meals.reduce((s, m) => s + m.total_calories,  0)),
    protein:  Math.round(meals.reduce((s, m) => s + m.total_protein_g, 0)),
    carbs:    Math.round(meals.reduce((s, m) => s + m.total_carbs_g,   0)),
    fat:      Math.round(meals.reduce((s, m) => s + m.total_fat_g,     0)),
  }), [meals]);

  const plannedTotal = useMemo(
    () => Math.round(planned.reduce((s, p) => s + p.total_calories, 0)),
    [planned],
  );

  const remaining = Math.max(calorieTarget - consumed, 0);
  const over      = consumed > calorieTarget;
  const overBy    = Math.max(consumed - calorieTarget, 0);
  const dateKey   = toKey(date); // keys the entrance animations so they replay on date change
  const mealsBySection   = (key: string) => meals.filter(m => m.meal_type === key);
  const plannedBySection = (key: string) => planned.filter(p => p.meal_type === key);

  // ── Plan actions ────────────────────────────────────────────────────────────
  const openAdd  = (slot: MealType) => { setSwapTarget(null); setPickerSlot(slot); };
  const openSwap = (pm: PlannedMeal) => { setSwapTarget(pm); setPickerSlot(pm.meal_type); };
  const closePicker = () => { setPickerSlot(null); setSwapTarget(null); };

  const handlePick = useCallback(async (item: { name: string; grams: number }) => {
    const slot = pickerSlot;
    const target = swapTarget;
    closePicker();
    if (!slot) return;
    try {
      let res: Response;
      if (target) {
        res = await apiFetch(`/api/v1/planned-meals/${target.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ item_name: item.name, grams: item.grams }] }),
        });
      } else {
        const body: CreatePlannedMealRequest = {
          meal_type: slot,
          scheduled_for: slotDateTimeISO(date, slot),
          items: [{ item_name: item.name, grams: item.grams }],
        };
        res = await apiFetch("/api/v1/planned-meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) { Alert.alert("Error", await readErrorDetail(res, "Could not save the plan.")); return; }
      fetchPlanned(date);
    } catch (err) {
      console.log("[DiaryScreen] Plan save failed:", err instanceof Error ? err.message : String(err));
      Alert.alert("Error", "Could not reach the server.");
    }
  }, [pickerSlot, swapTarget, date, fetchPlanned]);

  const handleRemove = useCallback((pm: PlannedMeal) => {
    Alert.alert(
      "Remove plan?",
      `Remove ${pm.items.map(i => i.item_name).join(", ")} from your plan?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: async () => {
            try {
              const res = await apiFetch(`/api/v1/planned-meals/${pm.id}`, { method: "DELETE" });
              if (!res.ok) { Alert.alert("Error", "Could not remove the plan."); return; }
              fetchPlanned(date);
            } catch (err) {
              console.log("[DiaryScreen] Plan remove failed:", err instanceof Error ? err.message : String(err));
              Alert.alert("Error", "Could not reach the server.");
            }
          },
        },
      ],
    );
  }, [date, fetchPlanned]);

  const handleEat = useCallback(async (pm: PlannedMeal) => {
    try {
      const res = await apiFetch(`/api/v1/planned-meals/${pm.id}/log`, { method: "POST" });
      if (!res.ok) { Alert.alert("Error", await readErrorDetail(res, "Could not log this meal.")); return; }
      refresh();
    } catch (err) {
      console.log("[DiaryScreen] Plan log failed:", err instanceof Error ? err.message : String(err));
      Alert.alert("Error", "Could not reach the server.");
    }
  }, [refresh]);

  const isFuture = dayClass === "future";
  const todaysPlans = dayClass === "today" ? planned : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header — back button · tappable date (opens calendar) · calendar button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navBtn} activeOpacity={0.7}>
          <ArrowLeft size={20} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} onPress={() => setShowPicker(true)} activeOpacity={0.7}>
          <View style={styles.headerDateRow}>
            <Text style={styles.headerDate}>{fmtHeader(date)}</Text>
            <ChevronDown size={16} color={MUTED} strokeWidth={2.5} />
          </View>
          <Text style={styles.headerSub}>{isFuture ? "Meal Plan" : "Food Diary"} · tap to change date</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.navBtn} activeOpacity={0.7}>
          <Calendar size={18} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {isFuture ? (
        // ── PLAN MODE (future date) ──────────────────────────────────────────
        <>
          <FadeSlideIn key={`plansum-${dateKey}`}>
            <View style={[styles.planSummary, CARD_SHADOW]}>
              <View>
                <Text style={styles.planSummaryLabel}>PLANNED</Text>
                <Text style={styles.planSummaryHint}>
                  {planned.length === 0 ? "Nothing planned yet" : `${planned.length} meal${planned.length !== 1 ? "s" : ""} lined up`}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.planSummaryKcal}>{plannedTotal}</Text>
                <Text style={styles.planSummarySub}>of {calorieTarget} kcal target</Text>
              </View>
            </View>
          </FadeSlideIn>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {MEAL_SECTIONS.map((sec, i) => (
              <FadeSlideIn key={`${dateKey}-plan-${sec.key}`} index={i}>
                <PlanSlotCard
                  section={sec}
                  planned={plannedBySection(sec.key)}
                  onAdd={openAdd}
                  onSwap={openSwap}
                  onRemove={handleRemove}
                />
              </FadeSlideIn>
            ))}
            <Text style={styles.planFootnote}>
              Plans are flexible — swap or remove anytime. When the day arrives, tap “Ate it” to log it.
            </Text>
          </ScrollView>
        </>
      ) : (
        // ── LOG MODE (today / past) ──────────────────────────────────────────
        <>
          <FadeSlideIn key={`sum-${dateKey}`}>
            <View style={[styles.summaryCard, CARD_SHADOW]}>
              <CalorieRing consumed={consumed} target={calorieTarget} over={over} />
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRight}>
                <View style={styles.statusRow}>
                  <Text style={[styles.statusNum, { color: over ? "#EF4444" : "#22C55E" }]}>
                    {over ? overBy : remaining}
                  </Text>
                  <Text style={styles.statusUnit}>kcal {over ? "over" : "left"}</Text>
                </View>
                <Text style={styles.statusSub}>{consumed} of {calorieTarget} eaten</Text>
                <View style={styles.macroPillRow}>
                  <MacroPill label="Protein" val={protein} color="#F97316" />
                  <View style={styles.macroDivider} />
                  <MacroPill label="Carbs"   val={carbs}   color="#0EA5E9" />
                  <View style={styles.macroDivider} />
                  <MacroPill label="Fat"     val={fat}      color="#F59E0B" />
                </View>
              </View>
            </View>
          </FadeSlideIn>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          >
            {todaysPlans.length > 0 && (
              <FadeSlideIn key={`todayplan-${dateKey}`}>
                <PlannedTodayCard
                  planned={todaysPlans}
                  onEat={handleEat}
                  onSwap={openSwap}
                  onRemove={handleRemove}
                />
              </FadeSlideIn>
            )}

            {loading && meals.length === 0 ? (
              <ActivityIndicator color={SKY} style={{ marginTop: 40 }} />
            ) : (
              MEAL_SECTIONS.map((sec, i) => (
                <FadeSlideIn key={`${dateKey}-${sec.key}`} index={i}>
                  <MealSection
                    section={sec}
                    meals={mealsBySection(sec.key)}
                    onScan={() => router.push("/camera")}
                  />
                </FadeSlideIn>
              ))
            )}

            {consumed > 0 && (
              <FadeSlideIn key={`ai-${dateKey}`} index={4}>
                <View style={[styles.noteCard, CARD_SHADOW]}>
                  <Text style={styles.noteLabel}>AI INSIGHT</Text>
                  <Text style={styles.noteText}>
                    {consumed > calorieTarget * 0.9
                      ? `High intake day — ${consumed} kcal. Consider a lighter dinner.`
                      : `Good day! ${consumed} kcal logged with ${remaining} kcal remaining.`}
                  </Text>
                </View>
              </FadeSlideIn>
            )}
          </ScrollView>
        </>
      )}

      <PlanPicker
        slot={pickerSlot}
        swapping={swapTarget != null}
        onClose={closePicker}
        onPick={handlePick}
      />

      <DatePickerModal
        visible={showPicker}
        selected={date}
        onSelect={setDate}
        onClose={() => setShowPicker(false)}
      />

      <FloatingNav
        active="diary"
        onHome={() => router.navigate("/")}
        onProgress={() => router.navigate("/progress")}
        onDiary={() => {}}
        onCamera={() => router.push("/camera")}
        onMore={() => router.push("/profile")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: WHITE, ...CARD_SHADOW },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  headerDateRow:{ flexDirection: "row", alignItems: "center", gap: 4 },
  headerDate:   { fontSize: 16, fontWeight: "700", color: CHARCOAL, letterSpacing: -0.3 },
  headerSub:    { fontSize: 11, fontWeight: "600", color: MUTED },
  summaryCard:  { flexDirection: "row", alignItems: "center", backgroundColor: WHITE, borderRadius: 24, marginHorizontal: 20, marginBottom: 16, padding: 20, gap: 16 },
  summaryDivider: { width: 1, height: 72, backgroundColor: "#EEF2FF" },
  summaryRight: { flex: 1, gap: 8 },
  statusRow:    { flexDirection: "row", alignItems: "baseline", gap: 5 },
  statusNum:    { fontSize: 32, fontWeight: "800", letterSpacing: -1.2 },
  statusUnit:   { fontSize: 12, fontWeight: "600", color: MUTED },
  statusSub:    { fontSize: 11, fontWeight: "500", color: MUTED, marginTop: -4 },
  macroPillRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFF", borderRadius: 12, padding: 10 },
  macroDivider: { width: 1, height: 28, backgroundColor: "#E2E8F0", flex: 0, marginHorizontal: 8 },
  noteCard:     { backgroundColor: WHITE, borderRadius: 20, marginHorizontal: 20, marginTop: 4, padding: 16, gap: 6 },
  noteLabel:    { fontSize: 9, fontWeight: "700", color: SKY, letterSpacing: 0.12 },
  noteText:     { fontSize: 13, fontWeight: "500", color: CHARCOAL, lineHeight: 19 },

  // Plan mode
  planSummary:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: WHITE, borderRadius: 24, marginHorizontal: 20, marginBottom: 16, paddingHorizontal: 22, paddingVertical: 18 },
  planSummaryLabel: { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.8, textTransform: "uppercase" },
  planSummaryHint:  { fontSize: 13, fontWeight: "600", color: CHARCOAL, marginTop: 4 },
  planSummaryKcal:  { fontSize: 30, fontWeight: "800", color: SKY, letterSpacing: -1 },
  planSummarySub:   { fontSize: 10, fontWeight: "500", color: MUTED },
  planFootnote:     { fontSize: 11, color: MUTED, fontStyle: "italic", textAlign: "center", paddingHorizontal: 32, marginTop: 6, lineHeight: 16 },
});
