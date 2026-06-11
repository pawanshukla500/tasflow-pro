import { ReactNode } from "react";
import { Shield, Lock } from "lucide-react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-to-br from-fuchsia-600 via-pink-600 to-rose-600 text-white p-12 flex-col justify-between">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/95 flex items-center justify-center p-2 shadow-xl">
            <img src="/youthnic-logo.svg" alt="TaskFlow Pro" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="font-bold text-xl tracking-tight">TaskFlow Pro</p>
            <p className="text-sm opacity-80">Enterprise SaaS Platform</p>
          </div>
        </div>
        <div className="relative z-10 space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur text-sm font-medium border border-white/20">
            <Shield className="w-4 h-4" />
            Secure account recovery
          </div>
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Your workspace, protected.</h2>
          <p className="opacity-90 text-lg leading-relaxed">
            Reset links open on TaskFlow Pro — same branded experience as the rest of your app.
          </p>
        </div>
        <p className="relative z-10 text-xs opacity-60">© {new Date().getFullYear()} TaskFlow Pro · VB Exports</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white border shadow-sm flex items-center justify-center p-2 mb-3">
              <img src="/youthnic-logo.svg" alt="TaskFlow Pro" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl font-bold">TaskFlow Pro</h1>
          </div>
          <div className="mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
