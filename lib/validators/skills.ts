import { z } from "zod";

export const skillExternalIdSchema = z
  .string()
  .regex(/^(?:builtin|custom)\.[a-z0-9._-]{2,80}$/, "Skill ID 格式不正确");

const skillFieldsSchema = z.object({
  name: z.string().trim().min(1, "请填写名称").max(80),
  description: z.string().trim().min(1, "请填写用途说明").max(300),
  instructions: z.string().trim().min(1, "请填写执行说明").max(4000),
});

export const createSkillSchema = skillFieldsSchema.strict();

export const updateSkillSchema = z
  .object({
    id: skillExternalIdSchema,
    name: skillFieldsSchema.shape.name.optional(),
    description: skillFieldsSchema.shape.description.optional(),
    instructions: skillFieldsSchema.shape.instructions.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.instructions !== undefined ||
      value.enabled !== undefined,
    "至少提交一个要修改的字段",
  );

export const selectedSkillIdsSchema = z
  .array(skillExternalIdSchema)
  .max(8, "一次创作最多选择 8 个 Skill")
  .default([])
  .transform((ids) => [...new Set(ids)]);

export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
