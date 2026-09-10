import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Bot, Copy, Check, Trash2, Plus, KeyRound } from "lucide-react";
import {
  type McpToken,
  issueMcpToken,
  listMcpTokens,
  mcpClientSnippets,
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

function ConfigBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <CopyButton value={value} label="Copy" />
      </div>
      <pre className="p-3 rounded-md bg-muted overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap">
        {value}
      </pre>
    </div>
  );
}

export function McpTokensPanel() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Cursor");
  const [expiry, setExpiry] = useState("90");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [client, setClient] = useState("cursor");

  const url = mcpServerUrl();
  const snippets = mcpClientSnippets(url, newToken || "YOUR_TOKEN");

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
      toast.error("Give the token a name (e.g. 'Cursor')");
      return;
    }
    setCreating(true);
    try {
      const days = Number(expiry);
      const { token } = await issueMcpToken(name.trim(), days);
      setNewToken(token);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg bg-primary/10 border flex items-center justify-center shrink-0">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">AI connections (MCP)</h2>
          <p className="text-xs text-muted-foreground">
            Authenticate Cursor, Claude Code, or Google Antigravity as <strong>your</strong> TaskFlow
            account. Every tool call uses your role and permissions.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-background/50 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">What this does</p>
        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
          <li>
            When you start work, the agent calls <code className="font-mono">sync_coding_work</code>: it
            creates the TaskFlow project if needed, creates a proper task, and assigns it to you.
          </li>
          <li>
            It keeps that task updated (in progress / in review / done) as you go.
          </li>
          <li>
            Docs, git, pull requests, and GitHub Actions stay in the coding tool. TaskFlow cannot merge
            PRs or run CI — ask Cursor / Claude / Antigravity to do that with git and gh.
          </li>
          <li>
            Put the token in a <strong>user-level</strong> config (not a git-tracked project file).
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <Label>MCP Server URL</Label>
        <div className="flex items-center gap-2">
          <Input value={url} readOnly className="font-mono text-xs" />
          <CopyButton value={url} />
        </div>
      </div>

      <Tabs
        value={client}
        onValueChange={(v) => {
          setClient(v);
          const names: Record<string, string> = {
            cursor: "Cursor",
            claude: "Claude Code",
            antigravity: "Antigravity",
            desktop: "Claude Desktop",
          };
          if (!newToken) setName(names[v] || "Cursor");
        }}
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="claude">Claude Code</TabsTrigger>
          <TabsTrigger value="antigravity">Antigravity</TabsTrigger>
          <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
        </TabsList>

        <TabsContent value="cursor" className="rounded-lg border bg-background/50 p-4 space-y-3">
          <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
            <li>Generate a token below and copy it (shown once).</li>
            <li>
              Cursor → Settings → MCP → add a server, or edit <code className="font-mono">~/.cursor/mcp.json</code>
              {" "}(user config, not the project file).
            </li>
            <li>Paste the JSON, replace <code className="font-mono">YOUR_TOKEN</code>, restart Cursor.</li>
            <li>In a chat, ask it to start work on this repo — it should create your TaskFlow project and a task assigned to you.</li>
          </ol>
          <ConfigBlock title="~/.cursor/mcp.json" value={snippets.cursor} />
        </TabsContent>

        <TabsContent value="claude" className="rounded-lg border bg-background/50 p-4 space-y-3">
          <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
            <li>Generate a token below and copy it.</li>
            <li>Run the CLI command in a terminal (user scope, works in every project).</li>
            <li>Or paste the JSON into Claude Code user MCP config / a private <code className="font-mono">.mcp.json</code>.</li>
            <li>Run <code className="font-mono">claude mcp list</code>, then ask it to start work on this repo so it creates your project and a task assigned to you.</li>
          </ol>
          <ConfigBlock title="Terminal (recommended)" value={snippets.claudeCodeCli} />
          <ConfigBlock title="JSON" value={snippets.claudeCodeJson} />
        </TabsContent>

        <TabsContent value="antigravity" className="rounded-lg border bg-background/50 p-4 space-y-3">
          <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
            <li>Generate a token below and copy it.</li>
            <li>
              Antigravity agent panel → … → MCP Servers → Manage → View raw config
              {" "}(<code className="font-mono">~/.gemini/config/mcp_config.json</code>).
            </li>
            <li>
              Paste the JSON. Antigravity uses <code className="font-mono">serverUrl</code>, not{" "}
              <code className="font-mono">url</code>.
            </li>
            <li>Save and refresh MCP servers, then ask it to start work on this repo so it creates your project and a task assigned to you.</li>
          </ol>
          <ConfigBlock title="~/.gemini/config/mcp_config.json" value={snippets.antigravity} />
        </TabsContent>

        <TabsContent value="desktop" className="rounded-lg border bg-background/50 p-4 space-y-3">
          <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
            <li>Generate a token below and copy it.</li>
            <li>Claude Desktop → Settings → Developer → Edit Config.</li>
            <li>Paste JSON, keep the word Bearer, fully quit and reopen Claude.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Don&apos;t use Connectors → Connect — that path needs OAuth and will fail with a token.
          </p>
          <ConfigBlock title="macOS / Linux" value={snippets.claudeDesktopUnix} />
          <ConfigBlock title="Windows" value={snippets.claudeDesktopWindows} />
        </TabsContent>
      </Tabs>

      <ConfigBlock title="Paste into Cursor / Claude / Antigravity user rules" value={snippets.agentRule} />

      {newToken && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Copy your token now</p>
          </div>
          <p className="text-xs text-muted-foreground">
            This is the only time the full token is shown. The configs above already include it until you
            dismiss this box.
          </p>
          <div className="flex items-center gap-2">
            <Input value={newToken} readOnly className="font-mono text-xs" />
            <CopyButton value={newToken} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNewToken(null)}>
            Done
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-background/50 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-2">
            <Label>New token name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cursor"
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
