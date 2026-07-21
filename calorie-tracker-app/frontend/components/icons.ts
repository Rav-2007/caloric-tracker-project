/**
 * icons.ts — single import surface for lucide icons.
 *
 * Metro does not tree-shake the `lucide-react-native` barrel, so importing
 * from the package root bundles all ~1,500 icons (megabytes of JS plus module
 * init at startup). This module deep-imports only the icons the app uses.
 *
 * Adding an icon: find its file under
 * `node_modules/lucide-react-native/dist/esm/icons/` (kebab-case, current
 * lucide name — e.g. the old `CheckCircle` alias lives in `circle-check-big`)
 * and re-export it here under the name the app uses.
 */

export { default as AlertTriangle }   from "lucide-react-native/dist/esm/icons/triangle-alert";
export { default as ArrowLeft }       from "lucide-react-native/dist/esm/icons/arrow-left";
export { default as BarChart2 }       from "lucide-react-native/dist/esm/icons/chart-no-axes-column";
export { default as BookOpen }        from "lucide-react-native/dist/esm/icons/book-open";
export { default as BookmarkPlus }    from "lucide-react-native/dist/esm/icons/bookmark-plus";
export { default as Calendar }        from "lucide-react-native/dist/esm/icons/calendar";
export { default as Camera }          from "lucide-react-native/dist/esm/icons/camera";
export { default as CheckCircle }     from "lucide-react-native/dist/esm/icons/circle-check-big";
export { default as CheckCircle2 }    from "lucide-react-native/dist/esm/icons/circle-check";
export { default as ChevronDown }     from "lucide-react-native/dist/esm/icons/chevron-down";
export { default as ChevronLeft }     from "lucide-react-native/dist/esm/icons/chevron-left";
export { default as ChevronRight }    from "lucide-react-native/dist/esm/icons/chevron-right";
export { default as Coffee }          from "lucide-react-native/dist/esm/icons/coffee";
export { default as Droplets }        from "lucide-react-native/dist/esm/icons/droplets";
export { default as Flame }           from "lucide-react-native/dist/esm/icons/flame";
export { default as FlipHorizontal }  from "lucide-react-native/dist/esm/icons/flip-horizontal";
export { default as HelpCircle }      from "lucide-react-native/dist/esm/icons/circle-help";
export { default as History }         from "lucide-react-native/dist/esm/icons/history";
export { default as Home }            from "lucide-react-native/dist/esm/icons/house";
export { default as Image }           from "lucide-react-native/dist/esm/icons/image";
export { default as Leaf }            from "lucide-react-native/dist/esm/icons/leaf";
export { default as Moon }            from "lucide-react-native/dist/esm/icons/moon";
export { default as MoreHorizontal }  from "lucide-react-native/dist/esm/icons/ellipsis";
export { default as Plus }            from "lucide-react-native/dist/esm/icons/plus";
export { default as QrCode }          from "lucide-react-native/dist/esm/icons/qr-code";
export { default as RefreshCw }       from "lucide-react-native/dist/esm/icons/refresh-cw";
export { default as ShieldAlert }     from "lucide-react-native/dist/esm/icons/shield-alert";
export { default as ShieldCheck }     from "lucide-react-native/dist/esm/icons/shield-check";
export { default as Sparkles }        from "lucide-react-native/dist/esm/icons/sparkles";
export { default as Star }            from "lucide-react-native/dist/esm/icons/star";
export { default as Sun }             from "lucide-react-native/dist/esm/icons/sun";
export { default as Sunset }          from "lucide-react-native/dist/esm/icons/sunset";
export { default as Tag }             from "lucide-react-native/dist/esm/icons/tag";
export { default as TrendingUp }      from "lucide-react-native/dist/esm/icons/trending-up";
export { default as User }            from "lucide-react-native/dist/esm/icons/user";
export { default as UtensilsCrossed } from "lucide-react-native/dist/esm/icons/utensils-crossed";
export { default as X }               from "lucide-react-native/dist/esm/icons/x";
export { default as Zap }             from "lucide-react-native/dist/esm/icons/zap";
