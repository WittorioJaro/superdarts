"use client";

import { useState, useTransition } from "react";
import { inviteEmail, revokeInvite } from "./invite-actions";

export function InviteForm({ emails }: { emails: string[] }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const button = "h-11 rounded-xl bg-felt px-4 font-medium hover:bg-wire disabled:opacity-50";

  return (
    <section aria-labelledby="invites-heading" className="flex flex-col gap-4 rounded-3xl bg-cabinet p-5 sm:p-6">
      <div>
        <h2 id="invites-heading" className="font-display text-3xl font-bold">Invites</h2>
        <p className="text-dim">Allow friends to sign in with their Google account. Share the invite message yourself.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setMessage(null);
        start(async () => {
          try {
            const result = await inviteEmail(email);
            if (!result.ok) return setError(result.error);
            setEmail("");
            setMessage("Invite saved.");
          } catch {
            setError("Couldn't save the invite. Try again.");
          }
        });
      }}>
        <label className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-sm font-medium text-dim">Google email address</span>
          <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-xl border border-wire bg-ink px-4 outline-none focus:border-chalk" />
        </label>
        <button disabled={pending} className="h-11 rounded-xl bg-chalk px-5 font-medium text-ink disabled:opacity-50">Invite</button>
      </form>
      {error && <p role="alert" className="text-double">{error}</p>}
      <p role="status" className="text-sm text-dim">{message}</p>
      {emails.length === 0 ? <p className="text-dim">No invites yet.</p> : (
        <ul className="flex flex-col gap-3">
          {emails.map((invited) => (
            <li key={invited} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 break-all">{invited}</span>
              <button type="button" className={button} onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`Join me on Superdarts: ${window.location.origin}\nSign in with your Google account ${invited}.`);
                  setMessage(`Invite message copied for ${invited}.`);
                  setError(null);
                } catch {
                  setError("Couldn't copy. Share this app's URL and ask them to sign in with their invited Google account.");
                }
              }}>Copy message</button>
              <button type="button" className={button} disabled={pending} aria-label={`Revoke invite for ${invited}`} onClick={() => {
                setError(null);
                setMessage(null);
                start(async () => {
                  try {
                    const result = await revokeInvite(invited);
                    if (!result.ok) return setError(result.error);
                    setMessage(`Invite revoked for ${invited}.`);
                  } catch {
                    setError("Couldn't revoke the invite. Try again.");
                  }
                });
              }}>Revoke</button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-dim">Revoking removes invite access only. Environment allowlists still apply; an empty ALLOWED_EMAILS allows everyone.</p>
    </section>
  );
}
