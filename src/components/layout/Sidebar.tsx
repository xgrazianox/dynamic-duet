import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Database, PieChart, Shield, Settings, TrendingUp, LineChart, Radio, Wallet, Compass,
} from 'lucide-react';

/** F6-r2 — sei aree primarie. Gli Alert sono un accesso secondario dalla Dashboard. */
const NAV: Array<
  | { kind: 'link'; name: string; href: string; icon: typeof LayoutDashboard }
  | { kind: 'group'; name: string; icon: typeof LayoutDashboard; children: { name: string; href: string; icon: typeof LayoutDashboard }[] }
> = [
  { kind: 'link', name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { kind: 'link', name: 'Portafoglio', href: '/portfolio', icon: Wallet },
  { kind: 'group', name: 'Strategia', icon: Compass, children: [
    { name: 'Signal Engine', href: '/signals', icon: Radio },
    { name: 'Target Risk-On', href: '/risk-on', icon: TrendingUp },
    { name: 'Target Risk-Off', href: '/risk-off', icon: Shield },
  ]},
  { kind: 'link', name: 'Strumenti & Prezzi', href: '/inputs', icon: Database },
  { kind: 'link', name: 'Rendimenti', href: '/performance', icon: LineChart },
  { kind: 'link', name: 'Impostazioni', href: '/settings', icon: Settings },
];

export function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const link = (name: string, href: string, Icon: typeof LayoutDashboard, indent = false) => (
    <NavLink key={href} to={href} onClick={onNavigate}
      className={`nav-link ${location.pathname === href ? 'active' : ''} ${indent ? 'ml-6' : ''}`}>
      <Icon className="h-5 w-5" />{name}
    </NavLink>
  );
  return (
    <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navigazione principale">
      {NAV.map(item => item.kind === 'link'
        ? link(item.name, item.href, item.icon)
        : (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center gap-3 px-3 pt-2 text-xs font-semibold uppercase text-muted-foreground">
              <item.icon className="h-4 w-4" />{item.name}
            </div>
            {item.children.map(c => link(c.name, c.href, c.icon, true))}
          </div>
        ))}
    </nav>
  );
}

export function SidebarHeader() {
  return (
    <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
        <PieChart className="h-5 w-5 text-primary-foreground" />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Regime Navigator</h1>
        <p className="text-xs text-muted-foreground">Allocazione Dinamica</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-border bg-sidebar md:block">
      <div className="flex h-full flex-col">
        <SidebarHeader />
        <NavItems />
        <div className="border-t border-sidebar-border p-4">
          <p className="text-center text-xs text-muted-foreground">Versione 1.0.0</p>
        </div>
      </div>
    </aside>
  );
}
