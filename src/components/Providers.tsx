"use client";

import { ThemeProvider } from "@mui/material/styles";
import type { ReactNode } from "react";
import { theme } from "@/theme";

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
