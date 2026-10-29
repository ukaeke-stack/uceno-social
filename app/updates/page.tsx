'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type UpdateInfo = {
  available?: boolean;
  message?: string;
  error?: string;
  versionName?: string;
  versionCode?: number;
  downloadUrl?: string;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string | null;
  fileSize?: number | null;
  packageId?: string;
};

function formatSize(bytes?: number | null) {
  if (!bytes || bytes < 1) return '';
  return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + ' MB' : Math.ceil(bytes / 1024) + ' KB';
}

export default function UpdatesPage() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [installedVersion, setInstalledVersion] = useState('');
  const [installedCode, setInstalledCode] = useState(0);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      if (Capacitor.isNativePlatform()) {
        const appInfo = await App.getInfo();
        setInstalledVersion(appInfo.version || '');
        setInstalledCode(Number(appInfo.build) || 0);
      }
      const response = await fetch('/api/app-update', { cache: 'no-store' });
      const data = (await response.json()) as UpdateInfo;
      if (!response.ok) throw new Error(data.error || 'Could not check for updates.');
      setInfo(data);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check for updates.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  const updateAvailable = Boolean(info?.available && info.versionCode && installedCode > 0 && info.versionCode > installedCode);
  const alreadyCurrent = Boolean(info?.available && installedCode > 0 && info.versionCode && info.versionCode <= installedCode);

  return (
    <main style={{ minHeight: '100dvh', background: '#f6f7fb', color: '#182033', padding: '28px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 620, margin: '0 auto' }}>
        <Link href="/" style={{ color: '#4f46e5', textDecoration: 'none', fontWeight: 600 }}>← Back to UCENO</Link>
        <div style={{ marginTop: 22, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 22, padding: 24, boxShadow: '0 12px 36px rgba(20, 30, 60, .06)' }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, display: 'grid', placeItems: 'center', background: '#eef2ff', color: '#4338ca', fontSize: 27, fontWeight: 800 }}>U</div>
          <h1 style={{ fontSize: 28, lineHeight: 1.2, margin: '18px 0 8px' }}>UCENO app updates</h1>
          <p style={{ color: '#667085', lineHeight: 1.6, marginTop: 0 }}>Check for the latest Android version and install it without uninstalling your current app.</p>

          {checking ? <p role="status">Checking for updates…</p> : null}
          {error ? <p role="alert" style={{ color: '#b42318' }}>{error}</p> : null}
          {!checking && !error && info?.available === false ? <p>{info.message || 'No Android release is available yet.'}</p> : null}

          {info?.available && info.versionName ? (
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: 16, marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <strong>Latest release: {info.versionName}</strong>
                {updateAvailable ? <span style={{ color: '#047857', fontSize: 13, fontWeight: 700 }}>UPDATE AVAILABLE</span> : null}
                {alreadyCurrent ? <span style={{ color: '#047857', fontSize: 13, fontWeight: 700 }}>UP TO DATE</span> : null}
              </div>
              <p style={{ color: '#667085', fontSize: 14, marginBottom: 8 }}>Version code {info.versionCode}{formatSize(info.fileSize) ? ' · ' + formatSize(info.fileSize) : ''}</p>
              {installedVersion ? <p style={{ color: '#667085', fontSize: 14 }}>Installed: {installedVersion}{installedCode ? ' (code ' + installedCode + ')' : ''}</p> : <p style={{ color: '#667085', fontSize: 14 }}>Open this page inside the installed UCENO Android app to compare installed versions.</p>}
              {info.releaseNotes ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 14, marginTop: 12 }}>{info.releaseNotes}</div> : null}
              {info.publishedAt ? <p style={{ color: '#667085', fontSize: 12 }}>Published {new Date(info.publishedAt).toLocaleDateString()}</p> : null}
              {info.downloadUrl ? <a href={info.downloadUrl} style={{ display: 'block', textAlign: 'center', marginTop: 18, padding: '13px 16px', borderRadius: 12, background: '#4f46e5', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>{updateAvailable || !installedCode ? 'Download Android update' : 'Download APK'}</a> : null}
            </div>
          ) : null}

          <button onClick={() => void check()} disabled={checking} style={{ width: '100%', marginTop: 14, padding: 12, border: '1px solid #d0d5dd', borderRadius: 12, background: '#fff', color: '#344054', fontWeight: 600, cursor: checking ? 'wait' : 'pointer' }}>{checking ? 'Checking…' : 'Check again'}</button>
          <p style={{ color: '#667085', fontSize: 13, lineHeight: 1.6, marginTop: 18 }}>Android will ask you to approve installation. Keep the existing UCENO app installed; the update can install over it when the package ID and signing key match. Package ID: {info?.packageId || 'com.ukaeke.uceno'}.</p>
          <a href={info?.releaseUrl || 'https://github.com/ukaeke-stack/uceno-social/releases'} style={{ color: '#4f46e5', fontSize: 14 }}>View release history</a>
        </div>
      </section>
    </main>
  );
}
