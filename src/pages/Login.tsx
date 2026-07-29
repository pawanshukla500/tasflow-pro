import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { sendPasswordResetEmail } from "@/lib/passwordReset";
import {
  Eye, EyeOff, Mail, Lock, User, Building2, Globe, Shield, Workflow, ListTodo, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Product benefits only — no tech stack / infra copy on the login surface. */
const BENEFITS = [
  { icon: ListTodo, text: "Tasks, deadlines, and ownership in one place" },
  { icon: Workflow, text: "Cross-team workflows with clear handoffs" },
  { icon: Shield, text: "Roles and permissions that fit your org" },
] as const;

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgDomain, setOrgDomain] = useState("");
  const [domainType, setDomainType] = useState<"custom" | "public">("custom");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const { signIn, registerOrganizationWithAccount } = useAuth();
  const { toast } = useToast();

  const handleSignIn = async () => {
    if (!email || !password) {
      toast({ title: "Missing details", description: "Please enter email and password.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      toast({ title: "Sign in failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOrgRegister = async () => {
    if (!email || !password || !name || !orgName) {
      toast({ title: "Missing details", description: "Fill in all required fields.", variant: "destructive" });
      return;
    }
    if (domainType === "custom" && !orgDomain) {
      toast({ title: "Domain required", description: "Enter your organization domain (e.g. vbexports.co.in).", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await registerOrganizationWithAccount({
        email,
        password,
        name,
        orgName,
        domain: domainType === "custom" ? orgDomain : undefined,
        domainType,
        allowPublicEmail: domainType === "public",
      });
      toast({ title: "Organization created!", description: "Welcome to TaskFlow Pro." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("auth/wrong-password") || message.includes("INVALID_PASSWORD")) {
        toast({
          title: "Email already registered",
          description: "This email is already in use with a different password. Use Forgot password, or ask an admin to reset access.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Registration failed", description: message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) return;
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(resetEmail);
      toast({ title: "Reset link sent", description: `Check ${resetEmail} for password reset instructions.` });
      setForgotOpen(false);
      setResetEmail("");
    } catch (err: unknown) {
      toast({ title: "Couldn't send reset email", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Brand panel — Soft UI teal, product story only */}
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

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-md">
            <img src="/youthnic-logo.svg" width={40} height={40} decoding="async" alt="" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="font-display font-bold text-lg tracking-tight leading-none">TaskFlow Pro</p>
            <p className="text-xs text-primary-foreground/75 mt-1">Work management for teams</p>
          </div>
        </div>

        <div className="relative z-10 space-y-8 max-w-md">
          <div>
            <h1 className="font-display text-3xl xl:text-4xl font-bold leading-[1.15] tracking-tight text-balance">
              Clarity for every task, workflow, and handoff.
            </h1>
            <p className="mt-4 text-base text-primary-foreground/85 leading-relaxed">
              Keep your organization aligned — from daily tasks to cross-department workflows.
            </p>
          </div>
          <ul className="space-y-3">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                <span className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-primary-foreground/55">
          © {new Date().getFullYear()} TaskFlow Pro
        </p>
      </aside>

      {/* Auth form */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80 lg:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 100% 0%, hsl(var(--primary) / 0.08), transparent 55%)",
          }}
        />

        <div className="relative w-full max-w-[420px]">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-xl bg-card border border-border/80 shadow-sm flex items-center justify-center p-2 mb-3">
              <img src="/youthnic-logo.svg" width={40} height={40} decoding="async" alt="" className="w-full h-full object-contain" />
            </div>
            <h1 className="font-display text-xl font-bold tracking-tight">TaskFlow Pro</h1>
            <p className="text-xs text-muted-foreground mt-1">Work management for teams</p>
          </div>

          {!forgotOpen ? (
            <>
              <div className="mb-6">
                <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Welcome</h2>
                <p className="text-sm text-muted-foreground mt-1.5">Sign in to your workspace, or register a new organization.</p>
              </div>

              <div className="rounded-xl border border-border/80 bg-card p-5 sm:p-6 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.08)]">
                <Tabs defaultValue="signin" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-5 h-10 bg-muted/70">
                    <TabsTrigger value="signin" className="cursor-pointer text-sm">Sign In</TabsTrigger>
                    <TabsTrigger value="register" className="cursor-pointer text-sm">Register Org</TabsTrigger>
                  </TabsList>

                  <TabsContent value="signin" className="space-y-4 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Work email</Label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          id="signin-email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@company.com"
                          className="pl-9 h-11"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="signin-password">Password</Label>
                        <button
                          type="button"
                          onClick={() => { setResetEmail(email); setForgotOpen(true); }}
                          className="cursor-pointer text-xs font-medium text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          id="signin-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className="pl-9 pr-10 h-11"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      className="cursor-pointer w-full h-11 text-sm font-semibold group/signin"
                      onClick={handleSignIn}
                      disabled={loading}
                    >
                      {loading ? "Signing in…" : "Sign In"}
                      {!loading && (
                        <ArrowRight className="w-4 h-4 ml-2 transition-transform duration-200 group-hover/signin:translate-x-0.5" />
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="register" className="space-y-3.5 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="reg-org">Organization name</Label>
                      <div className="relative">
                        <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          id="reg-org"
                          placeholder="Your company"
                          className="pl-9 h-11"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Domain type</Label>
                      <Select value={domainType} onValueChange={(v) => setDomainType(v as "custom" | "public")}>
                        <SelectTrigger className="h-11 cursor-pointer"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom domain (e.g. company.com)</SelectItem>
                          <SelectItem value="public">Public email (gmail.com, etc.)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {domainType === "custom" && (
                      <div className="space-y-2">
                        <Label htmlFor="reg-domain">Organization domain</Label>
                        <div className="relative">
                          <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                          <Input
                            id="reg-domain"
                            placeholder="company.com"
                            className="pl-9 h-11"
                            value={orgDomain}
                            onChange={(e) => setOrgDomain(e.target.value.replace(/^@/, ""))}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Admin email must match this domain.</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Your name</Label>
                      <div className="relative">
                        <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          id="reg-name"
                          placeholder="Full name"
                          className="pl-9 h-11"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">Admin email</Label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          id="reg-email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@company.com"
                          className="pl-9 h-11"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password</Label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          id="reg-password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Min. 6 characters"
                          className="pl-9 pr-10 h-11"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button
                      className="cursor-pointer w-full h-11 text-sm font-semibold"
                      onClick={handleOrgRegister}
                      disabled={loading}
                    >
                      {loading ? "Creating…" : "Create Organization"}
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : (
            <div className={cn(
              "rounded-xl border border-border/80 bg-card p-5 sm:p-6 space-y-5",
              "shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.08)]",
            )}>
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight">Reset password</h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  We’ll email you a secure link to choose a new password.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  className="h-11"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                />
              </div>
              <Button className="cursor-pointer w-full h-11 font-semibold" onClick={handleForgotPassword} disabled={resetLoading}>
                {resetLoading ? "Sending…" : "Send reset link"}
              </Button>
              <Button variant="ghost" className="cursor-pointer w-full" onClick={() => setForgotOpen(false)}>
                Back to sign in
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Login;
