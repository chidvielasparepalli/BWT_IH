import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Eye, EyeOff, Leaf, LockKeyhole, MapPin, ShoppingBasket, Sprout, Truck } from 'lucide-react';
import { useApp } from '../../app/providers';
import { DEMO_PASSWORD, DEMO_USERS } from '../../lib/demo';
import type { AppUser } from '../../types';

export default function AuthPage() {
  const { signIn, signUp, loadDemo, modeLabel, toast } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('Hyderabad, Telangana');
  const [role, setRole] = useState<'buyer' | 'farmer'>('buyer');
  const [buyerType, setBuyerType] = useState<AppUser['buyerType']>('household');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seeded, setSeeded] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setLoading(true); setError('');
    try { await action(); navigate('/home'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setLoading(false); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') return void run(() => signIn({ email, password }));
    if (!name.trim() || !email.includes('@') || password.length < 8) { setError('Enter your name, a valid email and a password of at least 8 characters.'); return; }
    return void run(() => signUp({ email, password, name, location, role, buyerType }));
  };
  const quickLogin = (account: AppUser) => {
    setEmail(account.email); setPassword(DEMO_PASSWORD);
    void run(() => signIn({ email: account.email, password: DEMO_PASSWORD }));
  };
  const onLoadDemo = async () => {
    setLoading(true); setError('');
    try { await loadDemo(); setSeeded(true); toast('Demo data is ready', 'success', 'Choose an account below to explore its workspace.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load demo accounts.'); }
    finally { setLoading(false); }
  };
  const demoAccounts = [
    { role: 'Buyer · Household', detail: 'Madhavi Sharma', user: DEMO_USERS.find(u => u.uid === 'buyer-household')! },
    { role: 'Buyer · Restaurant', detail: 'Arjun Kitchens', user: DEMO_USERS.find(u => u.uid === 'buyer-restaurant')! },
    { role: 'Buyer · Retailer', detail: 'Fresh Corner Store', user: DEMO_USERS.find(u => u.uid === 'buyer-retailer')! },
    { role: 'Farmer · Guntur', detail: 'Srinivas Reddy', user: DEMO_USERS.find(u => u.uid === 'farmer-guntur')! },
    { role: 'Farmer · Warangal', detail: 'Lakshmi Devi', user: DEMO_USERS.find(u => u.uid === 'farmer-warangal')! },
    { role: 'Farmer · Nizamabad', detail: 'Mohammed Kareem', user: DEMO_USERS.find(u => u.uid === 'farmer-nizamabad')! },
    { role: 'Farmer · Khammam', detail: 'Padma Rao', user: DEMO_USERS.find(u => u.uid === 'farmer-khammam')! },
    { role: 'Farmer · Vijayawada', detail: 'Anil Kumar', user: DEMO_USERS.find(u => u.uid === 'farmer-vijayawada')! },
    { role: 'Admin', detail: 'Moderation console', user: DEMO_USERS.find(u => u.role === 'admin')! },
  ];
  return <main className="auth-page">
    <div className="auth-visual">
      <div className="auth-visual-image" />
      <div className="auth-visual-overlay" />
      <div className="auth-visual-top"><span className="mark-inverse"><Leaf size={17}/></span><span>HarvestLink <i>·</i> HACK-P309</span></div>
      <div className="auth-story">
        <span className="eyebrow light-eyebrow">GROWN NEAR YOU</span>
        <h1>Good food has a <em>local</em> story.</h1>
        <p>Meet the people who grow your food. Know what is in season. Order with confidence.</p>
        <div className="auth-trust-row"><span><Sprout size={16}/> Farm-first sourcing</span><span><MapPin size={16}/> Telangana & Andhra</span></div>
      </div>
      <div className="auth-caption"><span>01 / THE HARVEST</span><span>Direct from the field, not the warehouse.</span></div>
    </div>
    <div className="auth-form-side">
      <div className="auth-mobile-brand"><span className="brand-mark"><span>h</span><i/></span><span className="brand-name">harvest<span>link</span></span></div>
      <div className="auth-form-wrap">
        <div className="auth-intro"><span className="eyebrow">THE LOCAL PRODUCE MARKET</span><h2>{mode === 'signin' ? 'Welcome back.' : 'Join the harvest.'}</h2><p>{mode === 'signin' ? 'Sign in to find fresh produce or manage your farm.' : 'Create your account. You can change your mind about what to grow later.'}</p></div>
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <>
            <label>Full name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ananya Rao" autoComplete="name" required /></label>
            <label>I am joining as<select value={role} onChange={e => setRole(e.target.value as 'buyer' | 'farmer')}><option value="buyer">Buyer — shop local produce</option><option value="farmer">Farmer — list my harvest</option></select></label>
            {role === 'buyer' && <label>Buyer type<select value={buyerType} onChange={e => setBuyerType(e.target.value as AppUser['buyerType'])}><option value="household">Household</option><option value="retailer">Retailer</option><option value="restaurant">Restaurant / Cafe</option><option value="wholesaler">Wholesaler</option></select></label>}
            <label>Location<input value={location} onChange={e => setLocation(e.target.value)} placeholder="District, State" required /></label>
          </>}
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<span className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /><button type="button" onClick={() => setShowPassword(x => !x)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span></label>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading ? <span className="spinner"/> : <>{mode === 'signin' ? 'Sign in to HarvestLink' : 'Create account'} <ArrowRight size={17}/></>}</button>
          <div className="auth-secure"><LockKeyhole size={13}/> Your account and orders stay yours.</div>
        </form>
        <div className="demo-divider"><span/> <span>OR EXPLORE THE DEMO</span> <span/></div>
        {!seeded && <button type="button" className="button button-outline load-demo-button" onClick={onLoadDemo} disabled={loading}><ShoppingBasket size={16}/>{loading ? 'Preparing demo…' : 'Load demo data'}</button>}
        <div className="demo-account-list">
          {demoAccounts.map(demo => <button type="button" className="demo-account" key={demo.user.uid} title={demo.user.email} onClick={() => quickLogin(demo.user)} disabled={loading}>
            <span className={`demo-avatar avatar-${demo.user.role}`}>{demo.user.role === 'farmer' ? <Sprout size={17}/> : demo.user.role === 'admin' ? <LockKeyhole size={16}/> : <ShoppingBasket size={17}/>}</span>
            <span className="demo-account-copy"><strong>{demo.role}</strong><small>{demo.user.email}</small></span><ArrowRight size={15} className="demo-arrow"/>
          </button>)}
        </div>
        <p className="auth-mode-note"><span className={modeLabel.startsWith('Firebase') ? 'mode-dot connected' : 'mode-dot'} />{modeLabel}</p>
        {!modeLabel.startsWith('Firebase') && <p className="demo-password-note">Demo password: <code>{DEMO_PASSWORD}</code></p>}
        <p className="auth-footnote"><Check size={13}/> No real payments. No connected delivery network.</p>
      </div>
    </div>
  </main>;
}
