import { useState } from 'react';
import { Plus, Edit2, Trash2, Search, Star } from 'lucide-react';
import { useStore, newId } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import type { Customer } from '../types';
import { fmtMoney, fmtDate } from '../utils/format';

const empty: Customer = { id: '', name: '', phone: '', loyaltyPoints: 0, visits: 0, totalSpent: 0 };

export default function Customers() {
  const s = useStore();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');

  const filtered = s.customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Customers"
        subtitle={`${s.customers.length} registered customers`}
        actions={
          <button onClick={() => setEditing(empty)} className="btn-primary">
            <Plus size={16} /> Add Customer
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="card p-4">
          <div className="text-xs text-slate-500">Total Customers</div>
          <div className="text-2xl font-bold mt-1">{s.customers.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Total Visits</div>
          <div className="text-2xl font-bold mt-1">{s.customers.reduce((a, b) => a + b.visits, 0)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Lifetime Value</div>
          <div className="text-2xl font-bold mt-1">{fmtMoney(s.customers.reduce((a, b) => a + b.totalSpent, 0), s.settings.currency)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Loyalty Points Issued</div>
          <div className="text-2xl font-bold mt-1">{s.customers.reduce((a, b) => a + b.loyaltyPoints, 0)}</div>
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone..." className="input pl-9" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-right px-4 py-3">Visits</th>
              <th className="text-right px-4 py-3">Total Spent</th>
              <th className="text-right px-4 py-3">Loyalty</th>
              <th className="text-left px-4 py-3">Last Visit</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  {c.name}
                  {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                <td className="px-4 py-3 text-right">{c.visits}</td>
                <td className="px-4 py-3 text-right font-semibold">{fmtMoney(c.totalSpent, s.settings.currency)}</td>
                <td className="px-4 py-3 text-right">
                  <span className="badge bg-amber-100 text-amber-700">
                    <Star size={10} /> {c.loyaltyPoints}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{c.lastVisit ? fmtDate(c.lastVisit) : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(c)} className="text-slate-500 hover:text-brand-700 mr-2">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => confirm('Delete?') && s.deleteCustomer(c.id)} className="text-red-500">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Customer' : 'Add Customer'}
        footer={
          <>
            <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => {
                if (editing) s.upsertCustomer({ ...editing, id: editing.id || newId() });
                setEditing(null);
              }}
              className="btn-primary"
            >
              Save
            </button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Name</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <textarea value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className="input" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
