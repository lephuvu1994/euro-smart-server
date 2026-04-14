import React from 'react';
import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { 
  Bot, 
  LayoutDashboard, 
  Users, 
  Settings, 
  Server, 
  Component, 
  Zap,
  LogOut,
  Sun,
  Moon
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Button } from '../components/ui/button';

export default function AdminLayout() {
  const { token, user, logout } = useAuthStore();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const [isDark, setIsDark] = React.useState(() => {
    return localStorage.getItem('theme') !== 'light';
  });

  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const menu = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'AI Assistant', path: '/ai-chat', icon: <Bot size={20} /> },
    { name: 'Devices', path: '/devices', icon: <Server size={20} /> },
    { name: 'Device Models', path: '/device-models', icon: <Component size={20} /> },
    { name: 'Partners', path: '/partners', icon: <Users size={20} /> },
    { name: 'Quota', path: '/quota', icon: <Zap size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  return (
    <div className={`flex h-screen w-full bg-background overflow-hidden ${isDark ? 'dark' : ''}`}>
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-card/50 backdrop-blur-md flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
              S
            </div>
            <span className="font-semibold text-lg tracking-tight">Sensa Smart</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {menu.map((item) => (
            <Link key={item.path} to={item.path}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all ${
                location.pathname.startsWith(item.path) 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}>
                {item.icon}
                <span>{item.name}</span>
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="w-9 h-9 border border-border">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>AD</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.email || 'admin@sensa.com'}</p>
              <p className="text-xs text-muted-foreground uppercase">{user?.role || 'Admin'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full mt-2">
            <Button variant="outline" className="flex-1 justify-start gap-2" onClick={logout}>
              <LogOut size={16} />
              Logout
            </Button>
            <Button 
               variant="outline" 
               size="icon" 
               onClick={() => setIsDark(!isDark)}
               title="Toggle Theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-muted/20">
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
