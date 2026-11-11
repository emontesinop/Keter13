import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

export interface LlmMessage { role: "user" | "assistant"; content: string; }
export interface LlmRequest { system: string; messages: LlmMessage[]; maxTokens?: number; }
export interface LlmResponse { text: string; model: string; provider: string; refused?: boolean; }

export interface LlmProvider { name: string; available: boolean; complete(req: LlmRequest): Promise<LlmResponse>; }

/** Claude via the official Anthropic SDK (server-side only; the key never reaches the client). */
export class AnthropicProvider implements LlmProvider {
  name = "anthropic";
  available = true;
  private client = new Anthropic(); // resolves ANTHROPIC_API_KEY (or other SDK credential sources) from the environment
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const stream = this.client.beta.messages.stream({
      model: config.llm.anthropicModel,
      max_tokens: req.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: config.llm.anthropicEffort },
      // Server-side refusal fallback (routes a declined request to a suitable fallback model).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // The system prompt is stable per mode → cacheable prefix.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
    } as any);
    const msg: any = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return { text: "", model: msg.model, provider: this.name, refused: true };
    const text = (msg.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    return { text, model: msg.model, provider: this.name };
  }
}

/** Any OpenAI-compatible chat-completions endpoint (Groq, OpenRouter, a local Ollama/LM Studio server, ...). */
export class OpenAICompatibleProvider implements LlmProvider {
  name = "openai_compatible";
  available = !!(config.llm.openaiBaseUrl && config.llm.openaiModel);
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const res = await fetch(`${config.llm.openaiBaseUrl!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(config.llm.openaiApiKey ? { Authorization: `Bearer ${config.llm.openaiApiKey}` } : {}) },
      body: JSON.stringify({ model: config.llm.openaiModel, max_tokens: req.maxTokens ?? 4000, messages: [{ role: "system", content: req.system }, ...req.messages] }),
    });
    if (!res.ok) throw new Error(`LLM provider error ${res.status}`);
    const j: any = await res.json();
    return { text: j.choices?.[0]?.message?.content?.trim() ?? "", model: config.llm.openaiModel!, provider: this.name };
  }
}

export class NoLlmProvider implements LlmProvider {
  name = "none";
  available = false;
  async complete(): Promise<LlmResponse> { throw new Error("No LLM provider configured"); }
}

export function createLlmProvider(): LlmProvider {
  switch (config.llm.provider) {
    case "anthropic": return new AnthropicProvider();
    case "openai_compatible": return new OpenAICompatibleProvider();
    default: return new NoLlmProvider();
  }
}
