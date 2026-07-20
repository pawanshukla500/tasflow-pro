import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bot, Copy, Check, Trash2, Plus, KeyRound } from "lucide-react";
import {
  type McpToken,
  issueMcpToken,
  listMcpTokens,
  mcpServerUrl,
  revokeMcpToken,
} from "@/lib/mcpTokens";

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function McpTokensPanel() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  const url = mcpServerUrl();

  const refresh = async () => {
    try {
      setTokens(await listMcpTokens());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Give the token a name (e.g. 'Claude Desktop')");
      return;
    }
    setCreating(true);
    try {
      const days = Number(expiry);
      const { token } = await issueMcpToken(name.trim(), days);
      setNewToken(token);
      setName("");
      setExpiry("90");
      await refresh();
      toast.success("Token created — copy it now, it won't be shown again");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, label: string) => {
    if (!confirm(`Revoke "${label}"? Any AI client using it will lose access immediately.`)) return;
    try {
      await revokeMcpToken(id);
      await refresh();
      toast.success("Token revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke token");
    }
  };

  // Working Claude Desktop config: a static bearer token via the mcp-remote bridge.
  // (Claude's native "http" connector uses OAuth, which this token-based server doesn't implement.)
  const claudeSnippet = `{
  "mcpServers": {
    "taskflow-pro": {
      "command": "cmd",
      "args": [
        "/c", "npx", "-y", "mcp-remote",
        "${url}",
        "--header", "Authorization:\${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer YOUR_TOKEN" }
    }
  }
}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-primary/10 border flex items-center justify-center shrink-0">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">AI Connections (MCP)</h2>
          <p className="text-xs text-muted-foreground">
            Connect Claude, ChatGPT, or any MCP client to act on your tasks &amp; workflows. Access is
            limited to what your role allows.
          </p>
        </div>
      </div>

      {/* Server endpoint */}
      <div className="space-y-2">
        <Label>MCP Server URL</Label>
        <div className="flex items-center gap-2">
          <Input value={url} readOnly className="font-mono text-xs" />
          <CopyButton value={url} />
        </div>
      </div>

      {/* Always-available setup instructions for Claude Desktop */}
      <div className="rounded-lg border bg-background/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Connect Claude Desktop</p>
        <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
          <li>Generate a token below and copy it (shown only once).</li>
          <li>Claude Desktop → Settings → Developer → <strong>Edit Config</strong>.</li>
          <li>
            Paste the JSON below, replacing <code className="font-mono">YOUR_TOKEN</code> with your token
            (keep the word <code className="font-mono">Bearer</code> and the space).
          </li>
          <li>Save, fully quit Claude (system tray → Quit), then reopen.</li>
        </ol>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Config — works on Windows. On macOS/Linux remove <code className="font-mono">"cmd", "/c",</code>.
          </span>
          <CopyButton value={claudeSnippet} label="Copy config" />
        </div>
        <pre className="p-3 rounded-md bg-muted overflow-x-auto text-[11px] leading-relaxed">
          {claudeSnippet}
        </pre>
        <p className="text-xs text-muted-foreground">
          Don't use Claude's <strong>Connectors → Connect</strong> button — that path requires OAuth and
          won't work with a token.
        </p>
      </div>

      {/* Freshly minted token — shown once */}
      {newToken && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Copy your token now</p>
          </div>
          <p className="text-xs text-muted-foreground">
            This is the only time the full token is shown. Store it in your AI client's config.
          </p>
          <div className="flex items-center gap-2">
            <Input value={newToken} readOnly className="font-mono text-xs" />
            <CopyButton value={newToken} />
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Claude Desktop / config snippet
            </summary>
            <pre className="mt-2 p-3 rounded-md bg-muted overflow-x-auto text-[11px] leading-relaxed">
              {claudeSnippet.replace("YOUR_TOKEN", newToken)}
            </pre>
          </details>
          <Button variant="ghost" size="sm" onClick={() => setNewToken(null)}>
            Done
          </Button>
        </div>
      )}

      {/* Create new token */}
      <div className="rounded-lg border bg-background/50 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-2">
            <Label>New token name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Claude Desktop, ChatGPT"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <div className="space-y-2">
            <Label>Expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {creating ? "Generating…" : "Generate Token"}
        </Button>
      </div>

      {/* Existing tokens */}
      <div className="space-y-2">
        <Label>Active tokens</Label>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tokens yet.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {t.token_prefix}…
                    <span className="font-sans">
                      {" · "}
                      {t.last_used_at
                        ? `last used ${new Date(t.last_used_at).toLocaleDateString()}`
                        : "never used"}
                      {t.expires_at ? ` · expires ${new Date(t.expires_at).toLocaleDateString()}` : ""}
                    </span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleRevoke(t.id, t.name)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
