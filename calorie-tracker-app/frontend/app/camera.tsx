/**
 * camera.tsx — Full pipeline: capture → compress → upload → results
 *
 * UI matches the reference design:
 *  - Full-screen camera, no vignette
 *  - Minimal top bar: circular X (left), flash + help (right)
 *  - Large L-bracket corners at screen edges
 *  - Hint text below frame
 *  - Bottom pill mode selector (Scan Food / Barcode / Food Label)
 *  - Controls row: sliders icon | shutter | gallery icon
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  Flame,
  HelpCircle,
  Image as ImageIcon,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
  Tag,
  X,
  Zap,
} from "@/components/icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Colors, alpha } from "@/constants/colors";
import { API_URL, authHeaders } from "@/constants/api";

// ─── Config ──────────────────────────────────────────────────────────────────
const NETWORK_TIMEOUT_MS = 40_000;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
// Bracket corners sit right at the screen edges with a small inset
const FRAME_INSET  = 28;
const FRAME_W      = SCREEN_W - FRAME_INSET * 2;
const FRAME_H      = SCREEN_H * 0.72;
const BRACKET_LEN  = 28;   // arm length of each L-corner
const BRACKET_T    = 3;    // stroke thickness

const MONO = Platform.OS === "ios" ? "Courier New" : "monospace";
const BLUE = "#4A9EFF";   // vivid blue matching reference corners

const LOADING_MESSAGES = [
  "Checking Indian nutrition database...",
  "Analyzing density & oil pools...",
  "Mapping plate geometry...",
  "Cross-referencing portion weights...",
  "Computing macro profiles...",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type NutritionSource = "icmr_nin" | "estimated";
type CameraMode     = "scan" | "barcode" | "label";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function compressImage(uri: string): Promise<string> {
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: 768 } }],
    { compress: 0.8, format: SaveFormat.JPEG },
  );
  return result.uri;
}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Four blue L-bracket corners framing the viewfinder */
function BracketCorners() {
  return (
    <View style={styles.bracketWrapper} pointerEvents="none">
      {/* Top-left: H bar along top, V bar along left */}
      <View style={[styles.corner, styles.cornerTL]}>
        <View style={[styles.cornerH, { top: 0, left: 0, backgroundColor: BLUE }]} />
        <View style={[styles.cornerV, { top: 0, left: 0, backgroundColor: BLUE }]} />
      </View>
      {/* Top-right: H bar along top, V bar along right */}
      <View style={[styles.corner, styles.cornerTR]}>
        <View style={[styles.cornerH, { top: 0, right: 0, backgroundColor: BLUE }]} />
        <View style={[styles.cornerV, { top: 0, right: 0, backgroundColor: BLUE }]} />
      </View>
      {/* Bottom-left: H bar along bottom, V bar along left */}
      <View style={[styles.corner, styles.cornerBL]}>
        <View style={[styles.cornerH, { bottom: 0, left: 0, backgroundColor: BLUE }]} />
        <View style={[styles.cornerV, { bottom: 0, left: 0, backgroundColor: BLUE }]} />
      </View>
      {/* Bottom-right: H bar along bottom, V bar along right */}
      <View style={[styles.corner, styles.cornerBR]}>
        <View style={[styles.cornerH, { bottom: 0, right: 0, backgroundColor: BLUE }]} />
        <View style={[styles.cornerV, { bottom: 0, right: 0, backgroundColor: BLUE }]} />
      </View>
    </View>
  );
}

/** Horizontal blue scanner sweep shown while analyzing */
function ScannerLine({ active }: { active: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { anim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(60),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, anim]);

  if (!active) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-FRAME_H / 2, FRAME_H / 2] });
  return (
    <View style={styles.scanLineClip} pointerEvents="none">
      <Animated.View style={[styles.scanLine, { transform: [{ translateY }] }]} />
    </View>
  );
}

