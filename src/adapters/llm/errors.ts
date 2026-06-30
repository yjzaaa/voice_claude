export class LlmError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LlmError';
  }
}

export class LlmTimeoutError extends LlmError {
  constructor(timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
    this.name = 'LlmTimeoutError';
  }
}

export class LlmAuthError extends LlmError {
  constructor(public readonly statusCode: number) {
    super(`LLM authentication failed with status ${statusCode}`);
    this.name = 'LlmAuthError';
  }
}
