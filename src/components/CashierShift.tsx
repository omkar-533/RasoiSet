import { useState } from 'react';
import { useStore } from '../store/useStore';
import { fmtMoney } from '../utils/format';

export default function CashierShift() {
  const s = useStore();
  const [opening, setOpening] = useState('0');
  const [counted, setCounted] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!s.can('orders.pay')) return null;

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      await task();
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Could not update the shift.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
      {s.shift ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600">Shift open · float {fmtMoney(s.shift.openingCash, s.settings.currency)}</span>
          <input
            aria-label="Counted cash"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            inputMode="decimal"
            placeholder="Counted cash"
            className="input h-8 w-32"
          />
          <button
            type="button"
            className="btn-secondary h-8"
            disabled={busy}
            onClick={() => run(async () => {
              const closed = await s.closeShift(Number(counted));
              const difference = (closed.countedCash || 0) - (closed.expectedCash || 0);
              setResult(`Expected ${fmtMoney(closed.expectedCash || 0, s.settings.currency)}. Difference ${fmtMoney(difference, s.settings.currency)}.`);
              setCounted('');
            })}
          >
            Close shift
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600">No cashier shift is open.</span>
          <input
            aria-label="Opening cash"
            value={opening}
            onChange={(event) => setOpening(event.target.value)}
            inputMode="decimal"
            className="input h-8 w-28"
          />
          <button type="button" className="btn-secondary h-8" disabled={busy} onClick={() => run(() => s.openShift(Number(opening) || 0))}>
            Open shift
          </button>
        </div>
      )}
      {result && <p className="mt-1 text-xs text-slate-500">{result}</p>}
    </div>
  );
}