function PermissionGate({ onRequest }: { onRequest: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.permRoot}>
      <StatusBar style="dark" />
      <ShieldAlert size={48} color={BLUE} strokeWidth={1.5} />
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

// Mode selector pills — Scan Food / Barcode / Food Label
const CAMERA_MODES: { id: CameraMode; label: string; Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }> }[] = [
  { id: "scan",    label: "Scan Food",  Icon: Sparkles },
  { id: "barcode", label: "Barcode",    Icon: QrCode   },
  { id: "label",   label: "Food Label", Icon: Tag      },
];

function ModeSelector({ active, onSelect }: { active: CameraMode; onSelect: (m: CameraMode) => void }) {
  return (
    <View style={styles.modeSelectorRow}>
      {CAMERA_MODES.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <TouchableOpacity
            key={id}
            style={[styles.modeChip, isActive && styles.modeChipActive]}
            onPress={() => onSelect(id)}
            activeOpacity={0.75}
          >
            <Icon size={14} color={isActive ? "#111" : "rgba(255,255,255,0.80)"} strokeWidth={2} />
            <Text style={[styles.modeChipText, isActive && styles.modeChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Loading overlay
function LoadingOverlay({ msgIndex }: { msgIndex: number }) {
  const idx = msgIndex % LOADING_MESSAGES.length;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    fadeAnim.setValue(0);
    const a = Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [idx, fadeAnim]);
  return (
    <View style={styles.loadingCard}>
      <View style={styles.glowRing}>
        <ActivityIndicator size="large" color={BLUE} />
      </View>
      <Text style={styles.loadingStatus}>GEMINI VISION · ACTIVE</Text>
      <Animated.Text style={[styles.loadingMsg, { opacity: fadeAnim }]}>
        {LOADING_MESSAGES[idx]}
      </Animated.Text>
      <View style={styles.dotsRow}>
        {LOADING_MESSAGES.map((_, i) => (
          <View key={i} style={[styles.dot, i === idx ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>
    </View>
  );
}

// Network error card
function NetworkErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
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

// ─── Results Dashboard ────────────────────────────────────────────────────────
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
          <Text style={[styles.foodSource, { color: isVerified ? Colors.emerald : "#94A3B8" }]}>
            {isVerified ? "✓ Verified" : "est."}
          </Text>
        </View>
      </View>
      <View style={[styles.badge, { backgroundColor: alpha(color, 22), borderColor: alpha(color, 65) }]}>
        <CheckCircle2 size={11} color={color} strokeWidth={2.5} />
        <Text style={[styles.badgeText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

function ResultsDashboard({ photoUri, result, onRetake }: {
  photoUri: string;
  result: FoodAnalysisResult;
  onRetake: () => void;
}) {
  const router    = useRouter();
  const maxMacroG = Math.max(result.total_protein_g, result.total_carbs_g, result.total_fat_g, 1);
  const avgConf   = Math.round(avgConfidence(result.food_items) * 100);
  const icmrCount = result.food_items.filter((i) => i.nutrition_source === "icmr_nin").length;

  return (
    <SafeAreaView style={styles.dashRoot} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      {/* Top bar with back button */}
      <View style={styles.dashTopBar}>
        <TouchableOpacity style={styles.dashBackBtn} onPress={onRetake} activeOpacity={0.75}>
          <X size={18} color="#0F172A" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.dashTopTitle}>Analysis Complete 🎉</Text>
        <View style={{ width: 38 }} />
      </View>
      <ScrollView contentContainerStyle={styles.dashScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.dashHeader}>
          <Image source={{ uri: photoUri }} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.dashHeaderText}>
            <Text style={styles.dashTitle}>Analysis Complete</Text>
            <Text style={styles.dashSubtitle}>
              {result.food_items.length} item{result.food_items.length !== 1 ? "s" : ""} identified
            </Text>
            <View style={styles.avgRow}>
              <CheckCircle2 size={12} color={BLUE} strokeWidth={2.5} />
              <Text style={styles.avgText}>
                {avgConf}% avg · {icmrCount}/{result.food_items.length} verified
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.caloriesCard}>
          <View style={styles.caloriesIconWrap}>
            <Flame size={24} color={BLUE} strokeWidth={1.75} />
          </View>
          <View>
            <Text style={styles.caloriesLabel}>TOTAL CALORIES</Text>
            <Text style={styles.caloriesValue}>{Math.round(result.total_calories).toLocaleString()}</Text>
            <Text style={styles.caloriesUnit}>kcal · {icmrCount > 0 ? "verified" : "estimated"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>MACRONUTRIENTS</Text>
          <MacroBar label="Protein" grams={Math.round(result.total_protein_g)} proportion={result.total_protein_g / maxMacroG} color={Colors.protein} />
          <MacroBar label="Carbs"   grams={Math.round(result.total_carbs_g)}   proportion={result.total_carbs_g   / maxMacroG} color={Colors.carbs} />
          <MacroBar label="Fat"     grams={Math.round(result.total_fat_g)}     proportion={result.total_fat_g     / maxMacroG} color={Colors.fat} />
          <Text style={styles.disclaimer}>
            * Values sourced from the Indian Nutrition Database (ICMR-NIN 2017).
            {icmrCount < result.food_items.length
              ? ` ${result.food_items.length - icmrCount} item(s) use fallback estimates.`
              : " All items verified against the nutrition database."}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>IDENTIFIED FOODS</Text>
          {result.food_items.map((item, i) => (
            <FoodItemCard key={`${item.item_name}-${i}`} item={item} index={i} />
          ))}
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push({ pathname: "/review", params: { data: JSON.stringify(result), photoUri } })}
          activeOpacity={0.82}
        >
          <BookmarkPlus size={18} color={Colors.white} strokeWidth={2} />
          <Text style={styles.primaryBtnText}>Adjust & Log Meal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.outlineBtn} onPress={onRetake} activeOpacity={0.75}>
          <RefreshCw size={16} color={BLUE} strokeWidth={2} />
          <Text style={styles.outlineBtnText}>Retake Scan</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing]           = useState<CameraType>("back");
  const [flashOn, setFlashOn]         = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraMode, setCameraMode]   = useState<CameraMode>("scan");

  const [photoUri, setPhotoUri]             = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing]       = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx]   = useState(0);
  const [analysisResult, setAnalysisResult] = useState<FoodAnalysisResult | null>(null);
  const [networkError, setNetworkError]     = useState<string | null>(null);

  const cameraRef = useRef<InstanceType<typeof CameraView>>(null);
  const router    = useRouter();

  // Loading message cycle
  useEffect(() => {
    if (!isAnalyzing) return;
    setLoadingMsgIdx(0);
    const id = setInterval(() => setLoadingMsgIdx((p) => (p + 1) % LOADING_MESSAGES.length), 2200);
    return () => clearInterval(id);
  }, [isAnalyzing]);

  const resetState = useCallback(() => {
    setPhotoUri(null);
    setAnalysisResult(null);
    setNetworkError(null);
    setIsAnalyzing(false);
    setIsCapturing(false);
    setLoadingMsgIdx(0);
    setCameraMode("scan");
  }, []);

  const sendToBackend = useCallback(async (uri: string) => {
    setNetworkError(null);
    setIsAnalyzing(true);
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    try {
      const formData = new FormData();
      formData.append("file", { uri, name: `meal_${Date.now()}.jpg`, type: "image/jpeg" } as unknown as Blob);
      const response = await fetch(`${API_URL}/api/v1/analyze-food`, {
        method: "POST",
        body: formData,
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = `Analysis failed (HTTP ${response.status})`;
        try { const b = await response.json(); if (b?.detail) detail = String(b.detail); } catch { /* noop */ }
        throw new Error(detail);
      }
      setAnalysisResult(await response.json());
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      setNetworkError(
        isAbort
          ? `Request timed out after ${NETWORK_TIMEOUT_MS / 1000} s. Check backend and WiFi.`
          : err instanceof Error ? err.message : `Cannot reach ${API_URL}. Verify backend is running.`,
      );
    } finally {
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  }, []);

  const pickAndAnalyze = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 1 });
      if (picked.canceled || !picked.assets.length) return;
      const compressed = await compressImage(picked.assets[0].uri);
      setPhotoUri(compressed);
      await sendToBackend(compressed);
    } catch (err: unknown) {
      Alert.alert("Gallery failed", err instanceof Error ? err.message : "Could not load image.");
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, sendToBackend]);

  const handleModeSelect = useCallback((mode: CameraMode) => {
    if (mode === "barcode" || mode === "label") {
      Alert.alert("Coming soon", "Barcode and food-label scanning aren't available yet. Use Scan Food to photograph a plate.");
      return;
    }
    setCameraMode(mode);
  }, []);

  const processAndAnalyze = useCallback(async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo) return;
      const compressed = await compressImage(photo.uri);
      setPhotoUri(compressed);
      await sendToBackend(compressed);
    } catch (err: unknown) {
      Alert.alert("Capture failed", err instanceof Error ? err.message : "Could not capture image. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, sendToBackend]);

  // Guards
  if (permission === null) {
    return (
      <View style={styles.blank}>
        <ActivityIndicator size="large" color={BLUE} />
      </View>
    );
  }
  if (!permission.granted) return <PermissionGate onRequest={requestPermission} />;
  if (analysisResult && photoUri) {
    return <ResultsDashboard photoUri={photoUri} result={analysisResult} onRetake={resetState} />;
  }

  // ── Camera View ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Full-screen camera */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flashOn ? "on" : "off"} />

      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]}>

        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconCircle} onPress={() => router.back()} activeOpacity={0.75}>
            <X size={18} color={Colors.white} strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.topBarRight}>
            <TouchableOpacity
              style={[styles.iconCircle, flashOn && styles.iconCircleActive]}
              onPress={() => { if (facing === "back") setFlashOn((v) => !v); }}
              activeOpacity={0.75}
            >
              <Zap size={16} color={Colors.white} strokeWidth={2} fill={flashOn ? Colors.white : "none"} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconCircle}
              onPress={() => Alert.alert("How to scan", "Frame your plate within the guides and tap the shutter. Keep the meal well-lit and centred.")}
              activeOpacity={0.75}
            >
              <HelpCircle size={18} color={Colors.white} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Viewfinder area — fills remaining space ── */}
        <View style={styles.finderArea}>
          {networkError ? (
            <NetworkErrorCard message={networkError} onRetry={() => photoUri && sendToBackend(photoUri)} />
          ) : (
            <>
              <BracketCorners />
              <ScannerLine active={isAnalyzing} />
            </>
          )}
        </View>

        {/* ── Hint text ── */}
        <Text style={styles.hintText}>
          {isAnalyzing ? "Analyzing your meal..." : "Frame your food within the guides"}
        </Text>

        {/* ── Mode selector pills ── */}
        <ModeSelector active={cameraMode} onSelect={handleModeSelect} />

        {/* ── Controls bar ── */}
        <View style={styles.controlsBar}>
          {/* Left: sliders / flip icon */}
          <TouchableOpacity
            style={styles.controlIcon}
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            activeOpacity={0.75}
          >
            <SlidersHorizontal size={22} color={Colors.white} strokeWidth={1.75} />
          </TouchableOpacity>

          {/* Center: shutter */}
          <TouchableOpacity
            style={[styles.shutter, isCapturing && styles.shutterBusy]}
            onPress={processAndAnalyze}
            activeOpacity={0.88}
            disabled={isCapturing}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          {/* Right: gallery */}
          <TouchableOpacity style={styles.controlIcon} onPress={pickAndAnalyze} activeOpacity={0.75}>
            <ImageIcon size={22} color={Colors.white} strokeWidth={1.75} />
          </TouchableOpacity>
        </View>

      </SafeAreaView>

      {/* Loading overlay */}
      {isAnalyzing && (
        <View style={styles.loadingRoot}>
          <LoadingOverlay msgIndex={loadingMsgIdx} />
        </View>
      )}
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },

  // Camera shell
  root:    { flex: 1, backgroundColor: "#000" },
  overlay: { flex: 1, justifyContent: "space-between" },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(30,30,30,0.72)",
    alignItems: "center", justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: "rgba(74,158,255,0.35)",
  },

  // ── Viewfinder ─────────────────────────────────────────────────────────────
  finderArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Bracket corners
  bracketWrapper: {
    position: "absolute",
    width: FRAME_W,
    height: FRAME_H,
  },
  corner: { position: "absolute", width: BRACKET_LEN + BRACKET_T, height: BRACKET_LEN + BRACKET_T },
  cornerTL: { top: 0, left: 0 },
  cornerTR: { top: 0, right: 0 },
  cornerBL: { bottom: 0, left: 0 },
  cornerBR: { bottom: 0, right: 0 },

  cornerH: {
    position: "absolute",
    width: BRACKET_LEN,
    height: BRACKET_T,
    borderRadius: 2,
  },
  cornerV: {
    position: "absolute",
    width: BRACKET_T,
    height: BRACKET_LEN,
    borderRadius: 2,
  },

  // Scanner sweep
  scanLineClip: {
    position: "absolute",
    width: FRAME_W,
    height: FRAME_H,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  scanLine: {
    width: FRAME_W,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(74,158,255,0.80)",
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },

  // ── Hint text ──────────────────────────────────────────────────────────────
  hintText: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 18,
    letterSpacing: 0.2,
  },

  // ── Mode selector ──────────────────────────────────────────────────────────
  modeSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  modeChipActive: {
    backgroundColor: Colors.white,
  },
  modeChipText: {
    color: "rgba(255,255,255,0.80)",
    fontSize: 13,
    fontWeight: "600",
  },
  modeChipTextActive: {
    color: "#111",
  },

  // ── Controls bar ───────────────────────────────────────────────────────────
  controlsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 48,
    paddingBottom: 16,
  },
  controlIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  shutter: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 4, borderColor: "rgba(255,255,255,0.75)",
    alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
  },
  shutterBusy: { opacity: 0.45 },
  shutterInner: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.white,
  },

  // ── Loading overlay ────────────────────────────────────────────────────────
  loadingRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10,10,20,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  loadingCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(20,28,48,0.97)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(74,158,255,0.40)",
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 18,
  },
  glowRing: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(74,158,255,0.10)",
    borderWidth: 2, borderColor: "rgba(74,158,255,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  loadingStatus: {
    fontSize: 10, fontWeight: "700", color: "rgba(74,158,255,0.85)",
    letterSpacing: 2, textTransform: "uppercase",
  },
  loadingMsg: {
    fontFamily: MONO, color: "#FFF", fontSize: 13.5,
    fontWeight: "400", textAlign: "center", lineHeight: 22,
  },
  dotsRow:     { flexDirection: "row", gap: 7 },
  dot:         { width: 7, height: 7, borderRadius: 3.5 },
  dotActive:   { backgroundColor: BLUE, transform: [{ scale: 1.4 }] },
  dotInactive: { backgroundColor: "rgba(74,158,255,0.28)" },

  // ── Network error card ──────────────────────────────────────────────────────
  errorCard: {
    width: 288, backgroundColor: "rgba(21,28,44,0.92)",
    borderRadius: 18, borderWidth: 1, borderColor: alpha(Colors.protein, 65),
    padding: 24, alignItems: "center", gap: 12,
  },
  errorTitle: { color: Colors.white, fontSize: 16, fontWeight: "700" },
  errorBody:  { color: "rgba(255,255,255,0.55)", fontSize: 13, textAlign: "center", lineHeight: 20 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.protein,
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, marginTop: 4,
  },
  retryBtnText: { color: Colors.white, fontWeight: "700", fontSize: 14 },

  // ── Permission gate ─────────────────────────────────────────────────────────
  permRoot: {
    flex: 1, backgroundColor: "#F8FAFC",
    alignItems: "center", justifyContent: "center", padding: 36, gap: 16,
  },
  permTitle: { fontSize: 22, fontWeight: "700", color: "#0F172A", textAlign: "center" },
  permBody:  { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 22, maxWidth: 280 },
  permBtn: {
    backgroundColor: BLUE, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 14, marginTop: 8,
  },
  permBtnText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
  permBack:    { paddingVertical: 8 },
  permBackText: { color: "#94A3B8", fontSize: 14 },

  // ── Results dashboard ───────────────────────────────────────────────────────
  dashRoot:     { flex: 1, backgroundColor: "#F8FAFC" },
  dashTopBar:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  dashBackBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(74,158,255,0.10)", alignItems: "center", justifyContent: "center" },
  dashTopTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A", letterSpacing: -0.3 },
  dashScroll: { flexGrow: 1, padding: 18, paddingTop: 12, paddingBottom: 48, gap: 14 },
  dashHeader: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#FFF", borderRadius: 18,
    borderWidth: 1, borderColor: "#E2E8F0", padding: 14,
    shadowColor: "#64748B", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  thumbnail:      { width: 72, height: 72, borderRadius: 12 },
  dashHeaderText: { flex: 1, gap: 3 },
  dashTitle:      { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  dashSubtitle:   { fontSize: 13, color: "#64748B" },
  avgRow:         { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  avgText:        { fontSize: 12, color: BLUE, fontWeight: "600" },
  caloriesCard: {
    flexDirection: "row", alignItems: "center", gap: 18,
    backgroundColor: "#FFF", borderRadius: 18,
    borderWidth: 1, borderColor: "#E2E8F0", padding: 20,
    shadowColor: "#64748B", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  caloriesIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: "rgba(74,158,255,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  caloriesLabel: {
    fontSize: 11, fontWeight: "700", color: "#64748B",
    letterSpacing: 0.9, textTransform: "uppercase",
  },
  caloriesValue: { fontSize: 44, fontWeight: "800", color: "#0F172A", lineHeight: 50 },
  caloriesUnit:  { fontSize: 12, color: "#94A3B8" },
  card: {
    backgroundColor: "#FFF", borderRadius: 18,
    borderWidth: 1, borderColor: "#E2E8F0", padding: 18, gap: 14,
    shadowColor: "#64748B", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: "#64748B",
    letterSpacing: 0.9, textTransform: "uppercase",
  },
  disclaimer: { fontSize: 11, color: "#94A3B8", lineHeight: 16 },
  macroRow:      { flexDirection: "row", alignItems: "center", gap: 10 },
  macroLabelCol: { flexDirection: "row", alignItems: "center", gap: 7, width: 68 },
  macroDot:      { width: 8, height: 8, borderRadius: 4 },
  macroLabel:    { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  macroTrack: {
    flex: 1, height: 10, borderRadius: 5,
    backgroundColor: "#F1F5F9", flexDirection: "row", overflow: "hidden",
  },
  macroFill:  { borderRadius: 5 },
  macroValue: { fontSize: 13, fontWeight: "700", width: 36, textAlign: "right" },
  foodCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#F1F5F9",
  },
  foodIndex: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(74,158,255,0.12)",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  foodIndexText: { fontSize: 12, fontWeight: "800", color: BLUE },
  foodBody:   { flex: 1 },
  foodName:   { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  foodMeta:   { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 4 },
  foodGrams:  { fontSize: 11, color: "#64748B" },
  foodDot:    { fontSize: 11, color: "#CBD5E1" },
  foodKcal:   { fontSize: 11, color: "#64748B", fontWeight: "600" },
  foodSource: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, flexShrink: 0,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: BLUE, paddingVertical: 16, borderRadius: 16,
    shadowColor: BLUE, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 10,
  },
  primaryBtnText: { color: Colors.white, fontSize: 16, fontWeight: "700" },
  outlineBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderRadius: 16,
    borderWidth: 1.5, borderColor: BLUE,
    backgroundColor: "rgba(74,158,255,0.08)",
  },
  outlineBtnText: { color: BLUE, fontSize: 15, fontWeight: "600" },
});
