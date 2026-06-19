/**
 * camera.tsx — Full pipeline: capture → compress → upload → results
 *
 * Sections (in order):
 *  1. Imports
 *  2. Config & constants
 *  3. Domain types
 *  4. Pure helpers
 *  5. Atomic sub-components: ThaliGuideRing, ScannerLine, PermissionGate
 *  6. Pipeline sub-components: LoadingOverlay, NetworkErrorCard
 *  7. Results sub-components: MacroBar, FoodItemCard, ResultsDashboard
 *  8. Main CameraScreen
 *  9. StyleSheet (one block, no inline objects in JSX)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import Svg, { Circle } from "react-native-svg";
import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  Flame,
  FlipHorizontal,
  RefreshCw,
  ShieldAlert,
  X,
  Zap,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Colors, alpha } from "@/constants/colors";

// ─── 2. Config ───────────────────────────────────────────────────────────────
const API_URL = "http://10.82.194.56:8000";
const NETWORK_TIMEOUT_MS = 70_000;

// Guide ring geometry
const GUIDE_DIAMETER   = 264;
const GUIDE_RADIUS_SVG = 128;  // SVG circle r value
const GUIDE_CENTER     = GUIDE_DIAMETER / 2;
const GUIDE_STROKE     = 2.5;
// Inner clipping area (scanner bar is clipped to this circle)
const CLIP_DIAMETER    = GUIDE_DIAMETER - 14;
const CLIP_RADIUS      = CLIP_DIAMETER / 2;

// Monospaced font for clinical loading text
const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";

const LOADING_MESSAGES = [
  "Consulting ICMR-NIN database...",
  "Analyzing density & oil pools...",
  "Mapping plate geometry...",
  "Cross-referencing portion weights...",
  "Computing macro profiles...",
] as const;

// ─── 3. Domain Types ─────────────────────────────────────────────────────────

type NutritionSource = "icmr_nin" | "estimated";

interface FoodItem {
  item_name: string;
  estimated_grams: number;
  visual_confidence: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrition_source: NutritionSource;
}

interface FoodAnalysisResult {
  food_items: FoodItem[];
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
}

// ─── 4. Pure Helpers ─────────────────────────────────────────────────────────

function avgConfidence(items: FoodItem[]): number {
  if (!items.length) return 0;
  return items.reduce((s, i) => s + i.visual_confidence, 0) / items.length;
}

function confidenceMeta(conf: number): { label: string; color: string } {
  const pct = Math.round(conf * 100);
  if (pct >= 90) return { label: `${pct}% match`, color: Colors.emerald };
  if (pct >= 70) return { label: `${pct}% match`, color: Colors.fat };
  return        { label: `${pct}% match`, color: Colors.protein };
}

// ─── 5. Atomic Sub-components ────────────────────────────────────────────────

/** Pulsing dashed emerald ring — framing guide for plate capture */
function ThaliGuideRing({ pulseScale, pulseOpacity }: {
  pulseScale: Animated.AnimatedInterpolation<number>;
  pulseOpacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <Animated.View
      style={[
        styles.guideRingWrap,
        { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
      ]}
      pointerEvents="none"
    >
      <Svg
        width={GUIDE_DIAMETER}
        height={GUIDE_DIAMETER}
        viewBox={`0 0 ${GUIDE_DIAMETER} ${GUIDE_DIAMETER}`}
      >
        {/* Dim track */}
        <Circle
          cx={GUIDE_CENTER}
          cy={GUIDE_CENTER}
          r={GUIDE_RADIUS_SVG}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={GUIDE_STROKE}
          fill="none"
        />
        {/* Dashed emerald guide */}
        <Circle
          cx={GUIDE_CENTER}
          cy={GUIDE_CENTER}
          r={GUIDE_RADIUS_SVG}
          stroke="rgba(16,185,129,0.82)"
          strokeWidth={GUIDE_STROKE}
          fill="none"
          strokeDasharray="14 9"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

/** Animated horizontal bar that sweeps top→bottom while isAnalyzing */
function ScannerLine({ active }: { active: boolean }) {
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) { scanAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2_000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(80),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scanAnim]);

  const translateY = scanAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [-CLIP_RADIUS, CLIP_RADIUS],
  });

  if (!active) return null;

  return (
    // Clipping container — scanner bar is invisible outside the ring
    <View style={styles.scannerClip} pointerEvents="none">
      <Animated.View
        style={[styles.scannerBar, { transform: [{ translateY }] }]}
      />
    </View>
  );
}

