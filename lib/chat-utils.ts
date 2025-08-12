import { toast } from 'react-hot-toast';

// Copy text to clipboard with toast notification
export const copyToClipboardWithToast = async (text: string, message?: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message || 'Copied to clipboard!');
  } catch (err) {
    toast.error('Failed to copy');
  }
};

// Format code blocks with syntax highlighting
export const extractCodeFromMessage = (content: string) => {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index)
      });
    }
    parts.push({
      type: 'code',
      language: match[1] || 'plaintext',
      content: match[2]
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex)
    });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content }];
};

// Format relative time
export const formatRelativeTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};

// Estimate token count
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// Calculate cost based on model and tokens
export const calculateCost = (model: string, inputTokens: number, outputTokens: number): number => {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  };

  const modelPricing = pricing[model] || { input: 0, output: 0 };
  return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
};

// Auto-save draft
export const saveDraft = (conversationId: string, content: string) => {
  if (content.trim()) {
    localStorage.setItem(`draft-${conversationId || 'new'}`, content);
  } else {
    localStorage.removeItem(`draft-${conversationId || 'new'}`);
  }
};

export const loadDraft = (conversationId: string): string => {
  return localStorage.getItem(`draft-${conversationId || 'new'}`) || '';
};

// Search within messages
export const searchMessages = (messages: any[], query: string) => {
  const lowerQuery = query.toLowerCase();
  return messages.filter(msg => 
    msg.content.toLowerCase().includes(lowerQuery)
  );
};

// Generate summary of conversation
export const generateConversationSummary = (messages: any[]): string => {
  if (messages.length === 0) return 'Empty conversation';
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (firstUserMessage) {
    return firstUserMessage.content.slice(0, 100) + (firstUserMessage.content.length > 100 ? '...' : '');
  }
  return 'Conversation';
};

// Generate suggested prompts based on context
export const generateSuggestedPrompts = (lastMessage: string): string[] => {
  const suggestions = [
    "Can you explain this in more detail?",
    "What are the alternatives?",
    "Can you provide an example?",
    "What are the pros and cons?",
    "How does this compare to other solutions?",
    "Can you simplify this explanation?",
    "What are the best practices?",
    "What should I consider before implementing this?"
  ];
  
  return suggestions.slice(0, 4);
};

// Export conversation as different formats
export const exportAsHTML = (messages: any[]): string => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Corprex AI Conversation</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
        .user { background: #f0f0f0; text-align: right; }
        .assistant { background: #e3f2fd; }
        .timestamp { font-size: 0.8em; color: #666; }
      </style>
    </head>
    <body>
      <h1>Corprex AI Conversation</h1>
      ${messages.map(m => `
        <div class="message ${m.role}">
          <div class="timestamp">${new Date(m.timestamp).toLocaleString()}</div>
          <div>${m.content}</div>
        </div>
      `).join('')}
    </body>
    </html>
  `;
  return html;
};