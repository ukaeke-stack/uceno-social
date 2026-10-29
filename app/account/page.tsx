"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";

type Mode = "choose" | "login" | "register";

export default function AccountPage() {
  const [mode, setMode] = useState<Mode>("choose");
  const [contactType, setContactType] = useState<"email" | "phone">("email");
  const [accountType, setAccountType] = useState<"person" | "page">("person");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(r => r.json()).then(data => {
      if (data.user) window.location.replace("/");
    }).catch(() => {});
  }, []);

  function choose(next: "login" | "register") {
    setMode(next); setError(""); setSuccess(""); setRecoveryNotice(""); setPassword(""); setShowPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    const payload = mode === "register"
      ? { displayName, handle, accountType, contactType, [contactType]: contact, password }
      : { identifier: contact.trim(), password };
    try {
      const response = await fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request could not be completed");
      setSuccess(mode === "register" ? "Account created. Opening your UCENO space…" : "Signed in. Opening your UCENO space…");
      window.setTimeout(() => window.location.assign("/"), 350);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  return <main className="account-page">
    <div className="account-glow account-glow-a" /><div className="account-glow account-glow-b" />
    <header className="account-header">
      <a className="account-brand" href="/account"><span><Sparkles size={20} /></span>uceno<span className="account-dot">.</span></a>
      {mode !== "choose" && <button className="account-back" type="button" onClick={() => { setMode("choose"); setError(""); setSuccess(""); }}><ArrowLeft size={15} /> Back</button>}
    </header>
    <section className="account-card">
      <div className="account-emblem"><Sparkles size={24} /></div>
      <span className="account-kicker">YOUR PEOPLE ARE HERE</span>
      {mode === "choose" ? <>
        <h1>Your world,<br />your people.</h1>
        <p className="account-subtitle">Join UCENO to share moments, join conversations, and connect with your community.</p>
        <div className="account-choice-actions">
          <button className="account-submit" type="button" onClick={() => choose("register")}>Create account <ArrowUpRight size={17} /></button>
          <button className="account-secondary" type="button" onClick={() => choose("login")}>Log in to UCENO <ArrowUpRight size={17} /></button>
        </div>
        <p className="account-legal"><ShieldCheck size={14} /> Your account keeps your UCENO space connected to you.</p>
      </> : <>
        <h1>{mode === "register" ? "Create your account." : "Welcome back."}</h1>
        <p className="account-subtitle">{mode === "register" ? "A few details, then your UCENO space is ready." : "Log in to continue to your UCENO space."}</p>
        <form className="account-form" onSubmit={submit}>
          {mode === "register" && <>
            <label>Account type<select value={accountType} onChange={e => setAccountType(e.target.value as "person" | "page")}><option value="person">Personal profile</option><option value="page">Page — business, creator or organization</option></select><small>Personal profiles can connect as mutuals and call after acceptance. Pages can be followed and messaged but cannot make personal calls.</small></label>
            <label>Display name<input value={displayName} onChange={e => setDisplayName(e.target.value)} required minLength={2} maxLength={70} autoComplete="name" placeholder={accountType === "page" ? "Page or organization name" : "How people will know you"} /></label>
            <label>Username<input value={handle} onChange={e => setHandle(e.target.value.replace(/^@/, ""))} required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" placeholder="letters, numbers or underscores" /><small>Your public handle, e.g. @yourname</small></label>
            <div className="account-contact-tabs"><button type="button" className={contactType === "email" ? "active" : ""} onClick={() => { setContactType("email"); setContact(""); }}>Email address</button><button type="button" className={contactType === "phone" ? "active" : ""} onClick={() => { setContactType("phone"); setContact(""); }}>Phone number</button></div>
          </>}
          <label>{mode === "login" ? "Email or phone number" : contactType === "email" ? "Email address" : "Phone number with country code"}<input value={contact} onChange={e => setContact(e.target.value)} required type={mode === "register" && contactType === "email" ? "email" : "text"} autoComplete="username" placeholder={mode === "register" && contactType === "phone" ? "+2348012345678" : mode === "login" ? "Email or +234…" : "you@example.com"} /></label>
          <label>Password<span className="account-password-wrap"><input value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "register" ? 10 : 1} maxLength={128} type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /><button type="button" className="account-password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          {mode === "login" && <button type="button" className="account-forgot" onClick={() => setRecoveryNotice("Password recovery is not available yet. Please contact UCENO support for help restoring access.")}>Forgot password?</button>}
          {recoveryNotice && <p className="account-recovery-note" role="status">{recoveryNotice}</p>}
          {error && <p className="account-error" role="alert">{error}</p>}
          {success && <p className="account-success" role="status"><Check size={15} /> {success}</p>}
          <button className="account-submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create my account" : "Log in"} <ArrowUpRight size={17} /></button>
        </form>
        <p className="account-switch">{mode === "register" ? "Already have an account?" : "New to UCENO?"} <button type="button" onClick={() => choose(mode === "register" ? "login" : "register")}>{mode === "register" ? "Log in" : "Create account"}</button></p>
        <p className="account-legal"><ShieldCheck size={14} /> Passwords are protected with secure hashing. Never share your password.</p>
      </>}
    </section>
    <footer className="account-footer">A little more human, every day. <span>© 2026 UCENO</span></footer>
  </main>;
}
