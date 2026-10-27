import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api } from '../../api/client';

const INTERESTS = [
  { value: 'general', label: 'A general look' },
  { value: 'starter', label: 'Starter' },
  { value: 'growth', label: 'Growth' },
  { value: 'multi-outlet', label: 'Multi-outlet' },
];

interface Props {
  open: boolean;
  interest: string;
  onClose: () => void;
}

export default function DemoDialog({ open, interest, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(crypto.randomUUID());
  const websiteRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [outlets, setOutlets] = useState('1');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(interest);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) setSelected(interest);
  }, [open, interest]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = dialogRef.current;
    const focusable = () =>
      root
        ? Array.from(root.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href]')).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
        : [];
    const nameField = root?.querySelector<HTMLElement>('#demo-name');
    if (nameField) nameField.focus();
    else focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !root) return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || saved) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ ok: boolean; notification: string }>('/api/demo-requests', {
        method: 'POST',
        body: {
          name,
          businessName,
          phone,
          email,
          city,
          outlets: Number(outlets),
          message,
          interest: selected,
          marketingConsent: consent,
          idempotencyKey: keyRef.current,
          website: websiteRef.current?.value || '',
        },
      });
      if (!result.ok || result.notification !== 'not_configured') {
        throw new Error('The request was not confirmed.');
      }
      setSaved(true);
      keyRef.current = crypto.randomUUID();
    } catch (err) {
      setSaved(false);
      setError(err instanceof Error ? err.message : 'Could not save the demo request.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center sm:p-6">
      <button type="button" tabIndex={-1} aria-label="Close demo form" className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight text-slate-900">Book a demo</h2>
            <p className="mt-1 text-sm text-slate-500">These details are stored so this RasoiSet install can follow up. They are not emailed.</p>
          </div>
          <button type="button" className="btn-secondary h-9 px-3" onClick={onClose}>Close</button>
        </div>
        {saved ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" role="status">
            Your demo request is saved. No email was sent — this server has no notification provider configured.
          </p>
        ) : (
          <form className="relative mt-5 grid gap-3" onSubmit={submit}>
            <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input ref={websiteRef} id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="demo-name">Name</label>
              <input id="demo-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="demo-business">Restaurant or business</label>
              <input id="demo-business" className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="demo-phone">Phone</label>
                <input id="demo-phone" className="input" type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="demo-email">Email <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="demo-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="demo-city">City</label>
                <input id="demo-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="demo-outlets">Outlets</label>
                <input id="demo-outlets" className="input" type="number" min={1} max={200} value={outlets} onChange={(e) => setOutlets(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="demo-interest">Interest</label>
              <select id="demo-interest" className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {INTERESTS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="demo-message">Message <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea id="demo-message" className="input min-h-20" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-600" htmlFor="demo-consent">
              <input id="demo-consent" type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Send me occasional product updates. This is optional and is not required to book a demo.</span>
            </label>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button type="submit" className="btn-primary mt-1 h-11" disabled={busy}>{busy ? 'Saving…' : 'Book a demo'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
