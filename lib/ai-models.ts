export const AI_MODELS = [
  { 
    id: 'gpt-3.5-turbo', 
    name: 'GPT-3.5', 
    provider: 'OpenAI',
    description: 'Fast and efficient',
    icon: ''
  },
  { 
    id: 'gpt-4', 
    name: 'GPT-4', 
    provider: 'OpenAI',
    description: 'Advanced reasoning',
    icon: ''
  },
  { 
    id: 'claude-3-5-sonnet', 
    name: 'Claude 3.5', 
    provider: 'Anthropic',
    description: 'Advanced analysis',
    icon: ''
  }
  // Removed Gemini and Mixtral as they're not working
];

export function getModelConfig(modelId: string) {
  return AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0];
}
