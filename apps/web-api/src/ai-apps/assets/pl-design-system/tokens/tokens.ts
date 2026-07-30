/**
 * PL Network Directory — design tokens as typed values.
 *
 * Mirrors tokens.css for consumers that need tokens in JS (charts, canvas,
 * emails, React Native). CSS remains the source of truth; if you change a
 * value here, change it there.
 */

export const color = {
  // Brand
  blue100: "#e8edff",
  blue200: "#aebfff",
  blue400: "#427dff",
  blue500: "#156ff7",
  blue600: "#1b4dff",
  blue700: "#0f3cd9",
  blue800: "#1158c4",
  blue900: "#1849a9",

  // Neutrals (slate — canonical)
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  slate900: "#0f172a",
  white: "#ffffff",
  black: "#000000",

  // Action status ramps (Figma action/background/*)
  green500: "#11a75c",
  slate250: "#d7dfe9",
  sky400: "#45d8ff",
  blue650: "#005bea",
  green600: "#0a9952",
  amber500: "#f59e0b",
  amber600: "#d97706",
  red500: "#ff3838",
  red600: "#e92215",
  blue450: "#4a72ff",

  // Accents
  teal500: "#44d5bb",
  violet600: "#5925dc",
  green700: "#027a48",
} as const;

/** Role tokens — prefer these over `color` in product code. */
export const semantic = {
  bgCanvas: color.slate100,
  bgSurface: color.white,
  bgSurfaceSunken: color.slate200,
  bgSurfaceSubtle: color.slate50,
  bgHover: color.slate50,

  textPrimary: color.slate900,
  textSecondary: color.slate600,
  textTertiary: color.slate500,
  textInverse: color.white,
  textLink: color.blue500,
  textBrand: color.blue600,

  borderDefault: color.slate300,
  borderSubtle: color.slate200,
  borderStrong: color.slate400,

  actionPrimaryBg: color.blue600,
  actionPrimaryBgHover: color.blue700,
  actionPrimaryFg: color.white,
  actionPrimaryBgActive: color.blue600,
  actionPrimaryBgFocus: color.blue450,
  actionPrimaryBgDisabled: color.blue200,
  actionRing: color.blue200,

  actionSuccessBg: color.green500,
  actionSuccessBgHover: color.green600,
  actionSuccessFg: color.green600,
  actionWarningBg: color.amber500,
  actionWarningBgHover: color.amber600,
  actionWarningFg: color.amber600,
  actionErrorBg: color.red500,
  actionErrorBgHover: color.red600,
  actionErrorFg: color.red500,

  statusSuccess: color.green700,
  statusInfo: color.blue500,
  statusWarning: "#b54708",
  statusDanger: "#b42318",
  statusNeutral: color.slate400,
  /* Delta/trend foregrounds. Figma `foreground/success/primary`; the negative
     direction extrapolates from the error ramp. */
  textSuccess: color.green600,
  textDanger: color.red600,
  textDisabledSubtle: color.slate250,

  /* Tabular data. Figma `Table Cell` 14938:8436 and `Table header` 14938:29415.
     The two non-default States replace the row base rather than layering on it,
     exactly as the Figma set does. */
  tableRowBg: "#ffffff",
  tableRowBgZebra: "rgba(14, 15, 17, 0.04)",
  tableRowBgHover: "rgba(14, 15, 17, 0.02)",
  tableRowBgActive: "rgba(14, 15, 17, 0.06)",
  tableRowBgSelected: "rgba(27, 77, 255, 0.06)",
  tableBorder: "rgba(27, 56, 96, 0.12)",
  tableHeadBg: "#f8fafc",

  /* In-cell data visualisation. */
  dataTrack: color.slate100,
  dataLine: color.blue600,
  dataRating: color.amber500,
} as const;

/**
 * Categorical palette for charts and category marks.
 * Ordered for maximum adjacent contrast; first three are the accents that
 * already appear in the product.
 */
export const categorical = [
  color.blue600,
  color.teal500,
  color.violet600,
  color.green700,
  color.blue400,
  color.slate500,
] as const;

export const space = {
  0: "0",
  0.5: "0.125rem",
  1: "0.25rem",
  1.5: "0.375rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  15: "3.75rem",
  20: "5rem",
} as const;

export const radius = {
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  "2xl": "16px",
  "3xl": "24px",
  pill: "9999px",
  circle: "50%",
} as const;

export const fontSize = {
  "2xs": "0.6875rem",
  xs: "0.75rem",
  sm: "0.8125rem",
  base: "0.875rem",
  md: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "2rem",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
} as const;

export const shadow = {
  card: "0 1px 2px 0 rgba(14, 15, 17, 0.06)",
  raised:
    "0 0 1px 0 rgba(15, 23, 42, 0.12), 0 4px 4px 0 rgba(15, 23, 42, 0.04)",
  navbar: `0 1px 4px 0 ${color.slate200}`,
  action:
    "0 1px 5px 0 rgba(27, 77, 255, 0.16), inset 0 4px 6px 0 rgba(255, 255, 255, 0.06), inset 0 1px 3px 0 rgba(255, 255, 255, 0.32)",
  /* Non-brand Fill buttons. Figma effect style `Button/regular/fill`. */
  actionRegular:
    "0 1px 5px 0 rgba(14, 15, 17, 0.16), inset 0 4px 6px 0 rgba(14, 15, 17, 0.04), inset 0 1px 3px 0 rgba(14, 15, 17, 0.08)",
  /* Border-style buttons. Figma effect style `Button/regular/border`. */
  actionBorder:
    "0 1px 2px 0 rgba(14, 15, 17, 0.08), inset 0 -2px 8px 0 rgba(14, 15, 17, 0.02)",
  /* Light-style buttons. Figma effect style `Button/regular/light`. */
  actionLight: "inset 0 -2px 4px 0 rgba(14, 15, 17, 0.02)",
  /* Keyboard focus, under the ring. Figma effect style `Shadow/md`. */
  actionFocus:
    "0 2px 4px -1px rgba(14, 15, 17, 0.06), 0 4px 6px -1px rgba(14, 15, 17, 0.12)",
  overlay:
    "0 20px 65px -5px rgba(14, 15, 17, 0.06), 0 10px 20px -5px rgba(14, 15, 17, 0.06)",
} as const;

export const breakpoint = {
  sm: 375,
  md: 572,
  lg: 1025,
  xl: 1280,
  "2xl": 1601,
} as const;

export const layout = {
  navbarHeight: "5rem",
  navbarHeightCompact: "3.5rem",
  containerMax: "90rem",
  sidebarWidth: "18rem",
  controlHeight: "2.5rem",
  controlHeightSm: "2rem",
} as const;

/* Data gradient — Figma gradient style `Gradients/2 Color/17`. Figma exports it
   at -13.57deg with the stops reversed; CSS measures the angle from a different
   zero, so it converts to 76.4deg with the stops swapped. */
export const gradient = {
  data: `linear-gradient(76.4deg, ${color.blue650} 17.5%, ${color.sky400} 100%)`,
} as const;
