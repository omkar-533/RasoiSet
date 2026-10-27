import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import PageHeader from '../components/PageHeader';

type Connection = {
  channel: string;
  route: string;
  transport: string;
  environment: string;
  status: string;
  externalOutletId: string;
  credentialsConfigured: boolean;
  credentialHint: string;
  lastCheckAt: number | null;
  lastCheckError: string;
  lastOrderAt: number | null;
  lastMenuSyncAt: number | null;
  pendingActions: number;
  disabledLocally: boolean;
  capabilities: { blocker: string; accept: boolean; reject: boolean; ready: boolean; menuPublish: boolean; itemAvailability: boolean; outletToggle: boolean; settlement: string; markDelivered: boolean };
};

const STATUS: Record<string, string> = {
  not_configured: 'Not configured',
  awaiting_provider_approval: 'Awaiting provider approval',
  credentials_configured: 'Credentials configured',
  outlet_mapping_pending: 'Outlet mapping pending',
  testing: 'Testing',
  active: 'Active',
  degraded: 'Degraded',
  disconnected: 'Disconnected',
};

export default function Integrations() {
  const menu = useStore((s) => s.menu);
  const canWrite = useStore((s) => s.can('settings.write'));
  const [data, setData] = useState<{ connections: Connection[]; jobs: { id: string; channel: string; kind: string; status: string; detail: { message?: string } | null; createdAt: number }[]; metrics: Record<string, number>; settlement: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [outlet, setOutlet] = useState<Record<string, string>>({});
  const [map, setMap] = useState({ channel: 'swiggy', menuItemId: '', externalItemId: '', channelPrice: '' });

  const load = () => api<NonNullable<typeof data>>('/api/channels').then(setData).catch((error) => setNotice(error.message));
  useEffect(() => { load(); }, []);

  const run = async (path: string, body?: unknown) => {
    setNotice('');
    try {
      const result = await api<any>(path, { method: 'POST', body });
      setNotice(result.result?.message || result.preview?.message || result.message || 'Saved.');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Request failed');
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader title="Integrations" subtitle="Zomato and Swiggy" actions={<Link to="/settings" className="btn-secondary">Settings</Link>} />
      {notice && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.connections || []).map((connection) => (
          <section key={connection.channel} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold capitalize text-slate-900">{connection.channel}</h2>
                <p className="text-sm text-slate-500">{connection.route}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{STATUS[connection.status] || connection.status}</span>
            </div>
            <dl className="mt-4 space-y-1 text-sm text-slate-600">
              <div>Environment: {connection.environment}</div>
              <div>Credentials: {connection.credentialsConfigured ? `configured (${connection.credentialHint})` : 'not set on the server'}</div>
              <div>Outlet: {connection.externalOutletId || 'not mapped'}</div>
              <div>Last check: {connection.lastCheckAt ? new Date(connection.lastCheckAt).toLocaleString() : 'never'}</div>
              <div>Last order: {connection.lastOrderAt ? new Date(connection.lastOrderAt).toLocaleString() : 'none'}</div>
              <div>Last menu sync: {connection.lastMenuSyncAt ? new Date(connection.lastMenuSyncAt).toLocaleString() : 'none sent'}</div>
              <div>Pending actions: {connection.pendingActions}</div>
              {connection.lastCheckError && <div className="text-red-700">{connection.lastCheckError}</div>}
            </dl>
            <p className="mt-3 text-xs text-slate-500">{connection.capabilities.blocker}</p>
            <p className="mt-2 text-xs text-slate-500">Disabling here does not close the outlet on {connection.channel}. Outlet open or closed on the platform is a separate operation and is not sent.</p>
            {canWrite && (
              <div className="mt-4 space-y-2">
                <label className="label" htmlFor={`${connection.channel}-outlet`}>External outlet id</label>
                <input id={`${connection.channel}-outlet`} className="input" value={outlet[connection.channel] ?? connection.externalOutletId} onChange={(event) => setOutlet({ ...outlet, [connection.channel]: event.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => run(`/api/channels/${connection.channel}/outlet`, { externalOutletId: outlet[connection.channel] ?? connection.externalOutletId })}>Map outlet</button>
                  <button className="btn-secondary" onClick={() => run(`/api/channels/${connection.channel}/validate`)}>Validate connection</button>
                  <button className="btn-secondary" onClick={() => run(`/api/channels/${connection.channel}/disable`)}>Disable in RasoiSet</button>
                  {connection.channel === 'swiggy' && <button className="btn-secondary" onClick={() => run(`/api/channels/${connection.channel}/activate`)}>Activate live</button>}
                  <button className="btn-secondary" onClick={() => run(`/api/channels/${connection.channel}/preview`)}>Preview menu mapping</button>
                </div>
              </div>
            )}
            <ul className="mt-4 text-xs text-slate-500">
              <li>Accept and reject: {connection.capabilities.accept ? 'available only after UrbanPiper accepts a status call' : 'not available'}</li>
              <li>Mark delivered: {connection.capabilities.markDelivered ? 'available' : 'provider-controlled, hidden'}</li>
              <li>Menu publish: {connection.capabilities.menuPublish ? 'available' : 'not sent'}</li>
              <li>Item availability on the platform: {connection.capabilities.itemAvailability ? 'available' : 'not sent'}</li>
              <li>Settlement: {connection.capabilities.settlement}</li>
            </ul>
          </section>
        ))}
      </div>
      {canWrite && (
        <section className="card mt-4 p-5">
          <h2 className="font-semibold text-slate-900">Item mapping</h2>
          <p className="mt-1 text-sm text-slate-500">Orders match the external item id. A channel price does not change the dine-in price. A dish photo in RasoiSet is not sent to a delivery platform.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <select className="input" value={map.channel} onChange={(event) => setMap({ ...map, channel: event.target.value })}>
              <option value="swiggy">Swiggy</option>
              <option value="zomato">Zomato</option>
            </select>
            <select className="input" value={map.menuItemId} onChange={(event) => setMap({ ...map, menuItemId: event.target.value })}>
              <option value="">Menu item</option>
              {menu.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <input className="input" placeholder="External item id" value={map.externalItemId} onChange={(event) => setMap({ ...map, externalItemId: event.target.value })} />
            <input className="input" placeholder="Channel price, optional" value={map.channelPrice} onChange={(event) => setMap({ ...map, channelPrice: event.target.value })} />
          </div>
          <button className="btn-primary mt-3" onClick={() => run('/api/channels/item-map', { ...map, channelPrice: map.channelPrice || null })}>Save mapping</button>
          <button className="btn-secondary ml-2" onClick={() => run('/api/channels/availability', { channel: map.channel, menuItemId: map.menuItemId, available: false })}>Record sold-out request</button>
        </section>
      )}
      <section className="card mt-4 p-5">
        <h2 className="font-semibold text-slate-900">Sync history and attention</h2>
        <p className="mt-1 text-sm text-slate-500">{data?.settlement}</p>
        <p className="mt-2 text-xs text-slate-500">Failed events {data?.metrics.failedEvents || 0} · duplicates {data?.metrics.duplicates || 0} · unmapped {data?.metrics.unmapped || 0} · pending {data?.metrics.pendingActions || 0} · menu checks {data?.metrics.menuFailures || 0}</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {(data?.jobs || []).map((job) => <li key={job.id}>{job.channel} · {job.kind} · {job.status}{job.detail?.message ? ` · ${job.detail.message}` : ''}</li>)}
          {!data?.jobs?.length && <li>No sync history yet.</li>}
        </ul>
      </section>
    </div>
  );
}
