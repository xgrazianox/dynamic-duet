import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Database, 
  PieChart, 
  Shield, 
  AlertTriangle, 
  Settings,
  TrendingUp,
  LineChart
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Dati & Prezzi', href: '/inputs', icon: Database },
  { name: 'Target Risk-On', href: '/risk-on', icon: TrendingUp },
  { name: 'Target Risk-Off', href: '/risk-off', icon: Shield },
  { name: 'Rendimenti', href: '/performance', icon: LineChart },
  { name: 'Regole & Alert', href: '/alerts', icon: AlertTriangle },
  { name: 'Impostazioni', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <PieChart className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">AlloStrat</h1>
            <p className="text-xs text-muted-foreground">Dynamic Allocation</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-4">
          <p className="text-xs text-muted-foreground text-center">
            Versione 1.0.0
          </p>
        </div>
      </div>
    </aside>
  );
}
