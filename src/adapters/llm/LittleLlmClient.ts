import { LlmClient, LlmRequest } from '../../ports/incoming/LlmClient';
import { Provider, ProviderConfig } from './Provider';

export class LittleLlmClient implements LlmClient {
  constructor(
    private provider: Provider,
    private config: ProviderConfig,
  ) {}

  async complete(req: LlmRequest, timeoutMs?: number): Promise<string | null> {
    const cfg = timeoutMs !== undefined ? { ...this.config, timeoutMs } : this.config;
    return this.provider.complete(req, cfg);
  }
}
