import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Bot, Lock, Mail } from 'lucide-react';
import { api } from '../services/api';

export default function Login() {
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // In Sensa Smart, backend expects 'identifier', not 'email'
      const res = await api.post('/auth/login', { identifier: email, password });
      const payload = res.data?.data || res.data;
      
      if (payload?.accessToken) {
        setAuth(payload.accessToken, payload.user);
      } else {
        throw new Error('No access token returned');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary mb-4 shadow-lg shadow-primary/20">
          <Bot size={32} className="text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Welcome back</h1>
        <p className="text-sm text-slate-400 mt-1">Sign in to Sensa Admin Dashboard</p>
      </div>

      <form onSubmit={handleLogin} className="w-full space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive border border-destructive/30">
            {error}
          </div>
        )}
        
        <div className="space-y-2">
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input 
              type="email" 
              placeholder="admin@sensa.com" 
              className="pl-10 bg-black/20 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary/50"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input 
              type="password" 
              placeholder="••••••••" 
              className="pl-10 bg-black/20 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary/50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-11 text-base font-medium shadow-md shadow-primary/20" disabled={loading}>
          {loading ? 'Authenticating...' : 'Sign In'}
        </Button>
      </form>
    </div>
  );
}
