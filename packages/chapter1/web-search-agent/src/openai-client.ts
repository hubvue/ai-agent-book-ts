import OpenAI from "openai";

import type {
  ChatClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "./types.js";

export class OpenAIChatClient implements ChatClient {
  readonly #client: OpenAI;

  constructor(options: { apiKey: string; baseUrl: string }) {
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
  }

  async complete(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const { timeout, ...requestBody } = request;
    const response = await this.#client.chat.completions.create(
      requestBody as never,
      timeout ? { timeout } : undefined,
    );
    return JSON.parse(JSON.stringify(response)) as ChatCompletionResponse;
  }
}
