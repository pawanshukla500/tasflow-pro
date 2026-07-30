import { ReactNode } from "react";
import { Shield, Lock } from "lucide-react";
import { BrandLogo, BrandLockup } from "@/components/BrandLogo";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** Soft UI auth chrome — matches Login (teal brand panel, theme-aware logo). */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden lg:flex lg:w-[48%] relative overflow-hidden text-primary-foreground p-10 xl:p-14 flex-col justify-between bg-primary">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(ellipse 80% 60% at 100% 0%, white, transparent 55%)",
            backgroundSize: "28px 28px, 100% 100%",
          }}
        />
        <div aria-hidden className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute top-1/3 -right-20 h-64 w-64 rounded-full bg-black/10 blur-3xl" />

        <div className="relative z-10">
          <BrandLockup
            size="md"
            tone="onBrand"
            invertedText
            subtitle="Secure account recovery"
          />
        </div>

        <div className="relative z-10 space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white/15 backdrop-blur text-sm font-medium ring-1 ring-white/20">
            <Shield className="w-4 h-4" aria-hidden />
            Protected reset flow
          </div>
          <h2 className="font-display text-3xl xl:text-4xl font-bold leading-[1.15] tracking-tight text-balance">
            Your workspace, protected.
          </h2>
          <p className="text-base text-primary-foreground/85 leading-relaxed">
            Reset links open on TaskFlow Pro — the same branded experience as the rest of your app.
          </p>
        </div>

        <p className="relative z-10 text-xs text-primary-foreground/55">
          © {new Date().getFullYear()} TaskFlow Pro
        </p>
      </aside>

      <main className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 100% 0%, hsl(var(--primary) / 0.08), transparent 55%)",
          }}
        />
        <div className="relative w-full max-w-[420px]">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <BrandLogo size="xl" tone="auto" className="mb-3" />
            <h1 className="font-display text-xl font-bold tracking-tight">TaskFlow Pro</h1>
          </div>
          <div className="mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 ring-1 ring-primary/15">
              <Lock className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-page-desc mt-1.5">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
