import { LlmRequest } from '../../ports/incoming/LlmClient';

export interface ProviderConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
}

export interface Provider {
  readonly name: string;
  complete(req: LlmRequest, cfg: ProviderConfig): Promise<string | null>;
}
