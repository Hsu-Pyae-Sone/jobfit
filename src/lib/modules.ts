import { BarChart3, FileText, FolderOpen, KanbanSquare, Search, Settings, Target, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Main navigation, in the order shown in the sidebar. */
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", description: "Your job search at a glance, with prioritized next steps.", icon: BarChart3 },
  { href: "/profile", label: "Career Profile", description: "Your private master resume and career details, reused for every application.", icon: UserRound },
  { href: "/studio", label: "Resume Studio", description: "Tailor your resume and cover letter to a job, truthfully, then review and export.", icon: FileText },
  { href: "/search", label: "Job Explorer", description: "Real listings by city, country or region, ranked against your verified resume.", icon: Search },
  { href: "/match", label: "Match Analysis", description: "A transparent match score, the skills gaps that matter, and one-click application prep.", icon: Target },
  { href: "/tracker", label: "Application Tracker", description: "Spreadsheet, board and calendar views with reminders, statistics and exports.", icon: KanbanSquare },
  { href: "/library", label: "Saved Documents", description: "Reusable resume and cover letter templates, plus documents for each application.", icon: FolderOpen },
  { href: "/settings", label: "Settings", description: "AI and job-source connections, scoring weights and preferences.", icon: Settings },
];
