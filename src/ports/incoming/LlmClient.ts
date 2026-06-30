export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
}

export interface LlmClient {
  complete(req: LlmRequest, timeoutMs?: number): Promise<string | null>;
}
