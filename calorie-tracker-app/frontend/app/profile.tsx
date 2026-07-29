/**
 * profile.tsx — Swasth Profile Screen with Stats, Info, Goals & Settings
 * Follows the master implementation prompt exactly
 */
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { 
  ArrowLeft, 
  Settings as SettingsIcon, 
  User, 
  ChevronRight,
  Star,
  TrendingUp,
  Calendar,
  Activity,
} from "@/components/icons";
import { apiFetch, readErrorDetail } from "@/constants/api";
import type { UserProfile, UserProfileUpdate, LoggedMeal, MealsListResponse } from "@/types/api";
import { FloatingNav } from "@/components/FloatingNav";

const SKY      = "#55CDFC";
const CHARCOAL = "#1A1D20";
const MUTED    = "#94A3B8";
const WHITE    = "#FFFFFF";
const BG       = "#F8FAFC";
const GREEN    = "#22C55E";
const PURPLE   = "#7C3AED";

const CARD_SHADOW = {
  shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07, shadowRadius: 16, elevation: 6,
} as const;

// ─── Stats Card ──────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: { 
  icon: any; 
  label: string; 
  value: string; 
  color: string; 
}) {
  return (
    <View style={[st.card, CARD_SHADOW]}>
      <View style={[st.iconBox, { backgroundColor: `${color}15` }]}>
        <Icon size={18} color={color} strokeWidth={2.5} />
      </View>
      <Text style={st.value}>{value}</Text>
      <Text style={st.label}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card:    { flex: 1, backgroundColor: WHITE, borderRadius: 18, padding: 14, alignItems: "center", gap: 8, minWidth: 75 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  value:   { fontSize: 22, fontWeight: "800", color: CHARCOAL, letterSpacing: -1 },
  label:   { fontSize: 10, fontWeight: "600", color: MUTED, textAlign: "center" },
});

// ─── Info Row (Clickable) ─────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, onPress }: { 
  icon: any; 
  label: string; 
  value: string; 
  onPress: () => void; 
}) {
  return (
    <TouchableOpacity style={ir.row} onPress={onPress} activeOpacity={0.7}>
      <View style={ir.iconBox}>
        <Icon size={16} color={SKY} strokeWidth={2} />
      </View>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{value}</Text>
      <ChevronRight size={16} color={MUTED} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const ir = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  iconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(85,205,252,0.1)", alignItems: "center", justifyContent: "center" },
  label:   { flex: 1, fontSize: 14, fontWeight: "600", color: CHARCOAL },
  value:   { fontSize: 14, fontWeight: "700", color: SKY },
});

