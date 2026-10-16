// File: /web/App.tsx | Version: 0.1.2
import { useDeferredValue, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Box, CheckCircle2, ChevronRight, CircleAlert, Download, FileCode2, FilePlus2, Folder, KeyRound, Layers3, LogOut, PackageCheck, Plus, Radio, RefreshCw, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import type { Artifact, Draft, Principal, Release, Target } from '../src/contract.js';
import { copy as text } from './copy.js';

type Product = { id: string; name: string };
type Event = { sequence: number; at: string; actor: string; action: string; resource: string };
type Manifest = { artifacts: (Artifact & { download_url: string })[]; version: string; [key: string]: unknown };
type CheckResult = { update_available: boolean; release?: { version: string; manifest_url: string } };
type View = 'releases' | 'products' | 'activity' | 'check';
const emptyTarget = (): Target => ({ device_type: '', os: '', architecture: '', hardware_revision: '', updater_protocol: 1 });
const api = '/api/v1';
function formatSize(size: number): string { return size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KiB` : `${(size / 1048576).toFixed(1)} MiB`; }
function date(value: string): string { return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
async function request<Value>(token: string, path: string, init: RequestInit = {}): Promise<Value> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { ...(init.body === undefined || init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers, Authorization: `Bearer ${token}` } });
  } catch { throw new Error(text.connectionError); }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<Value>;
}
function IconButton({ label, children, ...props }: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>;
}
function TargetFields({ target, onChange, suffix = '' }: { target: Target; onChange: (target: Target) => void; suffix?: string }) {
  return <div className="field-grid">
    {([['device_type', text.deviceType], ['os', text.os], ['architecture', text.architecture], ['hardware_revision', text.hardware]] as const).map(([key, label]) =>
      <label key={key}>{label}{suffix}<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={64} value={target[key]} onChange={(event) => onChange({ ...target, [key]: event.target.value })} /></label>)}
    <label>{text.protocol}<input value="1" readOnly /></label>
  </div>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => { reference.current?.showModal(); }, []);
  return <dialog ref={reference} aria-label={title} onCancel={onClose}>
    <div className="dialog-header"><h2>{title}</h2><IconButton label={text.close} onClick={onClose}><X /></IconButton></div>{children}
  </dialog>;
}

export function App() {
  const [token, setToken] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [view, setView] = useState<View>('releases');
  const [products, setProducts] = useState<Product[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.toLowerCase());
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState('');
  const [manifest, setManifest] = useState<Manifest | Record<string, unknown> | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'withdraw' | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [checkTarget, setCheckTarget] = useState<Target>(emptyTarget);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [downloadManifest, setDownloadManifest] = useState<Manifest | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const creationKey = useRef('');
  const selected = releases.find((release) => release.id === selectedId);
  const admin = principal?.role === 'admin';
  const writable = principal?.role !== 'reader';
  const filtered = releases.filter((release) => (!productFilter || release.product === productFilter)
    && (!statusFilter || release.status === statusFilter) && `${release.product} ${release.version} ${release.channel}`.toLowerCase().includes(query));
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (failure) { setError(failure instanceof Error ? failure.message : text.connectionError); }
    finally { setBusy(false); }
  }
  async function refresh(activeToken = token, activePrincipal = principal) {
    if (!activePrincipal) return;
    const [nextProducts, nextReleases, nextEvents] = await Promise.all([
      request<Product[]>(activeToken, `${api}/admin/products`),
      activePrincipal.role !== 'reader' ? request<Release[]>(activeToken, `${api}/publishing/releases`) : Promise.resolve([]),
      activePrincipal.role === 'admin' ? request<Event[]>(activeToken, `${api}/admin/audit-events`) : Promise.resolve([]),
    ]);
    setProducts(nextProducts); setReleases(nextReleases); setEvents(nextEvents);
  }
  function choose(release: Release) {
    setSelectedId(release.id);
    setOrder(release.manifest?.artifact_order ?? release.artifacts.map((artifact) => artifact.id));
    setError(''); setNotice('');
  }
  async function signIn(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const activeToken = inputToken.trim();
      const session = await request<Principal>(activeToken, `${api}/session`);
      await refresh(activeToken, session);
      setToken(activeToken); setPrincipal(session); setInputToken('');
      setView(session.role === 'reader' ? 'check' : 'releases');
    });
  }
  function signOut() {
    setToken(''); setPrincipal(null); setInputToken(''); setReleases([]); setProducts([]); setEvents([]);
    setSelectedId(''); setManifest(null); setEditor(null); setCheckResult(null); setDownloadManifest(null); setError(''); setNotice('');
  }
  async function mutation(path: string, method = 'POST', body?: unknown) {
    await request(token, `${api}${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    await refresh();
  }
  function move(id: string, direction: number) {
    const next = [...order]; const index = next.indexOf(id); const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap]!, next[index]!]; setOrder(next);
  }
  async function upload(files: FileList | null) {
    if (!files || !selected) return;
    await run(async () => {
      let latest = selected;
      try {
        for (const file of files) {
          const body = new FormData(); body.append('file', file);
          latest = await request<Release>(token, `${api}/publishing/releases/${selected.id}/artifacts`, { method: 'POST', body });
        }
      } finally { await refresh(); choose(latest); }
      setNotice(text.filesUploaded);
    });
    if (fileInput.current) fileInput.current.value = '';
  }
  async function download(artifact: Manifest['artifacts'][number]) {
    await run(async () => {
      const response = await fetch(artifact.download_url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) => value.toString(16).padStart(2, '0')).join('');
      if (bytes.byteLength !== artifact.size || checksum !== artifact.sha256) throw new Error(text.integrityError);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = artifact.filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(text.verified);
    });
  }
  const banner = <>{error && <div className="banner error" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}{notice && <div className="banner success" role="status"><CheckCircle2 size={18} /><span>{notice}</span></div>}</>;

  if (!principal) return <main className="login-shell">
    <div className="login-brand"><span className="brand-mark"><Layers3 /></span><span>{text.brand}</span></div>
    <form className="login-form" onSubmit={(event) => { void signIn(event); }}>
      <span className="eyebrow"><KeyRound size={16} /> {text.console}</span><h1>{text.signIn}</h1>
      <label>{text.credential}<input type="password" autoComplete="off" required value={inputToken} onChange={(event) => setInputToken(event.target.value)} /></label>
      {banner}<button className="primary" disabled={busy} type="submit">{busy ? text.uploading : text.signIn}<ArrowUpRight size={18} /></button>
    </form><div className="login-footer"><span className="status-dot" />{text.local}<span>v0.1.0</span></div>
  </main>;

  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="/" onClick={(event) => event.preventDefault()}><span className="brand-mark"><Layers3 /></span><span>{text.brand}</span></a>
      <div className="session"><span className="status-dot" /><span className="session-id">{principal.id}</span><span className="role">{principal.role}</span><IconButton label={text.signOut} onClick={signOut} disabled={busy}><LogOut size={18} /></IconButton></div>
    </header>
    <div className="workspace-bar"><span><Radio size={14} />{text.local}</span><span>{text.console}<ChevronRight size={14} />{text[view]}</span></div>
    <nav className="main-nav" aria-label={text.console}>
      {([{ id: 'releases', icon: Box, visible: writable }, { id: 'products', icon: Folder, visible: writable }, { id: 'activity', icon: Radio, visible: admin }, { id: 'check', icon: Search, visible: true }] as const).filter((item) => item.visible).map(({ id, icon: Icon }) =>
        <button key={id} type="button" className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setError(''); setNotice(''); }}><Icon size={17} />{text[id]}{id === 'releases' && <span className="nav-count">{releases.length}</span>}</button>)}
      <IconButton label={text.refresh} disabled={busy} onClick={() => { void run(() => refresh()); }}><RefreshCw size={17} /></IconButton>
    </nav>
    <main className="workspace">
      {banner}
      {view === 'releases' && <>
        <section className="page-heading"><div><span className="eyebrow">{text.console}</span><h1>{text.releases}<span className="heading-count">{releases.length.toString().padStart(2, '0')}</span></h1></div><button className="primary" disabled={busy || !products.length} onClick={() => { creationKey.current = crypto.randomUUID(); setEditingId(''); setEditor({ product: products[0]!.id, version: '', channel: 'stable', release_notes: '', targets: [emptyTarget()] }); }}><Plus size={17} />{text.newRelease}</button></section>
        <section className="summary-strip" aria-label={text.catalog}>
          <div><span>{text.published}</span><strong>{releases.filter((release) => release.status === 'published').length}<span className="metric-dot green" /></strong></div>
          <div><span>{text.draft}</span><strong>{releases.filter((release) => release.status === 'draft').length}<span className="metric-dot gold" /></strong></div>
          <div><span>{text.withdrawn}</span><strong>{releases.filter((release) => release.status === 'withdrawn').length}<span className="metric-dot red" /></strong></div>
          <div><span>{text.storage}</span><strong className="storage-value">{formatSize(releases.reduce((total, release) => total + release.artifacts.reduce((sum, artifact) => sum + artifact.size, 0), 0))}</strong></div>
        </section>
        <div className="release-workspace"><section className="catalog">
          <div className="section-heading"><h2>{text.catalog}</h2><span>{filtered.length}</span></div>
          <div className="filters" role="search" aria-label={text.filters}>
            <div className="search-box"><Search size={16} /><input type="search" aria-label={text.search} placeholder={text.search} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <select aria-label={text.product} value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="">{text.allProducts}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
            <select aria-label={text.status} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{text.allStatuses}</option>{(['draft', 'published', 'withdrawn'] as const).map((status) => <option key={status} value={status}>{text[status]}</option>)}</select>
          </div>
          <div className="list-head"><span>{text.product} / {text.version}</span><span>{text.status}</span><span>{text.artifacts}</span></div>
          <div className="release-list" aria-label={text.releases}>
            {!filtered.length && <div className="empty-state"><Box size={30} /><h3>{releases.length ? text.noResults : text.noReleases}</h3></div>}
            {filtered.map((release) => <button key={release.id} disabled={busy} className={`release-row ${release.id === selectedId ? 'selected' : ''}`} onClick={() => choose(release)} aria-pressed={release.id === selectedId}>
              <span className="release-name"><strong>{release.product}</strong><span className="version-line"><code>{release.version}</code><span>{release.channel}</span></span></span>
              <span className={`badge ${release.status}`}><span className="badge-dot" />{text[release.status]}</span><span className="file-count"><FileCode2 size={14} />{release.artifacts.length}<ChevronRight size={16} /></span>
            </button>)}
          </div>
        </section><section className="release-detail" aria-label={text.details}>
          {!selected ? <div className="empty-state detail-empty"><PackageCheck size={36} /><h2>{text.selectRelease}</h2></div> : <>
            <div className="detail-heading"><span className={`badge ${selected.status}`}><span className="badge-dot" />{text[selected.status]}</span><span className="mono">{selected.id.slice(0, 8)}</span></div>
            <h2 className="detail-title">{selected.product}<span>{selected.version}</span></h2>
            <dl className="metadata"><div><dt>{text.channel}</dt><dd><span className="channel-tag">{selected.channel}</span></dd></div><div><dt>{text.created}</dt><dd>{date(selected.created_at)}</dd></div>{selected.published_at && <div><dt>{text.publishedAt}</dt><dd>{date(selected.published_at)}</dd></div>}</dl>
            {selected.release_notes && <p className="release-notes">{selected.release_notes}</p>}
            <div className="section-heading"><h3>{text.compatibility}</h3>{selected.status === 'draft' && <button className="text-button" disabled={busy} onClick={() => { setEditingId(selected.id); setEditor({ product: selected.product, version: selected.version, channel: selected.channel, release_notes: selected.release_notes, targets: selected.targets }); }}>{text.editRelease}<ArrowUpRight size={14} /></button>}</div>
            <div className="target-list">{selected.targets.map((target, index) => <div className="target-row" key={index}><Box size={16} /><div><strong>{target.device_type}</strong><span>{target.os} / {target.architecture} / {target.hardware_revision} / v{target.updater_protocol}</span></div></div>)}</div>
            <div className="section-heading"><h3>{text.artifacts}<span className="small-count">{selected.artifacts.length}</span></h3>{selected.status === 'draft' && <><input ref={fileInput} type="file" multiple className="sr-only" aria-label={text.upload} onChange={(event) => { void upload(event.target.files); }} /><button className="text-button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15} />{text.upload}</button></>}</div>
            {!selected.artifacts.length && <div className="empty-files"><FilePlus2 size={22} /><span>{text.emptyFiles}</span></div>}
            <ol className="artifact-list">{order.map((id, index) => {
              const artifact = selected.artifacts.find((entry) => entry.id === id);
              if (!artifact) return null;
              return <li key={id}><div className="artifact-top"><span className="artifact-number">{index + 1}</span><strong>{artifact.filename}</strong><span>{formatSize(artifact.size)}</span></div>
                <div className="artifact-bottom"><code title={artifact.sha256}>{artifact.sha256}</code>{selected.status === 'draft' && <div className="artifact-actions"><IconButton label={`${text.up}: ${artifact.filename}`} disabled={busy || index === 0} onClick={() => move(id, -1)}><ArrowUp size={14} /></IconButton><IconButton label={`${text.down}: ${artifact.filename}`} disabled={busy || index === order.length - 1} onClick={() => move(id, 1)}><ArrowDown size={14} /></IconButton><IconButton label={`${text.remove}: ${artifact.filename}`} disabled={busy} onClick={() => { void run(async () => { await mutation(`/publishing/releases/${selected.id}/artifacts/${id}`, 'DELETE'); setOrder(order.filter((entry) => entry !== id)); }); }}><Trash2 size={14} /></IconButton></div>}</div></li>;
            })}</ol>
            <div className="manifest-status"><ShieldCheck size={15} /><span>{selected.manifest ? text.manifestReady : text.manifestRequired}</span>{selected.status === 'draft' && <button className="text-button" disabled={busy || !order.length} onClick={() => { void run(async () => { await mutation(`/publishing/releases/${selected.id}/manifest`, 'PUT', { schema_version: '1', artifact_order: order }); setNotice(text.manifestSaved); }); }}>{text.saveManifest}</button>}</div>
            <div className="detail-actions">
              {selected.status === 'draft' && <><button disabled={busy} onClick={() => { void run(async () => { const result = await request<{ valid: boolean; errors: string[] }>(token, `${api}/publishing/releases/${selected.id}/validate`, { method: 'POST' }); if (!result.valid) throw new Error(result.errors.join('; ')); setNotice(text.validationPassed); }); }}><ShieldCheck size={16} />{text.validate}</button><button className="primary" disabled={busy || !selected.manifest} onClick={() => setConfirm('publish')}><Upload size={16} />{text.publish}</button></>}
              {selected.status === 'published' && <><button disabled={busy} onClick={() => { void run(async () => { setManifest(await request<Manifest>(token, `${api}/releases/${selected.id}/manifest`)); }); }}><FileCode2 size={16} />{text.inspect}</button>{admin && <button className="danger" disabled={busy} onClick={() => setConfirm('withdraw')}><X size={16} />{text.withdraw}</button>}</>}
            </div>
          </>}
        </section></div>
      </>}
      {view === 'products' && <>
        <section className="page-heading"><div><span className="eyebrow">{text.console}</span><h1>{text.products}</h1></div></section>
        {admin && <form className="product-form" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void run(async () => { await mutation('/admin/products', 'POST', { id: data.get('id'), name: data.get('name') }); form.reset(); setNotice(text.productCreated); }); }}><label>{text.productId}<input name="id" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={64} /></label><label>{text.name}<input name="name" required maxLength={100} /></label><button className="primary" disabled={busy}><Plus size={16} />{text.createProduct}</button></form>}
        <div className="product-list">{!products.length && <div className="empty-state"><Folder size={30} /><h2>{text.noProducts}</h2></div>}{products.map((product) => <div className="product-row" key={product.id}><Folder size={23} /><div><h2>{product.name}</h2><code>{product.id}</code></div><span>{releases.filter((release) => release.product === product.id).length} {text.releases.toLowerCase()}</span></div>)}</div>
      </>}
      {view === 'activity' && <><section className="page-heading"><div><span className="eyebrow">{text.console}</span><h1>{text.activity}</h1></div></section><div className="table-scroll"><table><thead><tr><th>{text.time}</th><th>{text.actor}</th><th>{text.action}</th><th>{text.resource}</th></tr></thead><tbody>{events.map((event) => <tr key={event.sequence}><td>{date(event.at)}</td><td>{event.actor}</td><td><code>{event.action}</code></td><td><code>{event.resource}</code></td></tr>)}</tbody></table>{!events.length && <div className="empty-state">{text.noActivity}</div>}</div></>}
      {view === 'check' && <>
        <section className="page-heading"><div><span className="eyebrow">{text.checks}</span><h1>{text.check}</h1></div></section>
        <div className="check-layout"><form className="check-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setCheckResult(null); setDownloadManifest(null); void run(async () => { setCheckResult(await request<CheckResult>(token, `${api}/updates/check`, { method: 'POST', body: JSON.stringify({ product: data.get('product'), current_version: data.get('version'), channel: data.get('channel'), target: checkTarget }) })); }); }}>
          <div className="field-grid"><label>{text.product}<select name="product" required>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>{text.currentVersion}<input name="version" required placeholder="1.0.0" maxLength={96} /></label><label>{text.channel}<input name="channel" required defaultValue="stable" /></label></div>
          <h2>{text.compatibility}</h2><TargetFields target={checkTarget} onChange={setCheckTarget} /><button className="primary" disabled={busy || !products.length}><Search size={17} />{text.checkNow}</button>
        </form><section className="check-result" aria-live="polite">{checkResult ? <><span className="result-icon"><PackageCheck size={30} /></span><h2>{checkResult.update_available ? text.available : text.noUpdate}</h2>{checkResult.release && <><strong className="result-version">{checkResult.release.version}</strong><button disabled={busy} onClick={() => { void run(async () => setDownloadManifest(await request<Manifest>(token, checkResult.release!.manifest_url))); }}><FileCode2 size={16} />{text.getManifest}</button></>}{downloadManifest && <div className="download-list">{downloadManifest.artifacts.map((artifact) => <div key={artifact.id}><span><strong>{artifact.filename}</strong><small>{formatSize(artifact.size)}</small></span><IconButton label={`${text.download}: ${artifact.filename}`} disabled={busy} onClick={() => { void download(artifact); }}><Download size={17} /></IconButton></div>)}</div>}</> : <Search size={32} />}</section></div>
      </>}
    </main>
    <footer className="app-footer"><span><span className="status-dot" />{text.local}</span><span>Device Update Hub / 0.1.0</span></footer>
    {editor && <Modal title={editingId ? text.editRelease : text.newRelease} onClose={() => { if (!busy) setEditor(null); }}><form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const release = await request<Release>(token, `${api}/publishing/releases${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PATCH' : 'POST', headers: editingId ? {} : { 'Idempotency-Key': creationKey.current }, body: JSON.stringify(editor) });
      await refresh(); choose(release); setEditor(null); setNotice(text.draftSaved);
    }); }}><div className="field-grid"><label>{text.product}<select value={editor.product} disabled={!!editingId} onChange={(event) => setEditor({ ...editor, product: event.target.value })}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>{text.version}<input required value={editor.version} placeholder="1.0.0" maxLength={96} onChange={(event) => setEditor({ ...editor, version: event.target.value })} /></label><label>{text.channel}<input required value={editor.channel} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={64} onChange={(event) => setEditor({ ...editor, channel: event.target.value })} /></label></div>
      <label>{text.notes}<textarea maxLength={16000} rows={3} value={editor.release_notes} onChange={(event) => setEditor({ ...editor, release_notes: event.target.value })} /></label><div className="section-heading"><h3>{text.compatibility}</h3><button className="text-button" type="button" disabled={editor.targets.length >= 32} onClick={() => setEditor({ ...editor, targets: [...editor.targets, emptyTarget()] })}><Plus size={15} />{text.addTarget}</button></div>
      {editor.targets.map((target, index) => <fieldset className="target-fields" key={index}><legend>{text.compatibility} {index + 1}</legend><TargetFields suffix={editor.targets.length > 1 ? ` ${index + 1}` : ''} target={target} onChange={(nextTarget) => setEditor({ ...editor, targets: editor.targets.map((entry, targetIndex) => targetIndex === index ? nextTarget : entry) })} />{editor.targets.length > 1 && <IconButton label={text.removeTarget} onClick={() => setEditor({ ...editor, targets: editor.targets.filter((_entry, targetIndex) => targetIndex !== index) })}><Trash2 size={16} /></IconButton>}</fieldset>)}
      {error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={() => setEditor(null)}>{text.cancel}</button><button className="primary" disabled={busy}>{editingId ? text.save : text.create}</button></div>
    </form></Modal>}
    {manifest && <Modal title={text.manifest} onClose={() => setManifest(null)}><pre className="manifest-json">{JSON.stringify(manifest, null, 2)}</pre></Modal>}
    {confirm && selected && <Modal title={confirm === 'publish' ? text.publish : text.withdraw} onClose={() => { if (!busy) setConfirm(null); }}><p className="confirmation">{confirm === 'publish' ? text.confirmPublish : text.confirmWithdraw}</p><p className="mono">{selected.product} / {selected.version}</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><button disabled={busy} onClick={() => setConfirm(null)}>{text.cancel}</button><button className={confirm === 'publish' ? 'primary' : 'danger'} disabled={busy} onClick={() => { void run(async () => { await mutation(confirm === 'publish' ? `/publishing/releases/${selected.id}/publish` : `/admin/releases/${selected.id}/withdraw`); setNotice(confirm === 'publish' ? text.publishedMessage : text.withdrawnMessage); setConfirm(null); }); }}>{confirm === 'publish' ? text.publish : text.withdraw}</button></div></Modal>}
  </div>;
}