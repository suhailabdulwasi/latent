import { useEffect, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryClient, setOwnerKey, getOwnerKey } from "@/lib/queryClient";
import { useOwner } from "@/hooks/use-data";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

export function OwnerLock() {
  const { owner, isLoading } = useOwner();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = () => { if (!queryClient.getQueryData<{ owner: boolean }>(["/api/owner"])?.owner) setOpen(true); };
    window.addEventListener("latent:owner-required", h);
    return () => window.removeEventListener("latent:owner-required", h);
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/api/owner`, { headers: { "x-owner-key": key.trim() } });
      const d = await r.json();
      if (!d.owner) { setErr("That key didn't match."); return; }
      setOwnerKey(key.trim());
      setOpen(false); setKey("");
      await queryClient.invalidateQueries();
    } catch { setErr("Couldn't reach the server."); } finally { setBusy(false); }
  }

  function lock() {
    setOwnerKey(null);
    queryClient.invalidateQueries();
  }

  if (isLoading && getOwnerKey()) return null;
  return (
    <>
      {owner ? (
        <Button size="sm" variant="ghost" onClick={lock} title="Lock editing" data-testid="button-lock">
          <LockOpen className="h-3.5 w-3.5 text-primary" /><span className="hidden sm:inline">Owner</span>
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="View-only. Unlock to edit" data-testid="button-unlock">
          <Lock className="h-3.5 w-3.5" /><span className="hidden sm:inline">View-only</span>
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Owner unlock</DialogTitle>
            <DialogDescription>This board is view-only for visitors. Enter the owner key to save roles, edit the pipeline, or change the profile.</DialogDescription>
          </DialogHeader>
          <form onSubmit={unlock} className="space-y-3">
            <Input type="password" autoComplete="current-password" placeholder="Owner key" value={key} onChange={(e) => setKey(e.target.value)} data-testid="input-owner-key" />
            {err && <p className="text-sm text-destructive" data-testid="text-owner-error">{err}</p>}
            <DialogFooter>
              <Button type="submit" disabled={!key.trim() || busy} data-testid="button-owner-submit">{busy ? "Checking…" : "Unlock"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
