import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import Logo from '../components/Logo';
import { bootstrap, login } from '../store/useStore';

type Mode = 'signin' | 'signup' | 'forgot';

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const resetMessages = () => {
    setError('');
    setDevCode('');
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setCode('');
    setResetToken('');
    setConfirm('');
    resetMessages();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signin') {
        await login(phone, password);
      } else if (mode === 'signup') {
        await api('/api/auth/signup', { method: 'POST', body: { name, phone, email, password } });
        await bootstrap();
      } else if (!resetToken && !code) {
        const result = await api<{ devCode?: string }>('/api/auth/forgot/start', { method: 'POST', body: { phone } });
        setDevCode(result.devCode || '');
        setCode('');
      } else if (!resetToken) {
        const result = await api<{ resetToken: string }>('/api/auth/forgot/verify', { method: 'POST', body: { phone, code } });
        setResetToken(result.resetToken);
        setPassword('');
        setConfirm('');
      } else {
        if (password !== confirm) throw new Error('Passwords do not match.');
        await api('/api/auth/forgot/reset', { method: 'POST', body: { phone, resetToken, password } });
        await login(phone, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Sign in';
  const forgotStep = !resetToken && !devCode && !code ? 'phone' : !resetToken ? 'code' : 'password';

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4 py-8">
      <form onSubmit={submit} className="card w-full max-w-md p-6 sm:p-8">
        <Logo markSize={40} />
        <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {mode === 'signin' && 'Sign in with your mobile number and password.'}
          {mode === 'signup' && 'Name, mobile number and a password. Email is optional.'}
          {mode === 'forgot' && forgotStep === 'phone' && 'Enter the mobile number on your account.'}
          {mode === 'forgot' && forgotStep === 'code' && 'Enter the verification code for this number.'}
          {mode === 'forgot' && forgotStep === 'password' && 'Number verified. Choose a new password.'}
        </p>

        {mode === 'signup' && (
          <>
            <label className="label mt-6" htmlFor="name">Name</label>
            <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="input" required />
          </>
        )}

        {(mode !== 'forgot' || forgotStep === 'phone') && (
          <>
            <label className="label mt-4" htmlFor="phone">Mobile number</label>
            <input id="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" required />
          </>
        )}

        {mode === 'signup' && (
          <>
            <label className="label mt-4" htmlFor="email">Email <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </>
        )}

        {mode === 'forgot' && forgotStep === 'code' && (
          <>
            {devCode && (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
                SMS is not connected on this server. Verification code: <span className="font-semibold tracking-widest">{devCode}</span>
              </p>
            )}
            <label className="label mt-4" htmlFor="code">Verification code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="input" required />
          </>
        )}

        {(mode === 'signin' || mode === 'signup' || (mode === 'forgot' && forgotStep === 'password')) && (
          <>
            <label className="label mt-4" htmlFor="password">{mode === 'signup' || mode === 'forgot' ? 'Create password' : 'Password'}</label>
            <input id="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input" required minLength={8} />
          </>
        )}

        {mode === 'forgot' && forgotStep === 'password' && (
          <>
            <label className="label mt-4" htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input" required minLength={8} />
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        <button className="btn-primary mt-6 w-full" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : forgotStep === 'phone' ? 'Verify number' : forgotStep === 'code' ? 'Confirm code' : 'Save new password'}
        </button>

        <div className="mt-4 flex flex-col gap-2 text-sm">
          {mode === 'signin' && (
            <button type="button" className="text-left font-medium text-brand-700" onClick={() => switchMode('forgot')}>Forgot password</button>
          )}
          {mode === 'signin' ? (
            <button type="button" className="text-left text-slate-600" onClick={() => switchMode('signup')}>Create account</button>
          ) : (
            <button type="button" className="text-left text-slate-600" onClick={() => switchMode('signin')}>Back to sign in</button>
          )}
        </div>
      </form>
    </div>
  );
}