function PermissionGate({ onRequest }: { onRequest: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.permRoot}>
      <StatusBar style="light" />
      <ShieldAlert size={48} color={Colors.emerald} strokeWidth={1.5} />
      <Text style={styles.permTitle}>Camera access needed</Text>
      <Text style={styles.permBody}>
        We need your camera to photograph your meal. No images are stored on device.
      </Text>
      <TouchableOpacity style={styles.permBtn} onPress={onRequest} activeOpacity={0.82}>
        <Text style={styles.permBtnText}>Grant Permission</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()} style={styles.permBack}>
        <Text style={styles.permBackText}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 6. Pipeline Sub-components ──────────────────────────────────────────────

function LoadingOverlay({ msgIndex }: { msgIndex: number }) {
  const activeIdx = msgIndex % LOADING_MESSAGES.length;

  // Fade the text on each message change
  const fadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [activeIdx, fadeAnim]);

  return (
    <View style={styles.loadingRoot}>
      <View style={styles.loadingCard}>
        {/* Glowing indicator ring */}
        <View style={styles.glowRing}>
          <ActivityIndicator size="large" color={Colors.mint} />
        </View>

        {/* Status label */}
        <Text style={styles.loadingStatus}>GEMINI VISION · ACTIVE</Text>

        {/* Monospaced cycling message */}
        <Animated.Text style={[styles.loadingMsg, { opacity: fadeAnim }]}>
          {LOADING_MESSAGES[activeIdx]}
        </Animated.Text>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {LOADING_MESSAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIdx ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        {/* Powered-by footer */}
        <View style={styles.poweredByRow}>
          <Zap size={11} color={Colors.teal} />
          <Text style={styles.poweredByText}>Gemini 2.5 Flash Vision</Text>
        </View>
      </View>
    </View>
  );
}

function NetworkErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorCard}>
      <AlertTriangle size={28} color={Colors.protein} strokeWidth={1.75} />
      <Text style={styles.errorTitle}>Analysis failed</Text>
      <Text style={styles.errorBody}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.82}>
        <RefreshCw size={14} color={Colors.white} />
        <Text style={styles.retryBtnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 7. Results Sub-components ───────────────────────────────────────────────

interface MacroBarProps {
  label: string;
  grams: number;
  proportion: number;
  color: string;
}

function MacroBar({ label, grams, proportion, color }: MacroBarProps) {
  const filled   = Math.max(proportion, 0.03);
  const unfilled = Math.max(1 - filled, 0);
  return (
    <View style={styles.macroRow}>
      <View style={styles.macroLabelCol}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={styles.macroLabel}>{label}</Text>
      </View>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { flex: filled, backgroundColor: color }]} />
        <View style={{ flex: unfilled }} />
      </View>
      <Text style={[styles.macroValue, { color }]}>{grams}g</Text>
    </View>
  );
}

