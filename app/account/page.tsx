"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, ShieldCheck, Sparkles } from "lucide-react";

export default function AccountPage() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [contactType, setContactType] = useState<"email" | "phone">("email");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    const payload = mode === "register"
      ? { displayName, handle, contactType, [contactType]: contact, password }
      : { identifier: contact, password };
    try {
      const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request could not be completed");
      setSuccess(mode === "register" ? "Account created. Your session is active." : "Signed in. Your session is active.");
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  return <main className="account-page">
    <div className="account-glow account-glow-a" /><div className="account-glow account-glow-b" />
    <header className="account-header">
      <Link className="account-brand" href="/"><span><Sparkles size={20} /></span>uceno<span className="account-dot">.</span></Link>
      <Link className="account-back" href="/"><ArrowLeft size={15} /> Back to feed</Link>
    </header>
    <section className="account-card">
      <div className="account-emblem"><Sparkles size={24} /></div>
      <span className="account-kicker">YOUR PEOPLE ARE HERE</span>
      <h1>{mode === "register" ? "Make this space yours." : "Good to have you back."}</h1>
      <p className="account-subtitle">{mode === "register" ? "Create your UCENO account and start building your corner of the internet." : "Sign in to pick up where your conversations left off."}</p>
      <div className="account-mode"><button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); setSuccess(""); }}>Create account</button><button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Sign in</button></div>
      <form className="account-form" onSubmit={submit}>
        {mode === "register" && <>
          <label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} required minLength={2} maxLength={70} autoComplete="name" placeholder="How people will know you" /></label>
          <label>Username<input value={handle} onChange={e => setHandle(e.target.value)} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" placeholder="letters, numbers or underscores" /><small>Your public handle, e.g. @yourname</small></label>
          <div className="account-contact-tabs"><button type="button" className={contactType === "email" ? "active" : ""} onClick={() => { setContactType("email"); setContact(""); }}>Email address</button><button type="button" className={contactType === "phone" ? "active" : ""} onClick={() => { setContactType("phone"); setContact(""); }}>Phone number</button></div>
        </>}
        <label>{mode === "login" ? "Email or phone number" : contactType === "email" ? "Email address" : "Phone number with country code"}<input value={contact} onChange={e => setContact(e.target.value)} required type={mode === "register" && contactType === "email" ? "email" : "text"} autoComplete="username" placeholder={mode === "register" && contactType === "phone" ? "+2348012345678" : mode === "login" ? "Email or +234…" : "you@example.com"} /></label>
        <label>Password<input value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "register" ? 10 : 1} maxLength={128} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>
        {error && <p className="account-error" role="alert">{error}</p>}
        {success && <p className="account-success" role="status"><Check size={15} /> {success}</p>}
        <button className="account-submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create my account" : "Sign in to UCENO"} <ArrowUpRight size={17} /></button>
      </form>
      <p className="account-legal"><ShieldCheck size={14} /> Your password is hashed before storage. Email/SMS verification is not yet enabled.</p>
    </section>
    <footer className="account-footer">A little more human, every day. <span>© 2026 UCENO</span></footer>
  </main>;
}
