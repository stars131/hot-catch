"use client";

import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type TimelineSnapshot = {
  id: string;
  viewCount: number | null;
  likeCount: number | null;
  collectCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  dataSource: "mock-fixture" | "provider";
};

export type TimelineEntry = {
  window: "d1" | "d3" | "d7";
  dueAt: string;
  status: "collected" | "scheduled" | "due";
  snapshot: TimelineSnapshot | null;
};

const WINDOW_LABELS: Record<TimelineEntry["window"], string> = {
  d1: "D+1",
  d3: "D+3",
  d7: "D+7",
};

/** D+1/D+3/D+7 指标时间线：缺失窗口显式给出“已安排/已到期待返回”状态，模拟数据必须打标。 */
export function MetricTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="overflow-x-auto rounded-lg border" data-testid="metric-timeline">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">窗口</th>
            <th className="px-3 py-2 text-left font-medium">采集时间</th>
            <th className="px-3 py-2 text-left font-medium">来源</th>
            <th className="px-3 py-2 text-right font-medium">播放</th>
            <th className="px-3 py-2 text-right font-medium">点赞</th>
            <th className="px-3 py-2 text-right font-medium">收藏</th>
            <th className="px-3 py-2 text-right font-medium">评论</th>
            <th className="px-3 py-2 text-right font-medium">分享</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => (
            <tr key={entry.window} data-testid={`metric-window-${entry.window}`}>
              <td className="px-3 py-2 font-mono">{WINDOW_LABELS[entry.window]}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {entry.status === "collected"
                  ? new Date(entry.dueAt).toLocaleString("zh-CN")
                  : entry.status === "scheduled"
                    ? `已安排 · ${new Date(entry.dueAt).toLocaleString("zh-CN")}`
                    : "已到期 · 等待任务返回"}
              </td>
              <td className="px-3 py-2">
                {entry.snapshot ? <DataSourceBadge dataSource={entry.snapshot.dataSource} /> : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <MetricCell value={entry.snapshot?.viewCount} />
              <MetricCell value={entry.snapshot?.likeCount} />
              <MetricCell value={entry.snapshot?.collectCount} />
              <MetricCell value={entry.snapshot?.commentCount} />
              <MetricCell value={entry.snapshot?.shareCount} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DataSourceBadge({ dataSource }: { dataSource: "mock-fixture" | "provider" }) {
  if (dataSource === "mock-fixture") {
    return (
      <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-700" data-testid="metric-mock-badge">
        <FlaskConical className="h-3 w-3" />
        模拟数据
      </Badge>
    );
  }
  return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">真实数据</Badge>;
}

function MetricCell({ value }: { value: number | null | undefined }) {
  return <td className="px-3 py-2 text-right font-mono">{value == null ? "—" : value.toLocaleString("zh-CN")}</td>;
}
