import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Humanizer from "@/pages/humanizer";
import Detector from "@/pages/detector";
import Accuracy from "@/pages/accuracy";
import { Shell } from "@/components/shell";

export default function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <Router hook={useHashLocation}>
        <Shell>
          <Switch>
            <Route path="/" component={Humanizer} />
            <Route path="/detector" component={Detector} />
            <Route path="/accuracy" component={Accuracy} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
      </Router>
    </TooltipProvider>
  );
}
