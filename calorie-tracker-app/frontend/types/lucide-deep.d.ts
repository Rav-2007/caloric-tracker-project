/**
 * Type shim for deep icon imports in components/icons.ts — the package ships
 * types only for its barrel entry, not for per-icon files.
 */
declare module "lucide-react-native/dist/esm/icons/*" {
  import type { LucideIcon } from "lucide-react-native";
  const icon: LucideIcon;
  export default icon;
}