function FoodItemCard({ item, index }: { item: FoodItem; index: number }) {
  const { label, color } = confidenceMeta(item.visual_confidence);
  const isVerified       = item.nutrition_source === "icmr_nin";
  return (
    <View style={[styles.foodCard, index === 0 && { borderTopWidth: 0 }]}>
      <View style={styles.foodIndex}>
        <Text style={styles.foodIndexText}>{index + 1}</Text>
      </View>
      <View style={styles.foodBody}>
        <Text style={styles.foodName} numberOfLines={1}>{item.item_name}</Text>
        <View style={styles.foodMeta}>
          <Text style={styles.foodGrams}>{item.estimated_grams} g</Text>
          <Text style={styles.foodDot}>·</Text>
          <Text style={styles.foodKcal}>{item.calories} kcal</Text>
          <Text style={styles.foodDot}>·</Text>
          <Text style={[styles.foodSource, { color: isVerified ? Colors.emerald : Colors.slate400 }]}>
            {isVerified ? "ICMR-NIN" : "est."}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.badge,
          { backgroundColor: alpha(color, 22), borderColor: alpha(color, 65) },
        ]}
      >
        <CheckCircle2 size={11} color={color} strokeWidth={2.5} />
        <Text style={[styles.badgeText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

interface ResultsDashboardProps {
  photoUri: string;
  result: FoodAnalysisResult;
  onRetake: () => void;
}

function ResultsDashboard({ photoUri, result, onRetake }: ResultsDashboardProps) {
  const router    = useRouter();
  const maxMacroG = Math.max(result.total_protein_g, result.total_carbs_g, result.total_fat_g, 1);
  const avgConf   = Math.round(avgConfidence(result.food_items) * 100);
  const icmrCount = result.food_items.filter((i) => i.nutrition_source === "icmr_nin").length;

  return (
    <SafeAreaView style={styles.dashRoot} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.dashScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo + Summary Header */}
        <View style={styles.dashHeader}>
          <Image source={{ uri: photoUri }} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.dashHeaderText}>
            <Text style={styles.dashTitle}>Analysis Complete</Text>
            <Text style={styles.dashSubtitle}>
              {result.food_items.length} item{result.food_items.length !== 1 ? "s" : ""} identified
            </Text>
            <View style={styles.avgRow}>
              <CheckCircle2 size={12} color={Colors.emerald} strokeWidth={2.5} />
              <Text style={styles.avgText}>
                {avgConf}% avg · {icmrCount}/{result.food_items.length} ICMR-NIN
              </Text>
            </View>
          </View>
        </View>

        {/* Total Calories */}
        <View style={styles.caloriesCard}>
          <View style={styles.caloriesIconWrap}>
            <Flame size={24} color={Colors.emerald} strokeWidth={1.75} />
          </View>
          <View>
            <Text style={styles.caloriesLabel}>TOTAL CALORIES</Text>
            <Text style={styles.caloriesValue}>{result.total_calories.toLocaleString()}</Text>
            <Text style={styles.caloriesUnit}>kcal · {icmrCount > 0 ? "ICMR-NIN" : "estimated"}</Text>
          </View>
        </View>

        {/* Macronutrients */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MACRONUTRIENTS</Text>
          <MacroBar label="Protein" grams={result.total_protein_g} proportion={result.total_protein_g / maxMacroG} color={Colors.protein} />
          <MacroBar label="Carbs"   grams={result.total_carbs_g}   proportion={result.total_carbs_g / maxMacroG}   color={Colors.carbs} />
          <MacroBar label="Fat"     grams={result.total_fat_g}     proportion={result.total_fat_g / maxMacroG}     color={Colors.fat} />
          <Text style={styles.disclaimer}>
            * Values sourced from ICMR-NIN "Nutritive Value of Indian Foods" (2017).
            {icmrCount < result.food_items.length
              ? ` ${result.food_items.length - icmrCount} item(s) use fallback estimates.`
              : " All items matched to ICMR-NIN table."}
          </Text>
        </View>

        {/* Identified Foods */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>IDENTIFIED FOODS</Text>
          {result.food_items.map((item, i) => (
            <FoodItemCard key={`${item.item_name}-${i}`} item={item} index={i} />
          ))}
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() =>
            router.push({
              pathname: "/review",
              params: { data: JSON.stringify(result), photoUri },
            })
          }
          activeOpacity={0.82}
        >
          <BookmarkPlus size={18} color={Colors.white} strokeWidth={2} />
          <Text style={styles.primaryBtnText}>Adjust & Log Meal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.outlineBtn} onPress={onRetake} activeOpacity={0.75}>
          <RefreshCw size={16} color={Colors.emerald} strokeWidth={2} />
          <Text style={styles.outlineBtnText}>Retake Scan</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 8. Main Screen ───────────────────────────────────────────────────────────
export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing]           = useState<CameraType>("back");
  const [isCapturing, setIsCapturing] = useState(false);

  const [photoUri, setPhotoUri]             = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing]       = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx]   = useState(0);
  const [analysisResult, setAnalysisResult] = useState<FoodAnalysisResult | null>(null);
  const [networkError, setNetworkError]     = useState<string | null>(null);

  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);
  const router    = useRouter();

  // ── Breathing pulse animation for the guide ring ─────────────────────────
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 2_200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 2_200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const pulseScale   = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.024] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  // ── Loading message cycle ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAnalyzing) return;
    setLoadingMsgIdx(0);
    const id = setInterval(
      () => setLoadingMsgIdx((prev) => (prev + 1) % LOADING_MESSAGES.length),
      2_200,
    );
    return () => clearInterval(id);
  }, [isAnalyzing]);

  const resetState = useCallback(() => {
    setPhotoUri(null);
    setAnalysisResult(null);
    setNetworkError(null);
    setIsAnalyzing(false);
    setLoadingMsgIdx(0);
  }, []);

  const sendToBackend = useCallback(async (uri: string) => {
    setNetworkError(null);
    setIsAnalyzing(true);

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append("file", { uri, name: "meal.jpg", type: "image/jpeg" } as unknown as Blob);

      const response = await fetch(`${API_URL}/api/v1/analyze-food`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        let detail = `Analysis failed (HTTP ${response.status})`;
        try {
          const errBody = await response.json();
          if (errBody?.detail) detail = String(errBody.detail);
        } catch { /* non-JSON body */ }
        throw new Error(detail);
      }

      const data: FoodAnalysisResult = await response.json();
      setAnalysisResult(data);
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      setNetworkError(
        isAbort
          ? `Request timed out after ${NETWORK_TIMEOUT_MS / 1_000} s. Ensure the backend is running and your device is on the same WiFi subnet.`
          : err instanceof Error
          ? err.message
          : `Cannot reach ${API_URL}. Verify the backend is running on port 8000.`,
      );
    } finally {
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  }, []);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo) return;
      const ctx        = ImageManipulator.manipulate(photo.uri);
      ctx.resize({ width: 1024 });
      const frame      = await ctx.renderAsync();
      const compressed = await frame.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
      setPhotoUri(compressed.uri);
      await sendToBackend(compressed.uri);
    } catch (err: unknown) {
      Alert.alert(
        "Capture failed",
        err instanceof Error ? err.message : "Could not capture or process the image. Please try again.",
      );
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, sendToBackend]);

  // ── Guards ───────────────────────────────────────────────────────────────
  if (!permission)         return <View style={styles.blank} />;
  if (!permission.granted) return <PermissionGate onRequest={requestPermission} />;

  if (analysisResult && photoUri) {
    return <ResultsDashboard photoUri={photoUri} result={analysisResult} onRetake={resetState} />;
  }

  // ── Camera View ──────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />

      {/* Vignette */}
      <View style={[styles.vignette, { pointerEvents: "none" }]} />

      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <X size={20} color={Colors.white} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        {/* Viewfinder / guide ring */}
        <View style={styles.finderWrapper}>
          {networkError ? (
            <NetworkErrorCard
              message={networkError}
              onRetry={() => photoUri && sendToBackend(photoUri)}
            />
          ) : (
            <>
              {/* Stacking container — ring SVG + scanner clip sit on top of each other */}
              <View style={styles.guideOuter}>
                {/* Scanner line — clipped to circle shape */}
                <ScannerLine active={isAnalyzing} />

                {/* Pulsing dashed ring (above scanner) */}
                <ThaliGuideRing pulseScale={pulseScale} pulseOpacity={pulseOpacity} />
              </View>

              <Text style={styles.finderHint}>
                {isAnalyzing ? "Analyzing your thali..." : "Place your Thali inside the ring"}
              </Text>
            </>
          )}
        </View>

        {/* Bottom controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            activeOpacity={0.75}
          >
            <FlipHorizontal size={22} color={Colors.white} strokeWidth={1.75} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.captureBtn, isCapturing && styles.captureBtnBusy]}
            onPress={takePicture}
            activeOpacity={0.88}
            disabled={isCapturing}
          >
            <View style={styles.captureInner} />
          </TouchableOpacity>

          <View style={styles.controlBtn} />
        </View>
      </SafeAreaView>

      {/* Frosted-glass loading overlay */}
      {isAnalyzing && <LoadingOverlay msgIndex={loadingMsgIdx} />}
    </View>
  );
}