// ─── Edit Dialog ──────────────────────────────────────────────────────────────
function EditDialog({ 
  visible, 
  title, 
  value, 
  onClose, 
  onSave, 
  placeholder, 
  keyboardType,
  unit,
}: {
  visible: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onSave: (newValue: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  unit?: string;
}) {
  const [text, setText] = useState(value);
  
  useEffect(() => {
    if (visible) setText(value);
  }, [visible, value]);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={ed.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={ed.centerWrap} pointerEvents="box-none">
        <View style={[ed.card, CARD_SHADOW]}>
          <Text style={ed.title}>{title}</Text>
          <View style={ed.inputRow}>
            <TextInput
              style={ed.input}
              value={text}
              onChangeText={setText}
              placeholder={placeholder}
              placeholderTextColor={MUTED}
              keyboardType={keyboardType ?? "default"}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {unit && <Text style={ed.unit}>{unit}</Text>}
          </View>
          <View style={ed.btnRow}>
            <TouchableOpacity style={ed.btnCancel} onPress={onClose} activeOpacity={0.8}>
              <Text style={ed.btnCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ed.btnSave} onPress={handleSave} activeOpacity={0.8}>
              <Text style={ed.btnSaveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ed = StyleSheet.create({
  backdrop:   { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  centerWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card:       { width: "100%", maxWidth: 320, backgroundColor: WHITE, borderRadius: 20, padding: 20, gap: 16 },
  title:      { fontSize: 17, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.3 },
  inputRow:   { flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", paddingHorizontal: 14, height: 48 },
  input:      { flex: 1, fontSize: 16, fontWeight: "600", color: CHARCOAL },
  unit:       { fontSize: 13, fontWeight: "600", color: MUTED, marginLeft: 8 },
  btnRow:     { flexDirection: "row", gap: 10 },
  btnCancel:  { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  btnCancelTxt: { fontSize: 14, fontWeight: "700", color: CHARCOAL },
  btnSave:    { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: SKY },
  btnSaveTxt: { fontSize: 14, fontWeight: "700", color: WHITE },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>({
    id: 0,
    updated_at: "",
    name: "User",
    age: null,
    weight_kg: null,
    height_cm: null,
    calorie_target: 2000,
    protein_target_g: 120,
    carbs_target_g: 250,
    fat_target_g: 65,
  });

  // Edit dialogs
  const [editMode, setEditMode] = useState<"name" | "age" | "weight" | "height" | "activity" | null>(null);
  const [editValue, setEditValue] = useState("");

  // Fetch profile
  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/profile");
      if (res.ok) {
        const p: UserProfile = await res.json();
        setProfile(p);
      }
    } catch (err) {
      console.log("[ProfileScreen] Failed to fetch profile:", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));

  // Computed stats
  const bmi = useMemo(() => {
    if (!profile.weight_kg || !profile.height_cm) return null;
    const heightM = profile.height_cm / 100;
    return Math.round((profile.weight_kg / (heightM * heightM)) * 10) / 10;
  }, [profile.weight_kg, profile.height_cm]);

  const bmr = useMemo(() => {
    if (!profile.weight_kg || !profile.height_cm || !profile.age) return null;
    // Mifflin-St Jeor (male baseline)
    return Math.round(10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5);
  }, [profile.weight_kg, profile.height_cm, profile.age]);

  const bmiStatus = useMemo(() => {
    if (!bmi) return null;
    if (bmi < 18.5) return "Underweight";
    if (bmi < 25) return "Normal";
    if (bmi < 30) return "Overweight";
    return "Obese";
  }, [bmi]);

  // Open edit dialog
  const openEdit = (field: "name" | "age" | "weight" | "height" | "activity") => {
    setEditMode(field);
    if (field === "name") setEditValue(profile.name);
    else if (field === "age") setEditValue(profile.age ? String(profile.age) : "");
    else if (field === "weight") setEditValue(profile.weight_kg ? String(profile.weight_kg) : "");
    else if (field === "height") setEditValue(profile.height_cm ? String(profile.height_cm) : "");
    else if (field === "activity") setEditValue("Moderate"); // placeholder
  };

  // Save edited field
  const saveEdit = async (newValue: string) => {
    if (!editMode) return;
    const payload: Partial<UserProfileUpdate> = {};
    
    if (editMode === "name") payload.name = newValue.trim();
    else if (editMode === "age") payload.age = newValue ? parseInt(newValue, 10) : null;
    else if (editMode === "weight") payload.weight_kg = newValue ? parseFloat(newValue) : null;
    else if (editMode === "height") payload.height_cm = newValue ? parseFloat(newValue) : null;
    // activity level not yet in backend schema — skip for now

    try {
      const res = await apiFetch("/api/v1/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        Alert.alert("Error", await readErrorDetail(res, "Could not update profile."));
        return;
      }
      fetchProfile();
    } catch (err) {
      console.log("[ProfileScreen] Failed to save:", err instanceof Error ? err.message : String(err));
      Alert.alert("Error", "Could not reach the server.");
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BG }}>
        <ActivityIndicator color={SKY} size="large" />
      </View>
    );
  }

  const firstName = profile.name.split(" ")[0];
  const greeting = "Namaste";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <ArrowLeft size={20} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity 
          style={styles.settingsBtn} 
          onPress={() => router.push("/settings" as any)} 
          activeOpacity={0.75}
        >
          <SettingsIcon size={20} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        
        {/* ── Profile Header ──────────────────────────────────────── */}
        <View style={[styles.profileHeader, CARD_SHADOW]}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              <User size={32} color={WHITE} strokeWidth={1.5} />
            </View>
            <TouchableOpacity style={styles.cameraBtn} activeOpacity={0.8}>
              <Text style={styles.cameraEmoji}>📷</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.userName}>{profile.name}</Text>
          <View style={styles.proBadge}>
            <Text style={styles.proStar}>⭐</Text>
            <Text style={styles.proText}>Swasth Pro</Text>
          </View>
          
          <Text style={styles.greet}>{greeting}, {firstName}! 👋</Text>
          <Text style={styles.subGreet}>Let's build healthier habits together.</Text>
          
          <View style={styles.chipRow}>
            {profile.age && <View style={styles.chip}><Text style={styles.chipTxt}>{profile.age} yrs</Text></View>}
            {profile.height_cm && <View style={styles.chip}><Text style={styles.chipTxt}>{profile.height_cm} cm</Text></View>}
            {profile.weight_kg && <View style={styles.chip}><Text style={styles.chipTxt}>{profile.weight_kg} kg</Text></View>}
          </View>
        </View>

        {/* ── Quick Stats ─────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <StatCard icon={Calendar} label="Day Streak" value="12" color={GREEN} />
          <StatCard icon={Star} label="Health Score" value="88" color={SKY} />
        </View>
        <View style={styles.statsRow}>
          <StatCard icon={TrendingUp} label="Avg Calories" value="1,847" color={PURPLE} />
          <StatCard icon={Activity} label="Days Logged" value="23" color="#F97316" />
        </View>

        {/* ── Personal Information ────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <InfoRow icon={User} label="Full Name" value={profile.name} onPress={() => openEdit("name")} />
          <InfoRow icon={Calendar} label="Age" value={profile.age ? `${profile.age} years` : "Not set"} onPress={() => openEdit("age")} />
          <InfoRow icon={Activity} label="Weight" value={profile.weight_kg ? `${profile.weight_kg} kg` : "Not set"} onPress={() => openEdit("weight")} />
          <InfoRow icon={TrendingUp} label="Height" value={profile.height_cm ? `${profile.height_cm} cm` : "Not set"} onPress={() => openEdit("height")} />
          <InfoRow icon={Star} label="Activity Level" value="Moderate" onPress={() => openEdit("activity")} />
        </View>

        {/* ── Daily Goals ──────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Daily Goals</Text>
            <View style={styles.autoCalcBadge}>
              <Text style={styles.autoCalcTxt}>Auto Calculated</Text>
            </View>
          </View>
          <View style={styles.goalsGrid}>
            <View style={styles.goalCell}>
              <Text style={styles.goalLabel}>Calories</Text>
              <Text style={styles.goalValue}>{profile.calorie_target}</Text>
            </View>
            <View style={styles.goalCell}>
              <Text style={styles.goalLabel}>Protein</Text>
              <Text style={styles.goalValue}>{profile.protein_target_g}g</Text>
            </View>
            <View style={styles.goalCell}>
              <Text style={styles.goalLabel}>Carbs</Text>
              <Text style={styles.goalValue}>{profile.carbs_target_g}g</Text>
            </View>
            <View style={styles.goalCell}>
              <Text style={styles.goalLabel}>Fat</Text>
              <Text style={styles.goalValue}>{profile.fat_target_g}g</Text>
            </View>
          </View>
        </View>

        {/* ── Body Stats ───────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <Text style={styles.cardTitle}>Body Stats</Text>
          <View style={styles.bodyRow}>
            <View style={styles.bodyLeft}>
              <Text style={styles.bodyLabel}>BMI</Text>
              <Text style={styles.bodyValue}>{bmi ?? "—"}</Text>
              {bmiStatus && <Text style={styles.bodyStatus}>{bmiStatus}</Text>}
            </View>
            <View style={styles.bodyDivider} />
            <View style={styles.bodyRight}>
              <Text style={styles.bodyLabel}>BMR</Text>
              <Text style={styles.bodyValue}>{bmr ?? "—"}</Text>
              {bmr && <Text style={styles.bodyStatus}>{bmr} cal/day</Text>}
            </View>
          </View>
        </View>

        {/* ── Premium Card ─────────────────────────────────────────── */}
        <View style={[styles.premiumCard, CARD_SHADOW]}>
          <Text style={styles.premiumStar}>⭐</Text>
          <Text style={styles.premiumTitle}>Swasth Pro</Text>
          <Text style={styles.premiumSub}>Unlock advanced insights, meal plans, and more.</Text>
          <TouchableOpacity style={styles.premiumBtn} activeOpacity={0.8}>
            <Text style={styles.premiumBtnTxt}>View Benefits</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      <FloatingNav
        active="more"
        onHome={() => router.navigate("/")}
        onProgress={() => router.navigate("/progress")}
        onDiary={() => router.navigate("/diary")}
        onCamera={() => router.push("/camera")}
        onMore={() => {}}
      />

      <EditDialog
        visible={editMode !== null}
        title={
          editMode === "name" ? "Edit Name" :
          editMode === "age" ? "Edit Age" :
          editMode === "weight" ? "Edit Weight" :
          editMode === "height" ? "Edit Height" :
          "Edit Activity Level"
        }
        value={editValue}
        onClose={() => setEditMode(null)}
        onSave={saveEdit}
        placeholder={
          editMode === "name" ? "Your name" :
          editMode === "age" ? "e.g. 25" :
          editMode === "weight" ? "e.g. 72" :
          editMode === "height" ? "e.g. 175" :
          "Activity level"
        }
        keyboardType={editMode === "name" || editMode === "activity" ? "default" : editMode === "age" ? "numeric" : "decimal-pad"}
        unit={
          editMode === "age" ? "yrs" :
          editMode === "weight" ? "kg" :
          editMode === "height" ? "cm" :
          undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, gap: 16 },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.4 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", ...CARD_SHADOW },
  settingsBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", ...CARD_SHADOW },

  // Profile header
  profileHeader: { backgroundColor: WHITE, borderRadius: 24, padding: 24, alignItems: "center", gap: 10 },
  avatarWrap: { position: "relative", marginBottom: 6 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: SKY, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: WHITE },
  cameraBtn: { position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: WHITE, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: SKY },
  cameraEmoji: { fontSize: 12 },
  userName: { fontSize: 22, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.5 },
  proBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(124,58,237,0.1)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  proStar: { fontSize: 11 },
  proText: { fontSize: 11, fontWeight: "700", color: PURPLE },
  greet: { fontSize: 16, fontWeight: "600", color: CHARCOAL, marginTop: 6 },
  subGreet: { fontSize: 13, color: MUTED, textAlign: "center", marginBottom: 6 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { backgroundColor: "#F1F5F9", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  chipTxt: { fontSize: 11, fontWeight: "600", color: CHARCOAL },

  // Stats
  statsRow: { flexDirection: "row", gap: 12 },

  // Card
  card: { backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 0 },
  cardTitle: { fontSize: 13, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.2, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },

  // Auto calc badge
  autoCalcBadge: { backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  autoCalcTxt: { fontSize: 9, fontWeight: "700", color: GREEN, letterSpacing: 0.3, textTransform: "uppercase" },

  // Goals grid
  goalsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  goalCell: { flex: 1, minWidth: "45%", backgroundColor: "#F8FAFC", borderRadius: 14, padding: 14, alignItems: "center", gap: 4 },
  goalLabel: { fontSize: 10, fontWeight: "600", color: MUTED, textTransform: "uppercase" },
  goalValue: { fontSize: 20, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.8 },

  // Body stats
  bodyRow: { flexDirection: "row", alignItems: "center" },
  bodyLeft: { flex: 1, alignItems: "center", gap: 4 },
  bodyRight: { flex: 1, alignItems: "center", gap: 4 },
  bodyDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#E2E8F0", marginHorizontal: 8 },
  bodyLabel: { fontSize: 11, fontWeight: "600", color: MUTED, textTransform: "uppercase" },
  bodyValue: { fontSize: 28, fontWeight: "800", color: CHARCOAL, letterSpacing: -1 },
  bodyStatus: { fontSize: 11, fontWeight: "600", color: SKY },

  // Premium card
  premiumCard: { backgroundColor: "rgba(124,58,237,0.08)", borderRadius: 20, padding: 20, alignItems: "center", gap: 10, borderWidth: 1, borderColor: "rgba(124,58,237,0.2)" },
  premiumStar: { fontSize: 32 },
  premiumTitle: { fontSize: 18, fontWeight: "800", color: PURPLE, letterSpacing: -0.4 },
  premiumSub: { fontSize: 13, color: MUTED, textAlign: "center", marginBottom: 4 },
  premiumBtn: { backgroundColor: PURPLE, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, shadowColor: PURPLE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  premiumBtnTxt: { fontSize: 14, fontWeight: "700", color: WHITE },
});
