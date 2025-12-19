import { useState } from 'react';
import { RefreshCw, Download, Upload, CheckCircle, XCircle, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mockInstruments, mockPricePoints } from '@/lib/mockData';
import { SLEEVES } from '@/types/portfolio';

export default function InputsPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  const getLatestPrice = (instrumentId: string) => {
    const prices = mockPricePoints
      .filter(p => p.instrumentId === instrumentId)
      .sort((a, b) => b.date.localeCompare(a.date));
    return prices[0];
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dati & Prezzi</h1>
          <p className="text-muted-foreground mt-1">
            Gestione strumenti e serie prezzi mensili
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-40"
          />
          <Button variant="outline">
            <Upload className="h-4 w-4" />
            Importa CSV
          </Button>
          <Button>
            <RefreshCw className="h-4 w-4" />
            Aggiorna Quotazioni
          </Button>
        </div>
      </div>

      {/* Instruments Table */}
      <div className="rounded-xl border border-border bg-card card-glow overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="font-semibold">Strumenti Configurati</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {mockInstruments.length} strumenti attivi
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="bg-secondary/30">
                <th>Nome</th>
                <th>Ticker</th>
                <th>Sleeve</th>
                <th>Categoria</th>
                <th>Valuta</th>
                <th>Provider</th>
                <th className="text-right">Ultimo Prezzo</th>
                <th className="text-center">Stato</th>
                <th className="text-center">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {mockInstruments.map(instrument => {
                const latestPrice = getLatestPrice(instrument.id);
                const sleeve = SLEEVES[instrument.sleeveKey];
                
                return (
                  <tr key={instrument.id}>
                    <td className="font-medium">{instrument.name}</td>
                    <td className="font-mono text-sm">{instrument.ticker}</td>
                    <td>{sleeve?.name || instrument.sleeveKey}</td>
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-secondary text-secondary-foreground">
                        {instrument.category}
                      </span>
                    </td>
                    <td className="font-mono">{instrument.currency}</td>
                    <td className="text-sm text-muted-foreground">{instrument.provider}</td>
                    <td className="text-right font-mono">
                      {latestPrice ? (
                        <>
                          {instrument.currency === 'EUR' ? '€' : '$'}
                          {latestPrice.closePrice.toFixed(2)}
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-center">
                      {instrument.isActive ? (
                        <CheckCircle className="h-5 w-5 text-risk-on inline" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive inline" />
                      )}
                    </td>
                    <td className="text-center">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price History for selected instrument */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <h3 className="font-semibold mb-4">Serie Prezzi MSCI World</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {mockPricePoints
              .filter(p => p.instrumentId === '1')
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 12)
              .map(price => (
                <div key={price.id} className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">{price.date}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">€{price.closePrice.toFixed(2)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      price.source === 'AUTO_API' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                    }`}>
                      {price.source === 'AUTO_API' ? 'Auto' : 'Manuale'}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 card-glow">
          <h3 className="font-semibold mb-4">Serie Prezzi Gold</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {mockPricePoints
              .filter(p => p.instrumentId === '10')
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 12)
              .map(price => (
                <div key={price.id} className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm text-muted-foreground">{price.date}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">€{price.closePrice.toFixed(2)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      price.source === 'AUTO_API' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'
                    }`}>
                      {price.source === 'AUTO_API' ? 'Auto' : 'Manuale'}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
