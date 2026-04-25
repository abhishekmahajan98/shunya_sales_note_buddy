import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Loader2, ArrowRight, Sparkles, Eye, EyeOff, Shield } from 'lucide-react';

interface AuthProps {
  onLogin: (token: string, user: any) => void;
}

export default function Auth({ onLogin }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    try {
      const response = await fetch(`${endpoint}?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.status === 'success') {
        if (isLogin) {
          onLogin(data.session.access_token, data.user);
        } else {
          setIsLogin(true);
          setSuccessMsg('Account created! Please sign in.');
        }
      } else {
        setError(data.detail || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: 'var(--bg-base)' }}>

      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.08) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        {/* Grid pattern */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(to right, rgba(99,102,241,0.03) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo + brand */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="relative inline-flex items-center justify-center w-20 h-20 mb-6"
          >
            {/* Animated rings */}
            <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-ring-spin" />
            <div className="absolute inset-2 rounded-full border border-purple-500/15 animate-ring-reverse" />
            <div className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent)', filter: 'blur(8px)' }} />
            <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: 'radial-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.15))',
                border: '1px solid rgba(99,102,241,0.35)',
                boxShadow: '0 0 32px rgba(99,102,241,0.2)',
              }}>
              <Sparkles className="w-8 h-8 text-indigo-400" />
            </div>
          </motion.div>

          <h1 className="text-4xl font-black tracking-tight mb-2 font-['Space_Grotesk']">
            Shunya <span className="text-gradient">Note Buddy</span>
          </h1>
          <div className="flex items-center justify-center gap-2">
            <div className="h-px w-12" style={{ background: 'linear-gradient(to right, transparent, rgba(99,102,241,0.5))' }} />
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--text-muted)' }}>
              Sales Intelligence Suite
            </p>
            <div className="h-px w-12" style={{ background: 'linear-gradient(to left, transparent, rgba(99,102,241,0.5))' }} />
          </div>
        </div>

        {/* Card */}
        <div className="rounded-3xl p-8 relative overflow-hidden"
          style={{
            background: 'rgba(13,17,23,0.8)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
          }}>

          {/* Card inner glow top */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px"
            style={{ background: 'linear-gradient(to right, transparent, rgba(99,102,241,0.5), transparent)' }} />

          {/* Tab switcher */}
          <div className="flex rounded-xl p-1 mb-7" style={{ background: 'rgba(6,8,15,0.6)' }}>
            {['Sign In', 'Sign Up'].map((tab, i) => {
              const active = (i === 0) === isLogin;
              return (
                <button key={tab}
                  onClick={() => { setIsLogin(i === 0); setError(''); setSuccessMsg(''); }}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
                    color: active ? '#a5b4fc' : 'var(--text-muted)',
                    border: active ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                  }}>
                  {tab}
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.form
              key={isLogin ? 'login' : 'register'}
              initial={{ opacity: 0, x: isLogin ? -16 : 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isLogin ? 16 : -16 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {/* Email field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors"
                    style={{ color: email ? '#6366f1' : 'var(--text-muted)' }} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-premium"
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors"
                    style={{ color: password ? '#6366f1' : 'var(--text-muted)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-premium pr-12"
                    placeholder="••••••••"
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl p-3.5 text-sm font-medium"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                    {error}
                  </motion.div>
                )}
                {successMsg && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl p-3.5 text-sm font-medium"
                    style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7' }}>
                    {successMsg}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={loading}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all mt-2"
                style={{
                  background: loading
                    ? 'rgba(99,102,241,0.2)'
                    : 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
                  color: loading ? '#6366f1' : 'white',
                  boxShadow: loading ? 'none' : '0 4px 24px rgba(99,102,241,0.4)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  letterSpacing: '0.02em',
                }}>
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {isLogin ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </motion.form>
          </AnimatePresence>

          {/* Security note */}
          <div className="mt-6 flex items-center justify-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <Shield className="w-3 h-3" />
            <span>Secured with Supabase Auth · End-to-end encrypted</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
