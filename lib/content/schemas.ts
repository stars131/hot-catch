import { z } from "zod";

export const xhsGraphicOutputSchema = z.object({
  title: z.string().min(5).max(40),
  titleOptions: z.array(z.string().min(5).max(40)).min(3).max(10),
  coverTextOptions: z.array(z.string().min(2).max(24)).min(2).max(6),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().positive(),
        heading: z.string().min(1).max(50),
        body: z.string().min(10).max(1200),
        visualSuggestion: z.string().min(2).max(500),
      }),
    )
    .min(3)
    .max(20),
  bodyText: z.string().min(100).max(10000),
  tags: z.array(z.string().min(1).max(30)).min(3).max(15),
  interactionEnding: z.string().min(5).max(500),
  riskNotes: z.array(z.string().max(500)).max(10),
});

export const douyinShotSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  voiceover: z.string().min(1).max(1000),
  visual: z.string().min(1).max(1000),
  subtitle: z.string().min(1).max(500),
  camera: z.string().min(1).max(300),
  transition: z.string().min(1).max(300),
  music: z.string().min(1).max(300),
  risk: z.string().max(500).default(""),
});

export const douyinVideoScriptOutputSchema = z
  .object({
    title: z.string().min(5).max(60),
    hook: z.string().min(3).max(500),
    durationSec: z.number().int().min(10).max(600),
    shots: z.array(douyinShotSchema).min(2).max(100),
    caption: z.string().min(20).max(5000),
    tags: z.array(z.string().min(1).max(30)).min(3).max(15),
    riskNotes: z.array(z.string().max(500)).max(10),
  })
  .superRefine((value, ctx) => {
    let previousEnd = 0;
    value.shots.forEach((shot, index) => {
      if (shot.endSec <= shot.startSec) {
        ctx.addIssue({
          code: "custom",
          path: ["shots", index, "endSec"],
          message: "结束时间必须晚于开始时间。",
        });
      }
      if (index === 0 && shot.startSec !== 0) {
        ctx.addIssue({ code: "custom", path: ["shots", 0, "startSec"], message: "第一镜必须从 0 秒开始。" });
      }
      if (index > 0 && Math.abs(shot.startSec - previousEnd) > 0.2) {
        ctx.addIssue({
          code: "custom",
          path: ["shots", index, "startSec"],
          message: "分镜时间必须连续，误差不超过 0.2 秒。",
        });
      }
      previousEnd = shot.endSec;
    });
    if (Math.abs(previousEnd - value.durationSec) > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["durationSec"],
        message: "最后一镜结束时间必须与总时长一致，误差不超过 1 秒。",
      });
    }
  });

export type XhsGraphicOutput = z.infer<typeof xhsGraphicOutputSchema>;
export type DouyinVideoScriptOutput = z.infer<typeof douyinVideoScriptOutputSchema>;
