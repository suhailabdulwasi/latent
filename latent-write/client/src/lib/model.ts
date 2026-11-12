import { useEffect, useState } from "react";
import type { ModelFile } from "@shared/core";

let cache: ModelFile | null = null;
let pending: Promise<ModelFile> | null = null;

export function loadModel(): Promise<ModelFile> {
  if (cache) return Promise.resolve(cache);
  if (!pending) pending = import("@/data/model.json").then((m) => (cache = (m.default ?? m) as unknown as ModelFile));
  return pending;
}

// The detector model (~1.4 MB) loads in the background so the first screen is fast.
export function useModel() {
  const [model, setModel] = useState<ModelFile | null>(cache);
  useEffect(() => { if (!model) loadModel().then(setModel); }, [model]);
  return model;
}

export const pct = (p: number) => `${Math.round(p * 100)}%`;
