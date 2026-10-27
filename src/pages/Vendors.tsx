import { useState } from 'react';
import { Plus, Edit2, Trash2, Phone } from 'lucide-react';
import { useStore, newId } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import type { Vendor } from '../types';

const empty: Vendor = { id: '', name: '', phone: '', category: '' };

export default function Vendors() {
  const s = useStore();
  const [editing, setEditing] = useState<Vendor | null>(null);

  return (
    <div className="p-6">
      <PageHeader
        title="Vendors"
        subtitle={`${s.vendors.length} suppliers`}
        actions={
          <button onClick={() => setEditing(empty)} className="btn-primary">
            <Plus size={16} /> Add Vendor
          </button>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {s.vendors.map((v) => (
          <div key={v.id} className="card p-4 group relative">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-semibold text-slate-900">{v.name}</div>
                <div className="text-xs text-slate-500">{v.category}</div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <button onClick={() => setEditing(v)} className="p-1 text-slate-500 hover:text-brand-700">
                  <Edit2 size={12} />
                </button>
                <button onClick={() => confirm('Delete?') && s.deleteVendor(v.id)} className="p-1 text-red-500">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <a href={`tel:${v.phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-brand-700">
              <Phone size={14} /> {v.phone}
            </a>
          </div>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Vendor' : 'Add Vendor'}
        footer={
          <>
            <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => {
                if (editing) s.upsertVendor({ ...editing, id: editing.id || newId() });
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
          <div className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">Category</label>
              <input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="input" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
