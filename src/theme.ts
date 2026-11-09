"use client";

import { createTheme } from "@mui/material/styles";

// Material UI theme. Colours mirror the CSS tokens in globals.css so MUI components and
// layout utilities look like one system. Contrast of text colours on white ≥ 4.5:1.
export const theme = createTheme({
  palette: {
    primary: { main: "#0e6b5c", dark: "#0a5246", light: "#e2f0ec", contrastText: "#ffffff" },
    secondary: { main: "#172033", contrastText: "#ffffff" },
    error: { main: "#b42318" },
    warning: { main: "#8a5a00" },
    success: { main: "#18753a" },
    info: { main: "#0e6b5c" },
    text: { primary: "#172033", secondary: "#5c6577" },
    background: { default: "#f6f4ef", paper: "#ffffff" },
    divider: "#e5e1d8",
  },
  typography: {
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
    h1: { fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 600 },
    h2: { fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 600 },
    h3: { fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 600 },
    h4: { fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 600 },
    h5: { fontFamily: "var(--font-fraunces), Georgia, serif", fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: "#e5e1d8" } },
    },
    MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
    MuiChip: { defaultProps: { size: "small" }, styleOverrides: { root: { fontWeight: 500 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12, alignItems: "flex-start" } } },
    MuiTooltip: { defaultProps: { arrow: true } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 500, minHeight: 44 } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 8 } } },
  },
});