// ─── 9. StyleSheet ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: Colors.slate900 },

  // Camera screen shell
  root:    { flex: 1, backgroundColor: Colors.slate900 },
  vignette: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(Colors.slate900, 60) },
  overlay:  { flex: 1, justifyContent: "space-between" },

  // Top bar
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: alpha(Colors.slate800, 180),
    alignItems: "center", justifyContent: "center",
  },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: alpha(Colors.slate800, 180),
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: alpha(Colors.emerald, 70),
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.emerald },
  liveText: { color: Colors.mint, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },

  // Viewfinder
  finderWrapper: { alignItems: "center", gap: 18 },

  // Guide ring stacking container
  guideOuter: {
    width: GUIDE_DIAMETER,
    height: GUIDE_DIAMETER,
    alignItems: "center",
    justifyContent: "center",
  },

  // Dashed ring SVG wrapper (pulse-animated)
  guideRingWrap: {
    position: "absolute",
    width: GUIDE_DIAMETER,
    height: GUIDE_DIAMETER,
  },

  // Scanner line clip (circular overflow:hidden so bar is invisible outside the ring)
  scannerClip: {
    position: "absolute",
    width: CLIP_DIAMETER,
    height: CLIP_DIAMETER,
    borderRadius: CLIP_RADIUS,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  // The sweeping bar itself
  scannerBar: {
    width: CLIP_DIAMETER,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(16,185,129,0.75)",
    shadowColor: Colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },

  finderHint: {
    color: alpha(Colors.white, 185),
    fontSize: 13,
    textAlign: "center",
    letterSpacing: 0.3,
  },

  // Bottom controls
  controls: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 40, paddingBottom: 12,
  },
  controlBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: alpha(Colors.slate800, 180),
    borderWidth: 1, borderColor: alpha(Colors.white, 30),
    alignItems: "center", justifyContent: "center",
  },
  captureBtn: {
    width: 78, height: 78, borderRadius: 39,
    backgroundColor: Colors.emerald, borderWidth: 3, borderColor: Colors.mint,
    alignItems: "center", justifyContent: "center",
    shadowColor: Colors.emerald, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.65, shadowRadius: 18, elevation: 14,
  },
  captureBtnBusy: { backgroundColor: Colors.teal, borderColor: Colors.emerald },
  captureInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: alpha(Colors.white, 30),
  },

  // ── Frosted-glass loading overlay ─────────────────────────────────────────
  loadingRoot: {
    ...StyleSheet.absoluteFillObject,
    // Simulate frosted glass: very dark translucent slate
    backgroundColor: "rgba(15,23,42,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  loadingCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(30,41,59,0.96)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: alpha(Colors.emerald, 70),
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 18,
    shadowColor: Colors.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 24,
  },
  glowRing: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: alpha(Colors.emerald, 20),
    borderWidth: 2, borderColor: alpha(Colors.mint, 120),
    alignItems: "center", justifyContent: "center",
    shadowColor: Colors.mint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 16,
  },
  loadingStatus: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.teal,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  loadingMsg: {
    fontFamily: MONO,
    color: Colors.mint,
    fontSize: 13.5,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 4,
  },
  dotsRow:    { flexDirection: "row", gap: 7 },
  dot:        { width: 7, height: 7, borderRadius: 3.5 },
  dotActive:  { backgroundColor: Colors.emerald, transform: [{ scale: 1.4 }] },
  dotInactive: { backgroundColor: alpha(Colors.emerald, 55) },
  poweredByRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  poweredByText: { fontSize: 11, color: Colors.teal, fontWeight: "500" },

  // ── Network error card ─────────────────────────────────────────────────────
  errorCard: {
    width: 288, backgroundColor: Colors.slate800,
    borderRadius: 18, borderWidth: 1, borderColor: alpha(Colors.protein, 65),
    padding: 24, alignItems: "center", gap: 12,
  },
  errorTitle: { color: Colors.white, fontSize: 16, fontWeight: "700" },
  errorBody:  { color: Colors.slate400, fontSize: 13, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.protein,
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, marginTop: 4,
  },
  retryBtnText: { color: Colors.white, fontWeight: "700", fontSize: 14 },

  // ── Permission gate ────────────────────────────────────────────────────────
  permRoot: {
    flex: 1, backgroundColor: Colors.slate900,
    alignItems: "center", justifyContent: "center", padding: 36, gap: 16,
  },
  permTitle: { fontSize: 22, fontWeight: "700", color: Colors.white, textAlign: "center" },
  permBody:  { fontSize: 14, color: Colors.slate400, textAlign: "center", lineHeight: 22, maxWidth: 280 },
  permBtn: {
    backgroundColor: Colors.emerald, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 14, marginTop: 8,
    shadowColor: Colors.emerald, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  permBtnText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
  permBack:    { paddingVertical: 8 },
  permBackText: { color: Colors.slate400, fontSize: 14 },

  // ── Results dashboard ──────────────────────────────────────────────────────
  dashRoot:   { flex: 1, backgroundColor: Colors.slate50 },
  dashScroll: { flexGrow: 1, padding: 18, paddingTop: 12, paddingBottom: 48, gap: 14 },

  dashHeader: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.zinc, padding: 14,
    shadowColor: Colors.slate900, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  thumbnail:      { width: 72, height: 72, borderRadius: 12 },
  dashHeaderText: { flex: 1, gap: 3 },
  dashTitle:      { fontSize: 16, fontWeight: "700", color: Colors.slate900 },
  dashSubtitle:   { fontSize: 13, color: Colors.slate600 },
  avgRow:         { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  avgText:        { fontSize: 12, color: Colors.emerald, fontWeight: "600" },

  caloriesCard: {
    flexDirection: "row", alignItems: "center", gap: 18,
    backgroundColor: alpha(Colors.emerald, 16),
    borderRadius: 18, borderWidth: 1.5, borderColor: alpha(Colors.emerald, 65), padding: 20,
  },
  caloriesIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: alpha(Colors.emerald, 28),
    alignItems: "center", justifyContent: "center",
  },
  caloriesLabel: {
    fontSize: 11, fontWeight: "700", color: Colors.teal,
    letterSpacing: 0.9, textTransform: "uppercase",
  },
  caloriesValue: { fontSize: 44, fontWeight: "800", color: Colors.emerald, lineHeight: 50 },
  caloriesUnit:  { fontSize: 12, color: Colors.slate600 },

  card: {
    backgroundColor: Colors.white, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.zinc, padding: 18, gap: 14,
    shadowColor: Colors.slate900, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: Colors.slate400,
    letterSpacing: 0.9, textTransform: "uppercase",
  },
  disclaimer: { fontSize: 11, color: Colors.slate400, lineHeight: 16 },

  macroRow:      { flexDirection: "row", alignItems: "center", gap: 10 },
  macroLabelCol: { flexDirection: "row", alignItems: "center", gap: 7, width: 68 },
  macroDot:      { width: 8, height: 8, borderRadius: 4 },
  macroLabel:    { fontSize: 13, fontWeight: "600", color: Colors.slate900 },
  macroTrack: {
    flex: 1, height: 10, borderRadius: 5,
    backgroundColor: Colors.slate100,
    flexDirection: "row", overflow: "hidden",
  },
  macroFill:  { borderRadius: 5 },
  macroValue: { fontSize: 13, fontWeight: "700", width: 36, textAlign: "right" },

  foodCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: Colors.slate100,
  },
  foodIndex: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: alpha(Colors.emerald, 20),
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  foodIndexText: { fontSize: 12, fontWeight: "800", color: Colors.emerald },
  foodBody:   { flex: 1 },
  foodName:   { fontSize: 14, fontWeight: "600", color: Colors.slate900 },
  foodMeta:   { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 4 },
  foodGrams:  { fontSize: 11, color: Colors.slate600 },
  foodDot:    { fontSize: 11, color: Colors.slate400 },
  foodKcal:   { fontSize: 11, color: Colors.slate600, fontWeight: "600" },
  foodSource: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, flexShrink: 0,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },

  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.emerald, paddingVertical: 16, borderRadius: 16,
    shadowColor: Colors.emerald, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38, shadowRadius: 14, elevation: 10,
  },
  primaryBtnText: { color: Colors.white, fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.emerald,
    backgroundColor: alpha(Colors.emerald, 12),
  },
  outlineBtnText: { color: Colors.emerald, fontSize: 15, fontWeight: "600" },
});
