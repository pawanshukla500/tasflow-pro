import { Loader2 } from "lucide-react";

export function AppLoadingScreen({ message = "Loading your workspace…" }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-6 animate-in fade-in duration-300">
      <div className="relative animate-float">
        <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-ping [animation-duration:2s]" />
        <div className="relative w-16 h-16 rounded-2xl bg-white border shadow-lg flex items-center justify-center p-2 animate-pop">
          <img src="/youthnic-logo.svg" alt="" className="w-full h-full object-contain" width={48} height={48} decoding="async" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
          <Loader2 className="w-3.5 h-3.5 text-primary-foreground animate-spin" />
        </div>
      </div>
      <div className="text-center space-y-2 animate-rise [animation-delay:150ms]">
        <p className="text-sm font-medium text-foreground">TaskFlow Pro</p>
        <p className="text-xs text-muted-foreground">{message}</p>
        <div className="w-40 h-1 rounded-full bg-muted overflow-hidden mx-auto">
          <div className="h-full w-full animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
