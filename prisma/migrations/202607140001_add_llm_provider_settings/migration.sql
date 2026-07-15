-- Extend encrypted credentials with OpenAI and xAI providers.
ALTER TYPE "CredentialProvider" ADD VALUE IF NOT EXISTS 'openai';
ALTER TYPE "CredentialProvider" ADD VALUE IF NOT EXISTS 'grok';

-- Store the user's explicit default generation provider separately from
-- non-LLM integration credentials.
CREATE TYPE "LlmProviderName" AS ENUM ('deepseek', 'openai', 'grok');

ALTER TABLE "User"
ADD COLUMN "defaultLlmProvider" "LlmProviderName";
