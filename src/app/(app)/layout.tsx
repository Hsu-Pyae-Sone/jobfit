import { AccountProvider } from "@/components/account/AccountProvider";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AccountProvider>
      <AppShell>{children}</AppShell>
    </AccountProvider>
  );
}
