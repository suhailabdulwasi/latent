import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Shell } from "@/components/shell";
import { InternBoardPage, FullTimeBoardPage } from "@/pages/board";
import PipelinePage from "@/pages/pipeline";
import InsightsPage from "@/pages/insights";
import ProfilePage from "@/pages/profile";

function AppRouter() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={InternBoardPage} />
        <Route path="/fulltime" component={FullTimeBoardPage} />
        <Route path="/pipeline" component={PipelinePage} />
        <Route path="/insights" component={InsightsPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
