import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseAuth } from "@/integrations/firebase/client";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";
import { AuthShell } from "@/components/AuthShell";
import { Lock, Eye, EyeOff, ArrowRight } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get("oobCode") || searchParams.get("code");
  const appToken = searchParams.get("token");

  useEffect(() => {
    if (appToken) {
      invokeEdgeFunction<{ valid?: boolean; email?: string }>("complete-password-reset", {
        body: { token: appToken, action: "verify" },
      })
        .then((data) => {
          if (data?.valid && data.email) {
            setEmail(data.email);
            setReady(true);
            setInvalid(false);
          } else {
            setReady(false);
            setInvalid(true);
          }
        })
        .catch(() => {
          setReady(false);
          setInvalid(true);
        });
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth || !oobCode) {
      setInvalid(true);
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((e) => {
        setEmail(e);
        setReady(true);
        setInvalid(false);
      })
      .catch(() => {
        setReady(false);
        setInvalid(true);
      });
  }, [oobCode, appToken]);

  const handleSubmit = async () => {
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (appToken) {
        await invokeEdgeFunction("complete-password-reset", {
          body: { token: appToken, password, action: "complete" },
        });
        toast({ title: "Password updated", description: "You can now sign in with your new password." });
        navigate("/login", { replace: true });
        return;
      }

      const auth = getFirebaseAuth();
      if (!auth || !oobCode) {
        toast({
          title: "Invalid link",
          description: "Request a new password reset from the login page.",
          variant: "destructive",
        });
        return;
      }
      await confirmPasswordReset(auth, oobCode, password);
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      navigate("/login", { replace: true });
    } catch (err: unknown) {
      toast({
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if ((!oobCode && !appToken) || invalid || !ready) {
    return (
      <AuthShell
        title="Link expired or invalid"
        subtitle="Password reset links expire after use or after a short time."
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Request a new branded reset email from the sign-in page. The email will include a secure button that opens this TaskFlow page.
          </p>
          <Button className="w-full h-11" onClick={() => navigate("/login")}>
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set new password"
      subtitle={email ? `For ${email}` : "Choose a strong password for your account."}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="new-password"
              type={showPassword ? "text" : "password"}
              className="pl-9 pr-9 h-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            className="h-11"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
        </div>
        <Button className="w-full h-11 text-base group/reset" onClick={handleSubmit} disabled={loading}>
          {loading ? "Updating…" : "Update password"}
          {!loading && <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover/reset:translate-x-1" />}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => navigate("/login")}>
          Back to sign in
        </Button>
      </div>
    </AuthShell>
  );
};

export default ResetPassword;
