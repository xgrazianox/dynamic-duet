import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Plus, Menu } from 'lucide-react';
import { Sidebar, NavItems, SidebarHeader } from './Sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useOperationModal } from '@/contexts/operationModalStore';

/** F6-r2 — layout responsive: sidebar fissa solo da md in su; su mobile menu
 * a drawer (hamburger) con la stessa navigazione e deep-link invariati. */
export function MainLayout() {
  const { open } = useOperationModal();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="min-h-screen md:ml-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:justify-end md:px-6">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Apri menu di navigazione">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SidebarHeader />
              <NavItems onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <Button size="sm" onClick={() => open()} aria-label="Registra una nuova operazione">
            <Plus className="mr-2 h-4 w-4" />
            Nuova operazione
          </Button>
        </header>
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
