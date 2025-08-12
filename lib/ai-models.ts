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
  // Temporarily hidden from UI - uncomment to re-enable
  // { 
  //   id: 'gemini-1.5-flash', 
  //   name: 'Gemini', 
  //   provider: 'Google',
  //   description: 'Multimodal AI',
  //   icon: ''
  // },
  // { 
  //   id: 'mixtral-8x7b', 
  //   name: 'Mixtral', 
  //   provider: 'Groq',
  //   description: 'Open source',
  //   icon: ''
  // }
];

export function getModelConfig(modelId: string) {
  // Include hidden models in the lookup for backend compatibility
  const allModels = [
    ...AI_MODELS,
    // Hidden models still accessible by backend
    { 
      id: 'gemini-1.5-flash', 
      name: 'Gemini', 
      provider: 'Google',
      description: 'Multimodal AI',
      icon: ''
    },
    { 
      id: 'mixtral-8x7b', 
      name: 'Mixtral', 
      provider: 'Groq',
      description: 'Open source',
      icon: ''
    }
  ];
  return allModels.find(m => m.id === modelId) || AI_MODELS[0];
}
