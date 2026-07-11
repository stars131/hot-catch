import { CredentialProvider } from "@prisma/client";
import { z } from "zod";

export const credentialProviderSchema = z.nativeEnum(CredentialProvider);

export const saveCredentialSchema = z.object({
  provider: credentialProviderSchema,
  value: z.record(z.string(), z.string().max(20000)).refine(
    (value) => Object.values(value).some((entry) => entry.trim().length > 0),
    "凭证内容不能为空。",
  ),
});
