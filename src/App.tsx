import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { SignalEngineProvider } from "./contexts/SignalEngineContext";
import Index from "./pages/Index";
import InputsPage from "./pages/InputsPage";
import RiskOnPage from "./pages/RiskOnPage";
import RiskOffPage from "./pages/RiskOffPage";
import AlertsPage from "./pages/AlertsPage";
import SettingsPage from "./pages/SettingsPage";
import PerformancePage from "./pages/PerformancePage";
import SignalsPage from "./pages/SignalsPage";
import PortfolioPage from "./pages/PortfolioPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SignalEngineProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/inputs" element={<InputsPage />} />
              <Route path="/signals" element={<SignalsPage />} />
              <Route path="/risk-on" element={<RiskOnPage />} />
              <Route path="/risk-off" element={<RiskOffPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/performance" element={<PerformancePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SignalEngineProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
