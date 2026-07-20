import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { sendPasswordResetEmail } from "@/lib/passwordReset";
import {
  Eye, EyeOff, Mail, Lock, User, Building2, Globe, Shield, Zap, Workflow, Sparkles, Target, Rocket, Sun, Coffee, ArrowRight,
} from "lucide-react";

const DAILY_THEMES = [
  { gradient: "from-indigo-600 via-violet-600 to-purple-700", icon: Rocket, headline: "Launch your organization with clarity.", sub: "Enterprise task management built for teams that ship.", tag: "Monday Mode" },
  { gradient: "from-blue-600 via-cyan-600 to-teal-600", icon: Target, headline: "Multi-tenant. Secure. Scalable.", sub: "Your data, your domain, your workflow.", tag: "Tuesday Focus" },
  { gradient: "from-emerald-600 via-teal-600 to-cyan-700", icon: Workflow, headline: "Workflows that move work forward.", sub: "From tasks to approvals — all in one place.", tag: "Wednesday Flow" },
  { gradient: "from-amber-500 via-orange-600 to-rose-600", icon: Zap, headline: "Daily digests. Zero surprises.", sub: "Automated summaries keep every team member aligned.", tag: "Thursday Drive" },
  { gradient: "from-fuchsia-600 via-pink-600 to-rose-600", icon: Sparkles, headline: "Premium experience. Enterprise power.", sub: "Built for commercial deployment and resale.", tag: "Friday Finish" },
  { gradient: "from-sky-600 via-blue-600 to-indigo-700", icon: Sun, headline: "Your workspace. Your rules.", sub: "Custom domains, roles, and permissions.", tag: "Saturday Calm" },
  { gradient: "from-slate-700 via-gray-700 to-zinc-800", icon: Coffee, headline: "Production-ready SaaS.", sub: "Firebase Auth + secure Postgres backend.", tag: "Sunday Reset" },
];

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

  const todayTheme = useMemo(() => DAILY_THEMES[new Date().getDay()], []);
  const TodayIcon = todayTheme.icon;

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
          description: "This email exists in Firebase with a different password. Use Forgot password or delete the user in Firebase Console → Authentication.",
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
      <div className={`hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-to-br ${todayTheme.gradient} animate-gradient text-white p-12 flex-col justify-between`}>
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 25% 25%, white 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }} />
        {/* Floating glow orbs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl animate-float-slow" />
        <div className="absolute bottom-10 -left-20 w-72 h-72 rounded-full bg-white/10 blur-3xl animate-float [animation-delay:2s]" />
        <div className="relative z-10 flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-700">
          <div className="w-12 h-12 rounded-2xl bg-white/95 flex items-center justify-center p-2 shadow-xl">
            <img src="/youthnic-logo.svg" width={48} height={48} decoding="async" alt="TaskFlow Pro" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="font-bold text-xl tracking-tight">TaskFlow Pro</p>
            <p className="text-sm opacity-80">Enterprise SaaS Platform</p>
          </div>
        </div>

        <div className="relative z-10 space-y-8 max-w-lg animate-in fade-in slide-in-from-left-6 duration-1000 delay-150">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur text-sm font-medium border border-white/20 animate-pop [animation-delay:300ms]">
            <TodayIcon className="w-4 h-4 animate-float [animation-duration:3s]" />
            {todayTheme.tag}
          </div>
          <h2 className="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">{todayTheme.headline}</h2>
          <p className="opacity-90 text-lg leading-relaxed">{todayTheme.sub}</p>
          <div className="grid gap-3 pt-2">
            {[
              { icon: Building2, text: "Multi-tenant organization management" },
              { icon: Shield, text: "Firebase Authentication + role-based access" },
              { icon: Mail, text: "Automated daily task digests" },
            ].map(({ icon: Icon, text }, i) => (
              <div key={text} className="flex items-center gap-3 text-sm animate-rise" style={{ animationDelay: `${500 + i * 130}ms` }}>
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center transition-transform hover:scale-110">
                  <Icon className="w-4 h-4" />
                </div>
                {text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs opacity-60">© {new Date().getFullYear()} TaskFlow Pro. Enterprise-ready SaaS.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white border shadow-sm flex items-center justify-center p-2 mb-3 animate-pop animate-float [animation-duration:4s]">
              <img src="/youthnic-logo.svg" width={48} height={48} decoding="async" alt="TaskFlow Pro" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-xl font-bold animate-rise [animation-delay:120ms]">TaskFlow Pro</h1>
          </div>

          {!forgotOpen ? (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight">Welcome</h2>
                <p className="text-sm text-muted-foreground mt-1">Sign in or register your organization.</p>
              </div>

              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-11">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="register">Register Org</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Work email</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input id="signin-email" type="email" placeholder="returnorders@vbexports.co.in" className="pl-9 h-11"
                        value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">Password</Label>
                      <button type="button" onClick={() => { setResetEmail(email); setForgotOpen(true); }}
                        className="text-xs text-primary hover:underline">Forgot password?</button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input id="signin-password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                        className="pl-9 pr-9 h-11" value={password} onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSignIn()} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button className="w-full h-11 text-base press-scale group/signin hover:shadow-lg hover:shadow-primary/30" onClick={handleSignIn} disabled={loading}>
                    {loading ? "Signing in…" : "Sign In"}
                    {!loading && <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover/signin:translate-x-1" />}
                  </Button>
                </TabsContent>

                <TabsContent value="register" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Organization name</Label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="VB Exports" className="pl-9 h-11" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Domain type</Label>
                    <Select value={domainType} onValueChange={(v) => setDomainType(v as "custom" | "public")}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom domain (e.g. vbexports.co.in)</SelectItem>
                        <SelectItem value="public">Public email (gmail.com, etc.)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {domainType === "custom" && (
                    <div className="space-y-2">
                      <Label>Organization domain</Label>
                      <div className="relative">
                        <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input placeholder="vbexports.co.in" className="pl-9 h-11" value={orgDomain}
                          onChange={(e) => setOrgDomain(e.target.value.replace(/^@/, ""))} />
                      </div>
                      <p className="text-xs text-muted-foreground">Admin email must match this domain.</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Your name</Label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Admin name" className="pl-9 h-11" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Admin email</Label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input type="email" placeholder="returnorders@vbexports.co.in" className="pl-9 h-11"
                        value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" className="pl-9 pr-9 h-11"
                        value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                  </div>
                  <Button className="w-full h-11 text-base" onClick={handleOrgRegister} disabled={loading}>
                    {loading ? "Creating…" : "Create Organization"}
                  </Button>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Reset password</h2>
                <p className="text-sm text-muted-foreground mt-1">We'll send a branded reset email with a secure link to TaskFlow Pro.</p>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" className="h-11" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()} />
              </div>
              <Button className="w-full h-11" onClick={handleForgotPassword} disabled={resetLoading}>
                {resetLoading ? "Sending…" : "Send reset link"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setForgotOpen(false)}>Back</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
