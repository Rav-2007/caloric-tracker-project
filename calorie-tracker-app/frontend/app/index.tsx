import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Camera, ChefHat, Zap } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { Colors, alpha } from "@/constants/colors";

// ─── Macro Pill ─────────────────────────────────────────────────────────────
interface MacroPillProps {
  label: string;
  detail: string;
  color: string;
}

function MacroPill({ label, detail, color }: MacroPillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: alpha(color, 18), borderColor: alpha(color, 55) }]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <View style={styles.pillText}>
        <Text style={[styles.pillLabel, { color }]}>{label}</Text>
        <Text style={styles.pillDetail}>{detail}</Text>
      </View>
    </View>
  );
}

// ─── How-It-Works Step ──────────────────────────────────────────────────────
function Step({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepN}>{n}</Text>
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.iconRing}>
            <View style={styles.iconCore}>
              <ChefHat size={36} color={Colors.emerald} strokeWidth={1.75} />
            </View>
          </View>

          <Text style={styles.title}>Indian Calorie{"\n"}Tracker</Text>
          <Text style={styles.subtitle}>
            Point your camera at any Indian dish. Get instant portion weights and macro breakdowns powered by Gemini Vision.
          </Text>
        </View>

        {/* ── Macro Indicators ── */}
        <View style={styles.macroRow}>
          <MacroPill label="Protein"  detail="Grams tracked" color={Colors.protein} />
          <MacroPill label="Carbs"    detail="Fuel mapped"   color={Colors.carbs}   />
          <MacroPill label="Fat"      detail="Intake logged" color={Colors.fat}      />
        </View>

        {/* ── How It Works ── */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>How it works</Text>
          <Step n="1" label="Photograph your plate — thali, bowl, or snack" />
          <View style={styles.stepDivider} />
          <Step n="2" label="Gemini Vision identifies every dish and estimates grams" />
          <View style={styles.stepDivider} />
          <Step n="3" label="See a full macro breakdown — protein, carbs, and fat" />
        </View>

        {/* ── CTA ── */}
        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push("/camera")}
          activeOpacity={0.82}
        >
          <Camera size={20} color={Colors.white} strokeWidth={2} />
          <Text style={styles.ctaText}>Scan Your Meal</Text>
        </TouchableOpacity>

        {/* ── Footer ── */}
        <View style={styles.poweredBy}>
          <Zap size={11} color={Colors.teal} />
          <Text style={styles.poweredByText}>Powered by Gemini 2.5 Flash Vision</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.slate50 },

  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 48,
    gap: 28,
  },

  // Hero
  hero: { alignItems: "center", gap: 14 },
  iconRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: alpha(Colors.mint, 28),
    borderWidth: 1.5,
    borderColor: alpha(Colors.mint, 70),
    alignItems: "center",
    justifyContent: "center",
  },
  iconCore: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: alpha(Colors.emerald, 22),
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: Colors.slate900,
    textAlign: "center",
    lineHeight: 42,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: Colors.slate600,
    textAlign: "center",
    maxWidth: 300,
  },

  // Macros
  macroRow: { flexDirection: "row", gap: 10, width: "100%" },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  pillText: { flexShrink: 1 },
  pillLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  pillDetail: { fontSize: 10, color: Colors.slate400, marginTop: 2 },

  // Steps card
  stepsCard: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.zinc,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 4,
    shadowColor: Colors.slate900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.slate400,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: alpha(Colors.emerald, 22),
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepN: { fontSize: 12, fontWeight: "800", color: Colors.emerald },
  stepLabel: { fontSize: 13.5, color: Colors.slate900, flex: 1, lineHeight: 20 },
  stepDivider: {
    height: 1,
    backgroundColor: Colors.zinc,
    marginLeft: 38,
  },

  // CTA
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    paddingVertical: 17,
    borderRadius: 16,
    backgroundColor: Colors.emerald,
    shadowColor: Colors.emerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 14,
    elevation: 10,
  },
  ctaText: {
    color: Colors.white,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  // Footer
  poweredBy: { flexDirection: "row", alignItems: "center", gap: 5 },
  poweredByText: { fontSize: 12, color: Colors.teal, fontWeight: "500" },
});
