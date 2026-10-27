import { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useStore, newId } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import type { Staff, StaffRole } from '../types';

const empty: Staff = { id: '', name: '', role: 'waiter', phone: '', active: true, pin: '0000' };

const roleColors: Record<StaffRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  cashier: 'bg-emerald-100 text-emerald-700',
  waiter: 'bg-amber-100 text-amber-700',
  chef: 'bg-red-100 text-red-700',
  delivery: 'bg-cyan-100 text-cyan-700',
};

export default function StaffPage() {
  const s = useStore();
  const [editing, setEditing] = useState<Staff | null>(null);

  return (
    <div className="p-6">
      <PageHeader
        title="Staff Management"
        subtitle={`${s.staff.length} members · ${s.staff.filter((x) => x.active).length} active`}
        actions={
          <button onClick={() => setEditing(empty)} className="btn-primary">
            <Plus size={16} /> Add Staff
          </button>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {s.staff.map((m) => (
          <div key={m.id} className="card p-4 flex items-start gap-3 group">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 font-bold text-white">
              {m.name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="font-semibold">{m.name}</div>
                {!m.active && <span className="text-[10px] uppercase text-red-500">Inactive</span>}
              </div>
              <span className={`badge ${roleColors[m.role]} mt-1 capitalize`}>{m.role}</span>
              <div className="text-xs text-slate-500 mt-1">{m.phone}</div>
              <div className="text-xs text-slate-400 mt-1">{m.pinSet ? 'PIN on file' : 'No PIN'}</div>
            </div>
            <div className="opacity-0 group-hover:opacity-100 flex flex-col gap-1">
              <button onClick={() => setEditing(m)} className="p-1 text-slate-500 hover:text-brand-700">
                <Edit2 size={14} />
              </button>
              <button onClick={() => confirm('Delete?') && s.deleteStaff(m.id)} className="p-1 text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Staff' : 'Add Staff'}
        footer={
          <>
            <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => {
                if (editing) s.upsertStaff({ ...editing, id: editing.id || newId() });
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
              <label className="label">Role</label>
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as StaffRole })} className="input">
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="waiter">Waiter</option>
                <option value="chef">Chef</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
            <div>
              <label className="label">PIN (4 digits)</label>
              <input value={editing.pin} maxLength={4} onChange={(e) => setEditing({ ...editing, pin: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="input" />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Active
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
