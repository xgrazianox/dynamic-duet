import { Outlet } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Button } from '@/components/ui/button';
import { useOperationModal } from '@/contexts/OperationModalContext';

export function MainLayout() {
  const { open } = useOperationModal();
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-30 flex items-center justify-end gap-2 border-b border-border bg-background/95 px-6 py-3 backdrop-blur">
          <Button size="sm" onClick={() => open()}>
            <Plus className="mr-2 h-4 w-4" />
            Nuova operazione
          </Button>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
