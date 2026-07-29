/**
 * settings.tsx — Settings Screen with multiple sections
 * Follows the master implementation prompt exactly
 */
import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { 
  ArrowLeft,
  User,
  Target,
  CreditCard,
  Watch,
  Palette,
  Globe,
  Ruler,
  Bell,
  Heart,
  Shield,
  FileText,
  Download,
  Trash2,
  Lock,
  HelpCircle,
  MessageCircle,
  ThumbsUp,
  Star,
  Info,
  LogOut,
  ChevronRight,
} from "@/components/icons";

const SKY      = "#55CDFC";
const CHARCOAL = "#1A1D20";
const MUTED    = "#94A3B8";
const WHITE    = "#FFFFFF";
const BG       = "#F8FAFC";
const RED      = "#EF4444";

const CARD_SHADOW = {
  shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07, shadowRadius: 16, elevation: 6,
} as const;

// ─── Settings Row ─────────────────────────────────────────────────────────────
function SettingsRow({ 
  icon: Icon, 
  label, 
  value, 
  onPress, 
  color = CHARCOAL,
}: { 
  icon: any; 
  label: string; 
  value?: string; 
  onPress: () => void; 
  color?: string;
}) {
  return (
    <TouchableOpacity style={sr.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[sr.iconBox, { backgroundColor: `${color}15` }]}>
        <Icon size={18} color={color} strokeWidth={2} />
      </View>
      <Text style={[sr.label, color === RED && { color: RED }]}>{label}</Text>
      {value && <Text style={sr.value}>{value}</Text>}
      <ChevronRight size={16} color={MUTED} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const sr = StyleSheet.create({
  row:     { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  iconBox: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  label:   { flex: 1, fontSize: 15, fontWeight: "600", color: CHARCOAL },
  value:   { fontSize: 13, fontWeight: "500", color: MUTED },
});

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return <Text style={sh.title}>{title}</Text>;
}

const sh = StyleSheet.create({
  title: { fontSize: 12, fontWeight: "700", color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, marginTop: 20 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Logout", 
          style: "destructive",
          onPress: () => {
            // TODO: Clear auth tokens, navigate to login
            Alert.alert("Logged out", "You have been logged out successfully.");
          }
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
          <ArrowLeft size={20} color={CHARCOAL} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        
        {/* ── ACCOUNT ─────────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <SectionHeader title="Account" />
          <SettingsRow 
            icon={User} 
            label="Edit Profile" 
            onPress={() => router.back()} 
            color={SKY}
          />
          <SettingsRow 
            icon={Target} 
            label="Goals & Targets" 
            onPress={() => Alert.alert("Goals & Targets", "Navigate to goals editor")} 
            color={SKY}
          />
          <SettingsRow 
            icon={CreditCard} 
            label="Subscription" 
            value="Free Plan" 
            onPress={() => Alert.alert("Subscription", "Manage your subscription")} 
            color="#7C3AED"
          />
          <SettingsRow 
            icon={Watch} 
            label="Connected Devices" 
            onPress={() => Alert.alert("Connected Devices", "Manage your connected devices")} 
            color={CHARCOAL}
          />
        </View>

        {/* ── PREFERENCES ─────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <SectionHeader title="Preferences" />
          <SettingsRow 
            icon={Palette} 
            label="Appearance" 
            value="Light" 
            onPress={() => Alert.alert("Appearance", "Choose theme: Light / Dark / Auto")} 
            color="#F97316"
          />
          <SettingsRow 
            icon={Globe} 
            label="Language" 
            value="English" 
            onPress={() => Alert.alert("Language", "Choose your language")} 
            color="#0EA5E9"
          />
          <SettingsRow 
            icon={Ruler} 
            label="Units" 
            value="Metric" 
            onPress={() => Alert.alert("Units", "Choose: Metric / Imperial")} 
            color="#22C55E"
          />
          <SettingsRow 
            icon={Bell} 
            label="Notifications" 
            onPress={() => Alert.alert("Notifications", "Manage notification preferences")} 
            color="#EAB308"
          />
        </View>

        {/* ── HEALTH ──────────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <SectionHeader title="Health" />
          <SettingsRow 
            icon={Heart} 
            label="Google Fit" 
            value="Not connected" 
            onPress={() => Alert.alert("Google Fit", "Connect to Google Fit")} 
            color="#DB4437"
          />
          <SettingsRow 
            icon={Heart} 
            label="Apple Health" 
            value="Not connected" 
            onPress={() => Alert.alert("Apple Health", "Connect to Apple Health")} 
            color="#000000"
          />
          <SettingsRow 
            icon={Heart} 
            label="Health Connect" 
            value="Not connected" 
            onPress={() => Alert.alert("Health Connect", "Connect to Health Connect")} 
            color="#4285F4"
          />
          <SettingsRow 
            icon={Activity} 
            label="Sync Status" 
            value="Last synced: Never" 
            onPress={() => Alert.alert("Sync Status", "View sync history")} 
            color={MUTED}
          />
        </View>

        {/* ── PRIVACY ─────────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <SectionHeader title="Privacy" />
          <SettingsRow 
            icon={Shield} 
            label="Privacy Policy" 
            onPress={() => Alert.alert("Privacy Policy", "View privacy policy")} 
            color={SKY}
          />
          <SettingsRow 
            icon={FileText} 
            label="Terms of Service" 
            onPress={() => Alert.alert("Terms", "View terms of service")} 
            color={SKY}
          />
          <SettingsRow 
            icon={Download} 
            label="Export Data" 
            onPress={() => Alert.alert("Export Data", "Download your data")} 
            color="#22C55E"
          />
          <SettingsRow 
            icon={Trash2} 
            label="Delete Account" 
            onPress={() => Alert.alert("Delete Account", "This action cannot be undone.", [{ text: "Cancel" }])} 
            color={RED}
          />
          <SettingsRow 
            icon={Lock} 
            label="Biometric Lock" 
            value="Disabled" 
            onPress={() => Alert.alert("Biometric Lock", "Enable fingerprint/face unlock")} 
            color="#7C3AED"
          />
        </View>

        {/* ── SUPPORT ─────────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <SectionHeader title="Support" />
          <SettingsRow 
            icon={HelpCircle} 
            label="Help Center" 
            onPress={() => Alert.alert("Help Center", "View FAQs and guides")} 
            color={SKY}
          />
          <SettingsRow 
            icon={MessageCircle} 
            label="Contact Support" 
            onPress={() => Alert.alert("Contact Support", "Email: support@swasth.app")} 
            color="#0EA5E9"
          />
          <SettingsRow 
            icon={ThumbsUp} 
            label="Feedback" 
            onPress={() => Alert.alert("Feedback", "Send us your feedback")} 
            color="#22C55E"
          />
          <SettingsRow 
            icon={Star} 
            label="Rate App" 
            onPress={() => Alert.alert("Rate App", "Rate us on the App Store / Play Store")} 
            color="#F59E0B"
          />
        </View>

        {/* ── ABOUT ───────────────────────────────────────────────── */}
        <View style={[styles.card, CARD_SHADOW]}>
          <SectionHeader title="About" />
          <SettingsRow 
            icon={Info} 
            label="App Version" 
            value="1.0.0" 
            onPress={() => Alert.alert("App Version", "Version 1.0.0 (Build 1)")} 
            color={MUTED}
          />
          <SettingsRow 
            icon={FileText} 
            label="Open Source Licenses" 
            onPress={() => Alert.alert("Licenses", "View open source licenses")} 
            color={MUTED}
          />
        </View>

        {/* ── LOGOUT ──────────────────────────────────────────────── */}
        <TouchableOpacity style={[styles.logoutBtn, CARD_SHADOW]} onPress={handleLogout} activeOpacity={0.8}>
          <LogOut size={20} color={RED} strokeWidth={2} />
          <Text style={styles.logoutTxt}>Logout</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, gap: 0 },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: CHARCOAL, letterSpacing: -0.4 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: WHITE, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center", ...CARD_SHADOW },
  spacer: { width: 38, height: 38 },

  // Card
  card: { backgroundColor: WHITE, borderRadius: 20, padding: 18, marginBottom: 0 },

  // Logout button
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: WHITE, borderWidth: 2, borderColor: RED, borderRadius: 16, paddingVertical: 14, marginTop: 24 },
  logoutTxt: { fontSize: 16, fontWeight: "700", color: RED },
});
