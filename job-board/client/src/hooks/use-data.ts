import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { JobsResponse, Profile, Tracked } from "@shared/schema";
import { DEFAULT_PROFILE } from "@shared/schema";
import { useMemo } from "react";
import { scoreJob, type Scored } from "@/lib/score";

export function useJobs() {
  return useQuery<JobsResponse>({
    queryKey: ["/api/jobs"],
    refetchInterval: (q) => (q.state.data?.syncing || !q.state.data?.syncedAt ? 4000 : 30 * 60 * 1000),
    refetchOnWindowFocus: true,
  });
}

export function useProfile() {
  const q = useQuery<Profile>({ queryKey: ["/api/profile"] });
  return { ...q, profile: q.data ?? DEFAULT_PROFILE };
}

export function useTracked() {
  const q = useQuery<Tracked[]>({ queryKey: ["/api/tracked"] });
  const map = useMemo(() => new Map((q.data ?? []).map((t) => [t.jobId, t])), [q.data]);
  return { ...q, tracked: q.data ?? [], map };
}

export function useScoredJobs(): { jobs: Scored[]; data?: JobsResponse; isLoading: boolean } {
  const { data, isLoading } = useJobs();
  const { profile } = useProfile();
  const jobs = useMemo(() => (data?.jobs ?? []).map((j) => scoreJob(j, profile)), [data, profile]);
  return { jobs, data, isLoading };
}

export function useTrack() {
  return useMutation({
    mutationFn: async (t: { jobId: string; status: string; notes?: string; title: string; company: string; url: string; location?: string }) =>
      (await apiRequest("POST", "/api/tracked", { notes: "", location: "", ...t })).json(),
    onMutate: async (t) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tracked"] });
      const prev = queryClient.getQueryData<Tracked[]>(["/api/tracked"]) ?? [];
      const existing = prev.find((p) => p.jobId === t.jobId);
      const next: Tracked = { notes: existing?.notes ?? "", location: "", ...existing, ...t, updatedAt: Date.now() } as Tracked;
      queryClient.setQueryData<Tracked[]>(["/api/tracked"], [...prev.filter((p) => p.jobId !== t.jobId), next]);
      return { prev };
    },
    onError: (_e, _t, ctx) => ctx && queryClient.setQueryData(["/api/tracked"], ctx.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/tracked"] }),
  });
}

export function useOwner() {
  const q = useQuery<{ owner: boolean }>({ queryKey: ["/api/owner"], staleTime: Infinity });
  return { ...q, owner: !!q.data?.owner };
}

export function useUntrack() {
  return useMutation({
    mutationFn: async (jobId: string) => (await apiRequest("DELETE", `/api/tracked/${encodeURIComponent(jobId)}`)).json(),
    onMutate: async (jobId) => {
      const prev = queryClient.getQueryData<Tracked[]>(["/api/tracked"]) ?? [];
      queryClient.setQueryData<Tracked[]>(["/api/tracked"], prev.filter((p) => p.jobId !== jobId));
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx && queryClient.setQueryData(["/api/tracked"], ctx.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/tracked"] }),
  });
}

export function useSaveProfile() {
  return useMutation({
    mutationFn: async (p: Profile) => (await apiRequest("PUT", "/api/profile", p)).json(),
    onSuccess: (p) => queryClient.setQueryData(["/api/profile"], p),
  });
}

export function useRefresh() {
  return useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/refresh")).json(),
    onSuccess: () => {
      const cur = queryClient.getQueryData<JobsResponse>(["/api/jobs"]);
      if (cur) queryClient.setQueryData(["/api/jobs"], { ...cur, syncing: true });
    },
  });
}
