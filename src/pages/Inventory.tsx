import { useState } from 'react';
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import { useStore, newId } from '../store/useStore';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import type { IngredientStock } from '../types';
import { fmtMoney, ago } from '../utils/format';

const empty: IngredientStock = { id: '', name: '', unit: 'kg', stock: 0, minStock: 0, costPerUnit: 0, lastUpdated: Date.now() };

export default function Inventory() {
  const s = useStore();
  const [editing, setEditing] = useState<IngredientStock | null>(null);

  const totalValue = s.ingredients.reduce((a, b) => a + b.stock * b.costPerUnit, 0);
  const lowStock = s.ingredients.filter((i) => i.stock <= i.minStock);

  return (
    <div className="p-6">
      <PageHeader
        title="Inventory"
        subtitle={`${s.ingredients.length} ingredients · Total value ${fmtMoney(totalValue, s.settings.currency)}`}
        actions={
          <button onClick={() => setEditing(empty)} className="btn-primary">
            <Plus size={16} /> Add Ingredient
          </button>
        }
      />

      {lowStock.length > 0 && (
        <div className="card p-4 mb-4 border-l-4 border-red-500">
          <div className="flex items-center gap-2 mb-2 text-red-700">
            <AlertTriangle size={16} />
            <span className="font-semibold text-sm">{lowStock.length} ingredients below minimum stock</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((i) => (
              <span key={i.id} className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {i.name}: {i.stock} {i.unit}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Ingredient</th>
              <th className="text-right px-4 py-3">In Stock</th>
              <th className="text-right px-4 py-3">Min</th>
              <th className="text-right px-4 py-3">Cost / Unit</th>
              <th className="text-right px-4 py-3">Total Value</th>
              <th className="text-center px-4 py-3">Adjust</th>
              <th className="text-left px-4 py-3">Updated</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {s.ingredients.map((i) => {
              const low = i.stock <= i.minStock;
              return (
                <tr key={i.id} className={`border-t border-slate-100 hover:bg-slate-50 ${low ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${low ? 'text-red-600' : ''}`}>
                    {i.stock} {i.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{i.minStock} {i.unit}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(i.costPerUnit, s.settings.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtMoney(i.stock * i.costPerUnit, s.settings.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => s.adjustStock(i.id, -1)} className="w-6 h-6 rounded bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center">
                        <ArrowDown size={12} />
                      </button>
                      <button onClick={() => s.adjustStock(i.id, 1)} className="w-6 h-6 rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-200 flex items-center justify-center">
                        <ArrowUp size={12} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{ago(i.lastUpdated)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEditing(i)} className="text-slate-500 hover:text-brand-700 mr-2">
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${i.name}?`)) s.deleteIngredient(i.id);
                      }}
                      className="text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit Ingredient' : 'Add Ingredient'}
        footer={
          <>
            <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => {
                if (editing) s.upsertIngredient({ ...editing, id: editing.id || newId(), lastUpdated: Date.now() });
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
              <label className="label">Unit</label>
              <select value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} className="input">
                <option>kg</option>
                <option>g</option>
                <option>L</option>
                <option>ml</option>
                <option>pcs</option>
              </select>
            </div>
            <div>
              <label className="label">Stock</label>
              <input type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div>
              <label className="label">Min Stock</label>
              <input type="number" value={editing.minStock} onChange={(e) => setEditing({ ...editing, minStock: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div>
              <label className="label">Cost / Unit</label>
              <input type="number" value={editing.costPerUnit} onChange={(e) => setEditing({ ...editing, costPerUnit: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
