"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { readApiJson } from "@/lib/api-client";
import { MetricTimeline, type TimelineEntry } from "@/components/performance/metric-timeline";

type PerformanceRecord = {
  id: string;
  status: string;
  publishedAt: string | null;
  publicUrl: string | null;
  simulated: boolean;
  availability: { available: true } | { available: false; reason: string; message: string };
  timeline: TimelineEntry[];
};

type PerformanceResponse = {
  performance: {
    content: { id: string; title: string | null };
    records: PerformanceRecord[];
  };
};

/**
 * 单条发布记录的数据表现面板：只展示服务端判定的可用性与 D+1/D+3/D+7 时间线。
 * 没有真实发布就显式说明原因，绝不渲染任何伪造的表现数字。
 */
export function RecordPerformance({ contentId, recordId }: { contentId: string; recordId: string }) {
  const [record, setRecord] = useState<PerformanceRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await readApiJson<PerformanceResponse>(
        await fetch(`/api/content/${contentId}/performance`, { cache: "no-store" }),
      );
      setRecord(data.performance.records.find((item) => item.id === recordId) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "数据表现加载失败");
    } finally {
      setLoading(false);
    }
  }, [contentId, recordId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取数据表现…</div>;
  }
  if (error) {
    return <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>;
  }
  if (!record) {
    return <p className="rounded-lg border p-3 text-sm text-muted-foreground">找不到该发布记录的数据表现。</p>;
  }
  if (!record.availability.available) {
    return (
      <div className="rounded-lg border border-dashed p-4" data-testid="performance-unavailable">
        <p className="text-sm font-medium">暂无真实指标数据</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{record.availability.message}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="performance-timeline">
      {record.simulated ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs leading-5 text-sky-900" data-testid="performance-simulated-note">
          该记录来自本地模拟供应商：以下指标是夹具数据，仅用于验证流程，不代表真实平台表现。
        </p>
      ) : null}
      <MetricTimeline entries={record.timeline} />
    </div>
  );
}
