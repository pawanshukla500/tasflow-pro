import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type State = "loading" | "valid" | "already" | "invalid" | "success" | "error";

const Unsubscribe = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`${env.supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
      headers: { apikey: env.supabaseAnonKey },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) setState("invalid");
        else if (data.valid === false && data.reason === "already_unsubscribed") setState("already");
        else if (data.valid === true) setState("valid");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${env.supabaseUrl}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) setState("success");
      else if (data.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card rounded-2xl border shadow-sm p-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary text-primary-foreground font-bold mx-auto">VB</div>
        <h1 className="text-xl font-bold text-foreground">VB Exports TaskFlow</h1>

        {state === "loading" && (
          <div className="py-4">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-3">Validating your link…</p>
          </div>
        )}

        {state === "valid" && (
          <>
            <p className="text-sm text-muted-foreground">
              Click below to unsubscribe from TaskFlow notification emails. You can re-enable them anytime in your settings.
            </p>
            <Button onClick={confirm} disabled={submitting} className="w-full">
              {submitting ? "Processing…" : "Confirm unsubscribe"}
            </Button>
          </>
        )}

        {state === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
            <p className="text-sm text-foreground font-medium">You've been unsubscribed.</p>
            <p className="text-xs text-muted-foreground">You won't receive notification emails from TaskFlow anymore.</p>
          </>
        )}

        {state === "already" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-sm text-foreground font-medium">You're already unsubscribed.</p>
          </>
        )}

        {state === "invalid" && (
          <>
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <p className="text-sm text-foreground font-medium">This link is invalid or expired.</p>
          </>
        )}

        {state === "error" && (
          <>
            <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
            <p className="text-sm text-foreground font-medium">Something went wrong.</p>
            <Button variant="outline" onClick={() => location.reload()}>Try again</Button>
          </>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;
