// File: /web/System.tsx | Version: 0.3.0
import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, Save } from 'lucide-react';
import type { AdminSettings } from '../src/contract.js';
import type { UpdateJob } from '../src/hub-update.js';
import { copy as text } from './copy.js';
import { BackupSettings, Users } from './Administration.js';

export type HubStatus = { enabled: boolean; agent_ready: boolean; current_version: string; job: UpdateJob | null };
export type SystemProps = { token: string; call: <Value>(token: string, path: string, init?: RequestInit) => Promise<Value>; onUpdating: (value: boolean) => void };
export function System({ token, call, onUpdating }: SystemProps) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [maximum, setMaximum] = useState(1024);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [hub, setHub] = useState<HubStatus | null>(null);
  const [release, setRelease] = useState<{ id: string; version: string; release_notes: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const waiting = submitting || hub?.job?.maintenance === true;
  const expectedVersion = useRef<string | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => { onUpdating(waiting); }, [waiting, onUpdating]);
  useEffect(() => { if (confirm) modal.current?.showModal(); }, [confirm]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await call<HubStatus>(token, '/api/v1/admin/hub-update', { signal: AbortSignal.timeout(5000) });
        if (!active) return;
        setHub(value); setDisconnected(false);
        if (value.job?.maintenance && expectedVersion.current === null) expectedVersion.current = value.job.version;
        if (value.job?.state === 'succeeded' && value.job.version === expectedVersion.current && value.current_version === value.job.version) {
          const health = await call<{ version: string; status: string }>(token, '/health', { signal: AbortSignal.timeout(5000) });
          if (active && health.status === 'ok' && health.version === value.job.version) { window.location.reload(); return; }
        }
      } catch { if (active) setDisconnected(true); }
      if (active) timer = setTimeout(() => { void poll(); }, 2000);
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [token, call]);
  useEffect(() => {
    let active = true;
    void call<AdminSettings>(token, '/api/v1/admin/settings').then((value) => {
      if (active) { setSettings(value); if (value.upload_max_bytes !== null) setMaximum(value.upload_max_bytes / 1048576); }
    }).catch(() => { if (active) setError(text.connectionError); });
    return () => { active = false; };
  }, [token, call]);
  return <>
    <section className="page-heading"><h1>{text.system}</h1></section>
    {error && <div className="banner error" role="alert">{error}</div>}
    {saved && <div className="banner success" role="status">{text.settingsSaved}</div>}
    <section className="hub-update">
      <h2>{text.hubUpdates}</h2>
      {hub && <dl className="metadata"><div><dt>{text.currentVersion}</dt><dd><code>{hub.current_version}</code></dd></div></dl>}
      {hub && !hub.enabled && <p className="release-notes">{text.updaterDisabled}</p>}
      {hub?.enabled && !hub.agent_ready && !waiting && <p className="release-notes">{text.updaterUnavailable}</p>}
      {hub?.job && <div className={`banner ${hub.job.state === 'failed' || hub.job.state === 'recovery_required' || hub.job.state === 'rolled_back' ? 'error' : 'success'}`} role="status"><span>{text.jobStates[hub.job.state]}: {hub.job.version}</span></div>}
      {waiting && <div className="update-wait" role="status">{hub?.job?.state !== 'recovery_required' && <LoaderCircle size={20} />}<span>{hub?.job?.state === 'recovery_required' ? text.operatorRecovery : disconnected ? text.waitingServer : submitting ? text.preparingUpdate : text.updateRunning}</span></div>}
      <button disabled={busy || waiting || !hub?.enabled} onClick={() => {
        setBusy(true); setError('');
        void call<{ release: typeof release }>(token, '/api/v1/admin/hub-update/check', { method: 'POST' })
          .then((value) => { setRelease(value.release); setChecked(true); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : text.connectionError)).finally(() => setBusy(false));
      }}><RefreshCw size={16} />{text.checkNow}</button>
      {checked && !release && <p className="release-notes">{text.noUpdate}</p>}
      {release && <div className="hub-candidate"><h3>{release.version}</h3><p className="release-notes">{release.release_notes}</p><button className="primary" disabled={busy || waiting || !hub?.agent_ready} onClick={() => setConfirm(true)}><Download size={16} />{text.installUpdate}</button></div>}
    </section>
    {settings && <form className="system-settings" onSubmit={(event) => {
      event.preventDefault(); setBusy(true); setSaved(false); setError('');
      void call<AdminSettings>(token, '/api/v1/admin/settings', { method: 'PUT', body: JSON.stringify(settings) })
        .then(setSettings).then(() => setSaved(true)).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : text.connectionError)).finally(() => setBusy(false));
    }}>
      <fieldset className="system-controls" disabled={busy || waiting}>
      <h2>{text.uploadSettings}</h2>
      <label className="checkbox-label"><input type="checkbox" checked={settings.upload_max_bytes !== null} onChange={(event) => { setSaved(false); setSettings({ ...settings, upload_max_bytes: event.target.checked ? Math.round(maximum * 1048576) : null }); }} />{text.limitUpload}</label>
      {settings.upload_max_bytes !== null && <label>{text.maximumUpload}<input type="number" min="1" step="1" required value={maximum} onChange={(event) => { const value = Number(event.target.value); setMaximum(value); setSaved(false); setSettings({ ...settings, upload_max_bytes: Math.round(value * 1048576) }); }} /></label>}
      <label>{text.uploadTimeout}<input type="number" min="1" max="86400" step="1" required value={settings.upload_timeout_seconds} onChange={(event) => { setSaved(false); setSettings({ ...settings, upload_timeout_seconds: Number(event.target.value) }); }} /></label>
      <button className="primary" disabled={busy}><Save size={16} />{text.saveSettings}</button>
      </fieldset>
    </form>}
    <Users token={token} call={call} disabled={waiting} />
    <BackupSettings token={token} call={call} disabled={waiting} />
    {confirm && release && <dialog ref={modal} aria-label={text.installUpdate} onCancel={() => setConfirm(false)}>
      <h2>{text.installUpdate}</h2><p className="confirmation">{text.confirmHubUpdate}</p><p className="mono">device-update-hub / {release.version}</p>
      <div className="dialog-actions"><button onClick={() => setConfirm(false)}>{text.cancel}</button><button className="primary" onClick={() => {
        setConfirm(false); setSubmitting(true); setError(''); expectedVersion.current = release.version;
        void call<UpdateJob>(token, '/api/v1/admin/hub-update/install', { method: 'POST', body: JSON.stringify({ release_id: release.id, confirmation: release.version }) })
          .then((job) => setHub((value) => value ? { ...value, job } : value))
          .catch((failure: unknown) => { expectedVersion.current = null; setError(failure instanceof Error ? failure.message : text.connectionError); }).finally(() => setSubmitting(false));
      }}><Download size={16} />{text.installUpdate}</button></div>
    </dialog>}
  </>;
}