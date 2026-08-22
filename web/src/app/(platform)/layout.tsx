import { AppShell } from "@/components/layout/AppShell";
import { PortfolioProvider } from "@/components/portfolio/PortfolioProvider";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortfolioProvider>
      <AppShell>{children}</AppShell>
    </PortfolioProvider>
  );
}
