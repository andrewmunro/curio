interface PuterAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

interface PuterAIContentBlock {
  type: string;
  text?: string;
}

interface PuterAIChatResponse {
  message: {
    content: string | PuterAIContentBlock[];
    role: string;
  };
}

interface PuterAI {
  chat(
    messages: string | PuterAIChatMessage[],
    options?: { model?: string; temperature?: number; max_tokens?: number; stream?: boolean }
  ): Promise<PuterAIChatResponse>;
}

interface Puter {
  ai: PuterAI;
}

declare const puter: Puter;
