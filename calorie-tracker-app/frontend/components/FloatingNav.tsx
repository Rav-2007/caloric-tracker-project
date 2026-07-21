import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";
import {
  BarChart2,
  BookOpen,
  Camera,
  Home,
  MoreHorizontal,
} from "@/components/icons";

const SKY  = "#55CDFC";
const MUTED = "#94A3B8";

export type NavScreen = "home" | "progress" | "diary";

export interface FloatingNavProps {
  active:     NavScreen;
  onHome:     () => void;
  onProgress: () => void;
  onDiary:    () => void;
  onCamera:   () => void;
  onMore:     () => void;
}

function NavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: (color: string) => React.ReactNode;
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(active ? 1 : 0)).current;

  // Animate the active-tab highlight in/out when selection changes.
  useEffect(() => {
    Animated.timing(glow, {
      toValue: active ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [active, glow]);

  const pressIn  = () => Animated.spring(scale, { toValue: 0.86, useNativeDriver: true, speed: 60, bounciness: 6 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 12 }).start();

  return (
    <TouchableOpacity
      style={s.item}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      activeOpacity={0.85}
    >
      <Animated.View style={[s.itemInner, { transform: [{ scale }] }]}>
        <Animated.View style={[s.activePill, { opacity: glow }]} pointerEvents="none" />
        {icon(active ? SKY : MUTED)}
        <Text style={[s.label, active && s.labelOn]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function FloatingNav({
  active,
  onHome,
  onProgress,
  onDiary,
  onCamera,
  onMore,
}: FloatingNavProps) {
  const insets      = useSafeAreaInsets();
  const haloScale   = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0.38)).current;
  const fabScale    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(haloScale,   { toValue: 1.9,  duration: 2400, useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0,    duration: 2400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(haloScale,   { toValue: 1,    duration: 0, useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0.38, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const pressIn  = () => Animated.spring(fabScale, { toValue: 0.88, useNativeDriver: true, speed: 60, bounciness: 6 }).start();
  const pressOut = () => Animated.spring(fabScale, { toValue: 1,    useNativeDriver: true, speed: 30, bounciness: 14 }).start();

  return (
    <View
      style={[s.outer, { paddingBottom: Math.max(insets.bottom, 12) }]}
      pointerEvents="box-none"
    >
      {/* Gradient FAB with animated halo — floats above island */}
      <View style={s.fabAnchor} pointerEvents="box-none">
        <Animated.View
          style={[s.haloWrap, { transform: [{ scale: haloScale }], opacity: haloOpacity }]}
          pointerEvents="none"
        >
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <Defs>
              <LinearGradient id="haloG" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%"   stopColor="#55CDFC" />
                <Stop offset="50%"  stopColor="#A78BFA" />
                <Stop offset="100%" stopColor="#F97316" />
              </LinearGradient>
            </Defs>
            <Circle cx={40} cy={40} r={37} stroke="url(#haloG)" strokeWidth={6} fill="none" />
          </Svg>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: fabScale }] }}>
          <TouchableOpacity
            style={s.fab}
            onPress={onCamera}
            onPressIn={pressIn}
            onPressOut={pressOut}
            activeOpacity={1}
          >
            <Svg width={62} height={62} viewBox="0 0 62 62" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="fabG" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%"   stopColor="#55CDFC" />
                  <Stop offset="48%"  stopColor="#818CF8" />
                  <Stop offset="100%" stopColor="#F97316" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={62} height={62} rx={31} fill="url(#fabG)" />
            </Svg>
            <Camera size={22} color="#FFFFFF" strokeWidth={2} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Glassmorphic island pill */}
      <View style={s.island}>
        <NavItem
          icon={(c) => <Home            size={20} color={c} strokeWidth={2} />}
          label="Home"     active={active === "home"}     onPress={onHome}
        />
        <NavItem
          icon={(c) => <BookOpen        size={20} color={c} strokeWidth={2} />}
          label="Diary"    active={active === "diary"}    onPress={onDiary}
        />
        <View style={s.slot} />
        <NavItem
          icon={(c) => <BarChart2       size={20} color={c} strokeWidth={2} />}
          label="Progress" active={active === "progress"} onPress={onProgress}
        />
        <NavItem
          icon={(c) => <MoreHorizontal  size={20} color={c} strokeWidth={2} />}
          label="More"     onPress={onMore}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  outer: {
    position:   "absolute",
    bottom:     0,
    left:       0,
    right:      0,
    alignItems: "center",
  },
  fabAnchor: {
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   -26,
    zIndex:         20,
  },
  haloWrap: {
    position: "absolute",
    width:    80,
    height:   80,
  },
  fab: {
    width:          62,
    height:         62,
    borderRadius:   31,
    alignItems:     "center",
    justifyContent: "center",
    overflow:       "hidden",
    shadowColor:    "#55CDFC",
    shadowOffset:   { width: 0, height: 8 },
    shadowOpacity:  0.55,
    shadowRadius:   28,
    elevation:      20,
  },
  island: {
    marginHorizontal:  14,
    alignSelf:         "stretch",
    height:            60,
    borderRadius:      30,
    backgroundColor:   "rgba(255,255,255,0.96)",
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: 6,
    shadowColor:       "#000",
    shadowOffset:      { width: 0, height: 8 },
    shadowOpacity:     0.10,
    shadowRadius:      32,
    elevation:         16,
  },
  slot:    { flex: 1.2 },
  item:    { flex: 1, alignItems: "center", justifyContent: "center" },
  itemInner: {
    alignItems:        "center",
    justifyContent:    "center",
    gap:               3,
    paddingVertical:   6,
    paddingHorizontal: 10,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius:    16,
    backgroundColor: "rgba(85,205,252,0.14)",
  },
  label:   { fontSize: 8, fontWeight: "600", color: MUTED, letterSpacing: 0.2 },
  labelOn: { color: SKY, fontWeight: "700" },
});
