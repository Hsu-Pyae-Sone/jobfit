import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Choose your password" };

export default function SetPasswordPage() {
  return <SetPasswordForm />;
}
