/**
 * profile.tsx — User profile & goals editor
 * Saves to /api/v1/profile (PUT) and reads from /api/v1/profile (GET)
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, CheckCircle, User } from "@/components/icons";
import { apiFetch, readErrorDetail } from "@/constants/api";
import type { UserProfile, UserProfileUpdate } from "@/types/api";

const SKY      = "#55CDFC";
const CHARCOAL = "#1A1D20";
const MUTED    = "#94A3B8";
const WHITE    = "#FFFFFF";
const BG       = "#F8FAFC";

const CARD_SHADOW = {
  shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07, shadowRadius: 16, elevation: 6,
} as const;

// ─── Field row ────────────────────────────────────────────────────────────────
function Field({
  label, value, onChangeText, placeholder, keyboardType, unit, hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  unit?: string;
  hint?: string;
}) {
  return (
    <View style={f.wrap}>
      <Text style={f.label}>{label}</Text>
      {hint && <Text style={f.hint}>{hint}</Text>}
      <View style={f.row}>
        <TextInput
          style={f.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? "—"}
          placeholderTextColor={MUTED}
          keyboardType={keyboardType ?? "default"}
          returnKeyType="done"
        />
        {unit && <Text style={f.unit}>{unit}</Text>}
      </View>
    </View>
  );
}
const f = StyleSheet.create({
  wrap:  { gap: 4 },
  label: { fontSize: 11, fontWeight: "700", color: MUTED, letterSpacing: 0.6, textTransform: "uppercase" },
  hint:  { fontSize: 11, color: MUTED },
  row:   { flexDirection: "row", alignItems: "center", backgroundColor: WHITE, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", paddingHorizontal: 14, height: 48 },
  input: { flex: 1, fontSize: 15, fontWeight: "600", color: CHARCOAL },
  unit:  { fontSize: 13, fontWeight: "600", color: MUTED, marginLeft: 8 },
});

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return <Text style={sh.title}>{title}</Text>;
}
const sh = StyleSheet.create({
  title: { fontSize: 13, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.2, marginBottom: 4, marginTop: 8 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // Form state — all strings for TextInput compatibility
  const [name,           setName]           = useState("");
  const [age,            setAge]            = useState("");
  const [weightKg,       setWeightKg]       = useState("");
  const [heightCm,       setHeightCm]       = useState("");
  const [calorieTarget,  setCalorieTarget]  = useState("2000");
  const [proteinTarget,  setProteinTarget]  = useState("120");
  const [carbsTarget,    setCarbsTarget]    = useState("250");
  const [fatTarget,      setFatTarget]      = useState("65");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/v1/profile");
        if (res.ok) {
          const p: UserProfile = await res.json();
          setName(p.name ?? "");
          setAge(p.age != null ? String(p.age) : "");
          setWeightKg(p.weight_kg != null ? String(p.weight_kg) : "");
          setHeightCm(p.height_cm != null ? String(p.height_cm) : "");
          setCalorieTarget(String(p.calorie_target));
          setProteinTarget(String(p.protein_target_g));
          setCarbsTarget(String(p.carbs_target_g));
          setFatTarget(String(p.fat_target_g));
        }
      } catch (err) {
        // Offline — use defaults, log the error
        console.log("[ProfileScreen] Failed to fetch profile:", err instanceof Error ? err.message : String(err));
      }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert("Name required", "Please enter your name."); return; }
    
    // Validate numeric inputs
    const calTarget = parseInt(calorieTarget, 10);
    const protTarget = parseInt(proteinTarget, 10);
    const carbTarget = parseInt(carbsTarget, 10);
    const fatTargetVal = parseInt(fatTarget, 10);
    
    if (isNaN(calTarget) || calTarget < 500 || calTarget > 10000) {
      Alert.alert("Invalid Calorie Target", "Please enter a calorie target between 500 and 10,000 kcal.");
      return;
    }
    if (isNaN(protTarget) || protTarget < 0 || protTarget > 500) {
      Alert.alert("Invalid Protein Target", "Please enter a protein target between 0 and 500 g.");
      return;
    }
    if (isNaN(carbTarget) || carbTarget < 0 || carbTarget > 1000) {
      Alert.alert("Invalid Carbs Target", "Please enter a carbs target between 0 and 1,000 g.");
      return;
    }
    if (isNaN(fatTargetVal) || fatTargetVal < 0 || fatTargetVal > 300) {
      Alert.alert("Invalid Fat Target", "Please enter a fat target between 0 and 300 g.");
      return;
    }
    
    setSaving(true);
    try {
      const payload: UserProfileUpdate = {
        name:             name.trim(),
        age:              age            ? parseInt(age, 10)          : null,
        weight_kg:        weightKg       ? parseFloat(weightKg)       : null,
        height_cm:        heightCm       ? parseFloat(heightCm)       : null,
        calorie_target:   calorieTarget  ? parseInt(calorieTarget, 10)  : 2000,
        protein_target_g: proteinTarget  ? parseInt(proteinTarget, 10)  : 120,
        carbs_target_g:   carbsTarget    ? parseInt(carbsTarget, 10)    : 250,
        fat_target_g:     fatTarget      ? parseInt(fatTarget, 10)      : 65,
      };

      const res = await apiFetch("/api/v1/profile", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await readErrorDetail(res, "Failed to save profile.");
        Alert.alert("Error", detail);
        return;
      }

      Alert.alert("Saved ✅", "Your profile has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      console.log("[ProfileScreen] Failed to save profile:", err instanceof Error ? err.message : String(err));
      Alert.alert("Error", "Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  // Auto-calculate calorie target from stats (Mifflin-St Jeor, sedentary × 1.55)
  const autoCalculate = () => {
    const w = parseFloat(weightKg);
    const h = parseFloat(heightCm);
    const a = parseInt(age, 10);
    
    // Input validation
    if (!w || !h || !a) {
      Alert.alert("Missing Information", "Fill in weight, height, and age first to auto-calculate.");
      return;
    }
    
    // Validate reasonable ranges
    if (w < 20 || w > 500) {
      Alert.alert("Invalid Weight", "Please enter a weight between 20 and 500 kg.");
      return;
    }
    if (h < 50 || h > 300) {
      Alert.alert("Invalid Height", "Please enter a height between 50 and 300 cm.");
      return;
    }
    if (a < 1 || a > 150) {
      Alert.alert("Invalid Age", "Please enter an age between 1 and 150 years.");
      return;
    }
    
    // Mifflin-St Jeor (male baseline — user can adjust)
    const bmr   = 10 * w + 6.25 * h - 5 * a + 5;
    const tdee  = Math.round(bmr * 1.55);
    const prot  = Math.round(w * 2);     // 2g per kg
    const fat_g = Math.round(tdee * 0.25 / 9);
    const carbs = Math.round((tdee - prot * 4 - fat_g * 9) / 4);
    setCalorieTarget(String(tdee));
    setProteinTarget(String(prot));
    setFatTarget(String(fat_g));
    setCarbsTarget(String(Math.max(carbs, 0)));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BG }}>
        <ActivityIndicator color={SKY} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <ArrowLeft size={20} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Profile & Goals</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar placeholder */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <User size={32} color={WHITE} strokeWidth={1.5} />
          </View>
          <Text style={styles.avatarHint}>Tap Edit to update your photo (coming soon)</Text>
        </View>

        {/* Personal info */}
        <View style={[styles.card, CARD_SHADOW]}>
          <SectionHeader title="Personal Info" />
          <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
          <Field label="Age" value={age} onChangeText={setAge} placeholder="e.g. 25" keyboardType="numeric" unit="yrs" />
          <Field label="Weight" value={weightKg} onChangeText={setWeightKg} placeholder="e.g. 72" keyboardType="decimal-pad" unit="kg" />
          <Field label="Height" value={heightCm} onChangeText={setHeightCm} placeholder="e.g. 175" keyboardType="decimal-pad" unit="cm" />
        </View>

        {/* Goals */}
        <View style={[styles.card, CARD_SHADOW]}>
          <View style={styles.goalHeader}>
            <SectionHeader title="Daily Goals" />
            <TouchableOpacity style={styles.autoBtn} onPress={autoCalculate} activeOpacity={0.75}>
              <Text style={styles.autoBtnTxt}>Auto-calculate ✨</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.autoHint}>
            Fill in weight, height & age above then tap Auto-calculate to set goals based on your stats.
          </Text>
          <Field label="Calorie Target" value={calorieTarget} onChangeText={setCalorieTarget} keyboardType="numeric" unit="kcal" />
          <Field label="Protein Target" value={proteinTarget} onChangeText={setProteinTarget} keyboardType="numeric" unit="g" hint="Recommended: 1.6–2g per kg body weight" />
          <Field label="Carbs Target"   value={carbsTarget}   onChangeText={setCarbsTarget}   keyboardType="numeric" unit="g" />
          <Field label="Fat Target"     value={fatTarget}     onChangeText={setFatTarget}     keyboardType="numeric" unit="g" />
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.82}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <>
              <CheckCircle size={18} color={WHITE} strokeWidth={2} />
              <Text style={styles.saveBtnTxt}>Save Profile</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  backBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(85,205,252,0.10)", alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 17, fontWeight: "700", color: CHARCOAL, letterSpacing: -0.3 },

  scroll: { padding: 20, gap: 16 },

  avatarSection: { alignItems: "center", gap: 10, paddingVertical: 8 },
  avatarCircle:  { width: 80, height: 80, borderRadius: 40, backgroundColor: SKY, alignItems: "center", justifyContent: "center" },
  avatarHint:    { fontSize: 11, color: MUTED, fontStyle: "italic" },

  card:       { backgroundColor: WHITE, borderRadius: 20, padding: 18, gap: 14 },
  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  autoBtn:    { backgroundColor: "#EFF6FF", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  autoBtnTxt: { fontSize: 11, fontWeight: "700", color: SKY },
  autoHint:   { fontSize: 11, color: MUTED, lineHeight: 16, marginTop: -8 },

  saveBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: SKY, paddingVertical: 16, borderRadius: 16, shadowColor: SKY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.38, shadowRadius: 12, elevation: 8 },
  saveBtnTxt: { color: WHITE, fontSize: 16, fontWeight: "700" },
});
