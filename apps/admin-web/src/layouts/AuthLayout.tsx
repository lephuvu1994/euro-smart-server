import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function AuthLayout() {
  const token = useAuthStore((state) => state.token);

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-background to-background">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1558002038-1055907df827?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
      <div className="relative z-10 w-full max-w-md p-6">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
