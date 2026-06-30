import { LlmRequest } from '../../../ports/incoming/LlmClient';
import { HttpsJsonClient } from '../internal/HttpsJsonClient';
import { Provider, ProviderConfig } from '../Provider';

export class OpenAiCompatibleProvider implements Provider {
  readonly name: string = 'openai-compatible';

  constructor(private http: HttpsJsonClient) {}

  async complete(req: LlmRequest, cfg: ProviderConfig): Promise<string | null> {
    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0,
    };

    const res = (await this.http.post(
      `${cfg.apiUrl}/chat/completions`,
      body,
      {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      cfg.timeoutMs,
    )) as any;

    const content = res?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  }
}
