"use client";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, errorMessage, setConsentHandler } from "@/lib/client/api";
import { Alert, Button } from "../ui";

export interface Me {
  mode: "supabase" | "local";
  user: { email: string; isAdmin: boolean; displayName: string };
  aiConfigured: boolean;
  aiConsentAt: string | null;
  aiDailyLimit: number;
  masterResumeConfirmed: boolean;
}

interface AccountValue {
  me: Me | null;
  refresh: () => Promise<void>;
  /** Ask for AI consent now (e.g. from Settings). Resolves true when granted. */
  askConsent: () => Promise<boolean>;
  setConsent: (consent: boolean) => Promise<void>;
}

const AccountContext = createContext<AccountValue | null>(null);

export function useAccount(): AccountValue {
  const v = useContext(AccountContext);
  if (!v) throw new Error("useAccount must be used inside AccountProvider");
  return v;
}

/** What AI processing involves, shown before the first AI request. */
export function AiDataNotice() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-2">
      <p>
        AI features (analysis, suggestions, cover letters, match scoring and AI text recognition) send the information needed for that step to{" "}
        <strong>Anthropic’s Claude API</strong>: your resume text, the job description, answers you give, and, only when you choose AI text recognition, the
        uploaded file itself.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Nothing is sent until you start an AI step yourself. Typing, saving and exporting never use AI.</li>
        <li>Job searches send only your keywords and location to the job boards, never your resume.</li>
        <li>Results are stored in your private account so the same request doesn’t need to be sent again.</li>
        <li>
          Anthropic handles API data under its commercial terms and privacy policy, which you can read at{" "}
          <a className="text-brand underline" href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noreferrer">
            anthropic.com/legal/privacy
          </a>
          .
        </li>
        <li>You can withdraw this in Settings at any time. Features that work without AI stay available.</li>
      </ul>
    </div>
  );
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let live = true;
    api<Me>("/api/me")
      .then((m) => live && setMe(m))
      .catch(() => live && setMe(null));
    return () => {
      live = false;
    };
  }, []);

  const askConsent = useCallback(() => {
    // A second request while the dialog is open waits for the same answer.
    return new Promise<boolean>((resolve) => {
      const prev = resolver.current;
      resolver.current = (ok) => {
        prev?.(ok);
        resolve(ok);
      };
      setErr(null);
      setAsking(true);
    });
  }, []);

  useEffect(() => setConsentHandler(askConsent), [askConsent]);

  const setConsent = useCallback(
    async (consent: boolean) => {
      await api("/api/account/consent", { body: { consent } });
      await refresh();
    },
    [refresh],
  );

  function finish(ok: boolean) {
    setAsking(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(ok);
  }

  async function agree() {
    setSaving(true);
    setErr(null);
    try {
      await setConsent(true);
      finish(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountContext.Provider value={{ me, refresh, askConsent, setConsent }}>
      {children}
      <Dialog open={asking} onClose={() => finish(false)} maxWidth="sm" fullWidth aria-labelledby="ai-consent-title">
        <DialogTitle id="ai-consent-title">Allow AI processing?</DialogTitle>
        <DialogContent>
          <AiDataNotice />
          {err && (
            <Alert kind="error" className="mt-3">
              {err}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => finish(false)}>Not now</Button>
          <Button variant="primary" loading={saving} onClick={agree}>
            Allow and continue
          </Button>
        </DialogActions>
      </Dialog>
    </AccountContext.Provider>
  );
}
