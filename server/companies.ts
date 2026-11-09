import type { Stage } from "@shared/schema";

export interface Company {
  name: string;
  slug: string;
  ats: "ashby" | "greenhouse";
  sector: string;
  stage: Stage; // approximate funding stage
}

// Stage buckets are approximate: Early = Seed–Series B, Growth = Series C+,
// Late-stage = very large private valuations / frontier labs.
export const COMPANIES: Company[] = [
  // Frontier labs & late-stage
  { name: "OpenAI", slug: "openai", ats: "ashby", sector: "Foundation models", stage: "Late-stage" },
  { name: "Anthropic", slug: "anthropic", ats: "greenhouse", sector: "Foundation models", stage: "Late-stage" },
  { name: "xAI", slug: "xai", ats: "greenhouse", sector: "Foundation models", stage: "Late-stage" },
  { name: "Thinking Machines Lab", slug: "thinkingmachines", ats: "ashby", sector: "Foundation models", stage: "Late-stage" },
  { name: "Databricks", slug: "databricks", ats: "greenhouse", sector: "Data & AI platform", stage: "Late-stage" },
  { name: "Scale AI", slug: "scaleai", ats: "greenhouse", sector: "AI data", stage: "Late-stage" },
  { name: "Perplexity", slug: "perplexity", ats: "ashby", sector: "AI search", stage: "Late-stage" },
  { name: "Cursor", slug: "cursor", ats: "ashby", sector: "AI dev tools", stage: "Late-stage" },
  { name: "Cognition", slug: "cognition", ats: "ashby", sector: "AI dev tools", stage: "Late-stage" },
  { name: "Harvey", slug: "harvey", ats: "ashby", sector: "Vertical AI · Legal", stage: "Late-stage" },
  { name: "Sierra", slug: "sierra", ats: "ashby", sector: "AI agents", stage: "Late-stage" },
  { name: "ElevenLabs", slug: "elevenlabs", ats: "ashby", sector: "Voice AI", stage: "Late-stage" },
  { name: "Mercor", slug: "mercor", ats: "ashby", sector: "AI data", stage: "Late-stage" },
  { name: "Figure", slug: "figureai", ats: "greenhouse", sector: "Robotics", stage: "Late-stage" },
  { name: "Glean", slug: "gleanwork", ats: "greenhouse", sector: "Enterprise AI", stage: "Late-stage" },
  { name: "Ramp", slug: "ramp", ats: "ashby", sector: "Fintech", stage: "Late-stage" },
  { name: "Notion", slug: "notion", ats: "ashby", sector: "Productivity", stage: "Late-stage" },

  // Growth
  { name: "Cohere", slug: "cohere", ats: "ashby", sector: "Foundation models", stage: "Growth" },
  { name: "Decagon", slug: "decagon", ats: "ashby", sector: "AI agents", stage: "Growth" },
  { name: "Baseten", slug: "baseten", ats: "ashby", sector: "AI infra", stage: "Growth" },
  { name: "Fireworks AI", slug: "fireworks", ats: "ashby", sector: "AI infra", stage: "Growth" },
  { name: "Together AI", slug: "togetherai", ats: "greenhouse", sector: "AI infra", stage: "Growth" },
  { name: "Modal", slug: "modal", ats: "ashby", sector: "AI infra", stage: "Growth" },
  { name: "Lambda", slug: "lambda", ats: "ashby", sector: "AI infra", stage: "Growth" },
  { name: "LangChain", slug: "langchain", ats: "ashby", sector: "AI dev tools", stage: "Growth" },
  { name: "Replit", slug: "replit", ats: "ashby", sector: "AI dev tools", stage: "Growth" },
  { name: "Factory", slug: "factory", ats: "ashby", sector: "AI dev tools", stage: "Growth" },
  { name: "Deepgram", slug: "deepgram", ats: "ashby", sector: "Voice AI", stage: "Growth" },
  { name: "Suno", slug: "suno", ats: "ashby", sector: "Generative media", stage: "Growth" },
  { name: "Synthesia", slug: "synthesia", ats: "ashby", sector: "Generative media", stage: "Growth" },
  { name: "Writer", slug: "writer", ats: "ashby", sector: "Enterprise AI", stage: "Growth" },
  { name: "Hex", slug: "hex", ats: "ashby", sector: "Data tools", stage: "Growth" },
  { name: "Supabase", slug: "supabase", ats: "ashby", sector: "Dev infra", stage: "Growth" },
  { name: "Abridge", slug: "abridge", ats: "ashby", sector: "Vertical AI · Health", stage: "Growth" },
  { name: "Cresta", slug: "cresta", ats: "greenhouse", sector: "AI agents", stage: "Growth" },
  { name: "Snorkel AI", slug: "snorkelai", ats: "greenhouse", sector: "AI data", stage: "Growth" },
  { name: "Abnormal AI", slug: "abnormalsecurity", ats: "greenhouse", sector: "AI security", stage: "Growth" },
  { name: "Physical Intelligence", slug: "physicalintelligence", ats: "ashby", sector: "Robotics", stage: "Growth" },
  { name: "World Labs", slug: "worldlabs", ats: "ashby", sector: "Foundation models", stage: "Growth" },
  { name: "Periodic Labs", slug: "periodic-labs", ats: "ashby", sector: "AI for science", stage: "Growth" },
  { name: "Liquid AI", slug: "liquid-ai", ats: "ashby", sector: "Foundation models", stage: "Growth" },
  { name: "Exa", slug: "exa", ats: "ashby", sector: "AI search", stage: "Growth" },
  { name: "Gamma", slug: "gamma", ats: "ashby", sector: "AI apps", stage: "Growth" },
  { name: "Granola", slug: "granola", ats: "ashby", sector: "AI apps", stage: "Growth" },
  { name: "Vannevar Labs", slug: "vannevarlabs", ats: "greenhouse", sector: "Defense AI", stage: "Growth" },
  { name: "AssemblyAI", slug: "assemblyai", ats: "greenhouse", sector: "Voice AI", stage: "Growth" },
  { name: "Poolside", slug: "poolside", ats: "ashby", sector: "Foundation models", stage: "Growth" },
  { name: "Pinecone", slug: "pinecone", ats: "ashby", sector: "AI infra", stage: "Growth" },

  // Early (Seed – Series B)
  { name: "Cartesia", slug: "cartesia", ats: "ashby", sector: "Voice AI", stage: "Early" },
  { name: "Rogo", slug: "rogo", ats: "ashby", sector: "Vertical AI · Finance", stage: "Early" },
  { name: "Listen Labs", slug: "listenlabs", ats: "ashby", sector: "AI apps", stage: "Early" },
  { name: "Parallel Web Systems", slug: "parallel", ats: "ashby", sector: "AI search", stage: "Early" },
  { name: "Tennr", slug: "tennr", ats: "ashby", sector: "Vertical AI · Health", stage: "Early" },
  { name: "Pylon", slug: "pylon", ats: "ashby", sector: "AI apps", stage: "Early" },
  { name: "Numeric", slug: "numeric", ats: "ashby", sector: "Vertical AI · Finance", stage: "Early" },
  { name: "Stack AI", slug: "stack-ai", ats: "ashby", sector: "AI agents", stage: "Early" },
  { name: "Tavus", slug: "tavus", ats: "ashby", sector: "Generative media", stage: "Early" },
  { name: "Sesame", slug: "sesame", ats: "ashby", sector: "Voice AI", stage: "Early" },
  { name: "Warp", slug: "warp", ats: "ashby", sector: "AI dev tools", stage: "Early" },
  { name: "Pika", slug: "pika", ats: "ashby", sector: "Generative media", stage: "Early" },
  { name: "Bland", slug: "bland", ats: "ashby", sector: "Voice AI", stage: "Early" },
  { name: "Mintlify", slug: "mintlify", ats: "ashby", sector: "AI dev tools", stage: "Early" },
  { name: "E2B", slug: "e2b", ats: "ashby", sector: "AI infra", stage: "Early" },
  { name: "Browserbase", slug: "browserbase", ats: "ashby", sector: "AI infra", stage: "Early" },
  { name: "Hyperbound", slug: "hyperbound", ats: "ashby", sector: "AI apps", stage: "Early" },
  { name: "Reka", slug: "reka", ats: "ashby", sector: "Foundation models", stage: "Early" },
  { name: "Magic", slug: "magic", ats: "ashby", sector: "Foundation models", stage: "Early" },
  { name: "Nomic", slug: "nomic", ats: "ashby", sector: "AI dev tools", stage: "Early" },
  { name: "Julius AI", slug: "julius", ats: "ashby", sector: "Data tools", stage: "Early" },
  { name: "LlamaIndex", slug: "llamaindex", ats: "ashby", sector: "AI dev tools", stage: "Early" },
  { name: "Extend", slug: "extend", ats: "ashby", sector: "AI apps", stage: "Early" },
  { name: "Vapi", slug: "vapi", ats: "ashby", sector: "Voice AI", stage: "Early" },
  { name: "Inceptive", slug: "inceptive", ats: "greenhouse", sector: "AI for science", stage: "Early" },
  { name: "Unstructured", slug: "unstructured", ats: "ashby", sector: "AI data", stage: "Early" },
  { name: "Weaviate", slug: "weaviate", ats: "ashby", sector: "AI infra", stage: "Early" },
];
