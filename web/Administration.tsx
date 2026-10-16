// File: /web/Administration.tsx | Version: 0.1.2
import { useEffect, useRef, useState } from 'react';
import { Archive, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, Save, ShieldOff, Trash2, Wifi, X } from 'lucide-react';
import type { User } from '../src/identity.js';
import type { BackupJob, BackupPublicConfig } from '../src/backups.js';
import type { SystemProps } from './System.js';
import { copy as text } from './copy.js';

type Props = Pick<SystemProps, 'token' | 'call'> & { disabled: boolean };
type UserDraft = Pick<User, 'username' | 'name' | 'role' | 'products' | 'enabled'>;
type Token = { id: string; name: string; created_at: string; expires_at: number };
const emptyUser = (): UserDraft => ({ username: '', name: '', role: 'reader', products: [], enabled: true });
export function Users({ token, call, disabled }: Props) {
  const [users, setUsers] = useState<User[]>([]); const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<string | null>(null); const [draft, setDraft] = useState<UserDraft>(emptyUser);
  const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [tokens, setTokens] = useState<Token[]>([]); const [tokenName, setTokenName] = useState(''); const [tokenDays, setTokenDays] = useState(90); const [issued, setIssued] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const load = async () => {
    const [nextUsers, nextProducts] = await Promise.all([call<User[]>(token, '/api/v1/admin/users'), call<typeof products>(token, '/api/v1/admin/products')]);
    setUsers(nextUsers); setProducts(nextProducts);
  };
  useEffect(() => { void load().catch((failure: unknown) => setError(failure instanceof Error ? failure.message : text.connectionError)); }, [token, call]);
  useEffect(() => { if (editing !== null) dialog.current?.showModal(); }, [editing]);
  const run = async (task: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await task(); } catch (failure) { setError(failure instanceof Error ? failure.message : text.connectionError); } finally { setBusy(false); } };
  const close = () => { setEditing(null); setPassword(''); setIssued(''); setTokens([]); };
  const open = (user?: User) => {
    setDraft(user ? { username: user.username, name: user.name, role: user.role, products: user.products, enabled: user.enabled } : emptyUser());
    setEditing(user?.id ?? ''); setPassword(''); setIssued(''); setError(''); setNotice(''); setTokens([]);
    if (user) void call<Token[]>(token, `/api/v1/admin/users/${user.id}/tokens`).then(setTokens).catch(() => setError(text.connectionError));
  };
  return <section className="admin-section">
    <div className="section-heading"><h2>{text.users}</h2><button disabled={disabled || busy} onClick={() => open()}><Plus size={16} />{text.createUser}</button></div>
    {editing === null && error && <div className="banner error" role="alert">{error}</div>}
    {editing === null && notice && <div className="banner success" role="status">{notice}</div>}
    <div className="admin-list">{users.map((user) => <div className="admin-row" key={user.id}>
      <div><strong>{user.name}</strong><span className="mono">{user.username}</span></div><span>{user.role}</span><span>{user.enabled ? text.enabled : text.disabled}</span>
      <button className="icon-button" title={text.editUser} aria-label={`${text.editUser}: ${user.username}`} disabled={disabled || busy} onClick={() => open(user)}><Pencil size={16} /></button>
    </div>)}</div>
    {editing !== null && <dialog ref={dialog} aria-label={editing ? text.editUser : text.createUser} onCancel={close}>
      <div className="dialog-header"><h2>{editing ? text.editUser : text.createUser}</h2><button className="icon-button" onClick={close} title={text.close} aria-label={text.close}><X size={18} /></button></div>
      {error && <div className="banner error" role="alert">{error}</div>}{notice && <div className="banner success" role="status">{notice}</div>}
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
        await call(token, editing ? `/api/v1/admin/users/${editing}` : '/api/v1/admin/users', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(editing ? draft : { ...draft, password }) });
        await load(); close(); setNotice(text.userSaved);
      }); }}><fieldset disabled={busy || disabled} className="system-controls">
        <div className="field-grid"><label>{text.username}<input required minLength={3} maxLength={64} pattern="[a-z0-9][a-z0-9._-]{2,63}" autoComplete="off" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} /></label>
        <label>{text.name}<input required maxLength={100} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>{text.role}<select value={draft.role} onChange={(event) => { const role = event.target.value as User['role']; setDraft({ ...draft, role, products: role === 'admin' ? [] : draft.products }); }}><option value="admin">Admin</option><option value="publisher">Publisher</option><option value="reader">Reader</option></select></label></div>
        <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />{text.enabled}</label>
        {draft.role !== 'admin' && <fieldset className="grant-list"><legend>{text.productGrants}</legend>{products.map((product) => <label className="checkbox-label" key={product.id}><input type="checkbox" checked={draft.products.includes(product.id)} onChange={(event) => setDraft({ ...draft, products: event.target.checked ? [...draft.products, product.id] : draft.products.filter((id) => id !== product.id) })} />{product.name}</label>)}</fieldset>}
        {!editing && <label>{text.password}<input type="password" minLength={15} maxLength={256} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        <button className="primary"><Save size={16} />{text.saveUser}</button>
      </fieldset></form>
      {editing && <>
        <form className="admin-subsection" onSubmit={(event) => { event.preventDefault(); void run(async () => {
          await call(token, `/api/v1/admin/users/${editing}/password`, { method: 'PUT', body: JSON.stringify({ password }) }); setPassword(''); setNotice(text.passwordReset);
        }); }}><fieldset disabled={busy || disabled} className="system-controls"><h3>{text.resetPassword}</h3><label>{text.newPassword}<input type="password" minLength={15} maxLength={256} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button><KeyRound size={16} />{text.resetPassword}</button></fieldset></form>
        <div className="admin-subsection"><button disabled={busy || disabled} onClick={() => { void run(async () => { await call(token, `/api/v1/admin/users/${editing}/sessions`, { method: 'DELETE' }); setNotice(text.sessionsRevoked); }); }}><ShieldOff size={16} />{text.revokeSessions}</button></div>
        <form className="admin-subsection" onSubmit={(event) => { event.preventDefault(); void run(async () => {
          const value = await call<{ token: string }>(token, `/api/v1/admin/users/${editing}/tokens`, { method: 'POST', body: JSON.stringify({ name: tokenName, days: tokenDays }) });
          setIssued(value.token); setTokenName(''); setTokens(await call<Token[]>(token, `/api/v1/admin/users/${editing}/tokens`));
        }); }}><fieldset disabled={busy || disabled} className="system-controls"><h3>{text.apiTokens}</h3><div className="field-grid"><label>{text.tokenName}<input maxLength={100} required value={tokenName} onChange={(event) => setTokenName(event.target.value)} /></label><label>{text.expiryDays}<input type="number" min={1} max={365} required value={tokenDays} onChange={(event) => setTokenDays(Number(event.target.value))} /></label></div><button><Plus size={16} />{text.issueToken}</button></fieldset></form>
        {issued && <label className="issued-token">{text.issuedToken}<input readOnly autoComplete="off" value={issued} onFocus={(event) => event.target.select()} /><button onClick={() => setIssued('')}><X size={16} />{text.dismissToken}</button></label>}
        {tokens.map((entry) => <div className="admin-row" key={entry.id}><span>{entry.name}</span><time>{new Date(entry.expires_at).toLocaleDateString()}</time><button className="icon-button" title={text.revokeToken} aria-label={`${text.revokeToken}: ${entry.name}`} disabled={busy || disabled} onClick={() => { void run(async () => { await call(token, `/api/v1/admin/users/${editing}/tokens/${entry.id}`, { method: 'DELETE' }); setTokens(tokens.filter((item) => item.id !== entry.id)); }); }}><Trash2 size={16} /></button></div>)}
      </>}
    </dialog>}
  </section>;
}
type BackupStatus = { available: boolean; agent_ready: boolean; settings: BackupPublicConfig | null; job: BackupJob | null };
type BackupDraft = Omit<BackupPublicConfig, 'password_set' | 'recovery_password_set'>;
const initialBackup: BackupDraft = { enabled: false, host: '', share: '', directory: 'device-update-hub', username: '', domain: '', smb3_only: true, utc_time: '02:00', daily: 7, weekly: 4, monthly: 6 };
export function BackupSettings({ token, call, disabled }: Props) {
  const [status, setStatus] = useState<BackupStatus | null>(null); const [draft, setDraft] = useState(initialBackup); const [loaded, setLoaded] = useState(false);
  const [password, setPassword] = useState(''); const [recovery, setRecovery] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const value = await call<BackupStatus>(token, '/api/v1/admin/backups'); if (!active) return; setStatus(value); if (!loaded && value.settings) { setDraft(value.settings); setConfirmed(value.settings.smb3_only); setLoaded(true); } }
      catch (failure) { if (active) setError(failure instanceof Error ? failure.message : text.connectionError); }
      if (active) timer = setTimeout(() => { void poll(); }, 3000);
    };
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, [token, call, loaded]);
  const mutate = <Key extends keyof BackupDraft>(key: Key, value: BackupDraft[Key]) => { setDraft({ ...draft, [key]: value }); setDirty(true); setNotice(''); };
  const run = async (task: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await task(); } catch (failure) { setError(failure instanceof Error ? failure.message : text.connectionError); } finally { setBusy(false); } };
  const jobBusy = status?.job?.state === 'queued' || status?.job?.state === 'running' || status?.job?.state === 'recovery_required';
  return <section className="admin-section"><h2>{text.backups}</h2>
    {error && <div className="banner error" role="alert">{error}</div>}{notice && <div className="banner success" role="status">{notice}</div>}
    {status && !status.available && <p className="release-notes">{text.backupUnavailable}</p>}
    {status?.available && <>
      <dl className="metadata"><div><dt>{text.agentStatus}</dt><dd>{status.agent_ready ? text.ready : text.unavailable}</dd></div></dl>
      {status.job && <div className={`banner ${status.job.state === 'failed' || status.job.state === 'recovery_required' ? 'error' : 'success'}`} role="status">{jobBusy && <LoaderCircle size={16} />}<span>{text.backupStates[status.job.state]} · {status.job.message}</span><time>{new Date(status.job.at).toLocaleString()}</time></div>}
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
        const { password_set: ignoredPassword, recovery_password_set: ignoredRecovery, ...clean } = draft as BackupPublicConfig;
        void ignoredPassword; void ignoredRecovery;
        const value = await call<BackupPublicConfig>(token, '/api/v1/admin/backups', { method: 'PUT', body: JSON.stringify({ ...clean, ...(password ? { password } : {}), ...(recovery ? { recovery_password: recovery } : {}) }) });
        setStatus({ ...status, settings: value }); setPassword(''); setRecovery(''); setConfirmed(value.smb3_only); setDirty(false); setLoaded(true); setNotice(text.settingsSaved);
      }); }}><fieldset className="system-controls" disabled={disabled || busy || jobBusy}>
        <label className="checkbox-label"><input type="checkbox" checked={draft.enabled} onChange={(event) => mutate('enabled', event.target.checked)} />{text.scheduledBackups}</label>
        <div className="field-grid"><label>{text.nasAddress}<input required value={draft.host} onChange={(event) => mutate('host', event.target.value)} /></label><label>{text.smbShare}<input required maxLength={64} value={draft.share} onChange={(event) => mutate('share', event.target.value)} /></label><label>{text.backupDirectory}<input required maxLength={64} value={draft.directory} onChange={(event) => mutate('directory', event.target.value)} /></label></div>
        <div className="field-grid"><label>{text.smbUsername}<input autoComplete="off" required value={draft.username} onChange={(event) => mutate('username', event.target.value)} /></label><label>{text.smbDomain}<input value={draft.domain} onChange={(event) => mutate('domain', event.target.value)} /></label><label>{text.smbPassword}<input type="password" autoComplete="new-password" required={!status.settings?.password_set} value={password} onChange={(event) => { setPassword(event.target.value); setDirty(true); }} /></label></div>
        <label className="checkbox-label"><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{text.confirmSmb3}</label>
        <label>{text.recoveryPassword}<input type="password" minLength={16} maxLength={256} autoComplete="new-password" required={!status.settings?.recovery_password_set} value={recovery} onChange={(event) => { setRecovery(event.target.value); setDirty(true); }} /></label>
        <label className="checkbox-label"><input type="checkbox" required />{text.recoverySaved}</label>
        <div className="field-grid"><label>{text.backupTime}<input type="time" required value={draft.utc_time} onChange={(event) => mutate('utc_time', event.target.value)} /></label>{([['daily', text.keepDaily, 1, 365], ['weekly', text.keepWeekly, 0, 52], ['monthly', text.keepMonthly, 0, 120]] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} required value={draft[key]} onChange={(event) => mutate(key, Number(event.target.value))} /></label>)}</div>
        <button className="primary"><Save size={16} />{text.saveBackup}</button>
      </fieldset></form>
      <div className="admin-actions">{(['test', 'backup'] as const).map((kind) => <button key={kind} disabled={disabled || busy || jobBusy || dirty || !status.settings || !status.agent_ready} onClick={() => { void run(async () => {
        const job = await call<BackupJob>(token, `/api/v1/admin/backups/${kind}`, { method: 'POST' }); setStatus({ ...status, job });
      }); }}>{kind === 'test' ? <Wifi size={16} /> : <Archive size={16} />}{kind === 'test' ? text.testConnection : text.backupNow}</button>)}<button disabled={busy} onClick={() => { void run(async () => setStatus(await call<BackupStatus>(token, '/api/v1/admin/backups'))); }}><RefreshCw size={16} />{text.refresh}</button></div>
    </>}
  </section>;
}
export function Account({ token, call, disabled }: Props) {
  const [current, setCurrent] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <section className="admin-section"><h1>{text.account}</h1>{error && <div className="banner error" role="alert">{error}</div>}
    <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); void call(token, '/api/v1/account/password', { method: 'PUT', body: JSON.stringify({ current_password: current, password }) })
      .then(() => { window.location.reload(); }).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : text.connectionError)).finally(() => setBusy(false)); }}>
      <fieldset className="system-controls" disabled={disabled || busy}><label>{text.currentPassword}<input type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></label><label>{text.newPassword}<input type="password" autoComplete="new-password" minLength={15} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="primary"><KeyRound size={16} />{text.changePassword}</button></fieldset>
    </form>
  </section>;
}