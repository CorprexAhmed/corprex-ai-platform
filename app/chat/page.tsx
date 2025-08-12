'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { UserButton, useUser } from "@clerk/nextjs";
import { useRouter } from 'next/navigation';
import { supabase, type Conversation } from '@/lib/supabase';
import { AI_MODELS, getModelConfig } from '@/lib/ai-models';
import { 
  copyToClipboardWithToast, 
  estimateTokens, 
  calculateCost,
  saveDraft,
  loadDraft,
  searchMessages,
  generateSuggestedPrompts,
  formatRelativeTime,
  exportAsHTML
} from '@/lib/chat-utils';
import { exportToMarkdown, exportToJSON, downloadFile } from '@/lib/export-utils';
import { VoiceInput, VoiceOutput } from '@/lib/voice-utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import { useHotkeys } from 'react-hotkeys-hook';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';

export default function ChatPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  
  // Core State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{
    id?: string;
    role: string;
    content: string;
    timestamp: Date;
    type?: string;
    imageUrl?: string;
    edited?: boolean;
    model?: string;
  }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  // UI State
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [showModelDetails, setShowModelDetails] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  
  // Features State
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Keyboard Shortcuts
  useHotkeys('cmd+n, ctrl+n', () => clearChat());
  useHotkeys('cmd+b, ctrl+b', () => setShowSidebar(!showSidebar));
  useHotkeys('cmd+k, ctrl+k', () => setShowSearch(!showSearch));
  useHotkeys('cmd+s, ctrl+s', () => saveDraft(input));
  useHotkeys('cmd+enter, ctrl+enter', () => handleSubmit());
  useHotkeys('cmd+/, ctrl+/', () => setShowShortcuts(!showShortcuts));

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    } else if (user) {
      loadConversations();
    }
  }, [isLoaded, isSignedIn, user, router]);

  useEffect(() => {
    const savedDraft = loadDraft();
    if (savedDraft) {
      setInput(savedDraft);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const tokens = estimateTokens(input);
    setTokenCount(tokens);
    const cost = calculateCost(tokens, selectedModel);
    setEstimatedCost(cost);
  }, [input, selectedModel]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
    if (!user) return;
    
    const userId = user.id.startsWith('user_') ? user.id : `user_${user.id}`;
    
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (!error && data) {
        setConversations(data);
      }
    } catch (error) {
      console.error('Exception loading conversations:', error);
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        const formattedMessages = data.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          type: msg.type || 'text',
          edited: msg.edited || false,
          model: msg.model
        }));
        setMessages(formattedMessages);
        setCurrentConversationId(conversationId);
        
        const conv = conversations.find(c => c.id === conversationId);
        if (conv) {
          setSelectedModel(conv.model || 'gpt-3.5-turbo');
        }
      }
    } catch (error) {
      console.error('Exception loading conversation:', error);
    }
  };

  const createNewConversation = async (firstMessage: string) => {
    if (!user) return null;

    const userId = user.id.startsWith('user_') ? user.id : `user_${user.id}`;
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert([{
          user_id: userId,
          title,
          model: selectedModel,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (!error && data) {
        await loadConversations();
        return data.id;
      }
    } catch (error) {
      console.error('Exception creating conversation:', error);
    }
    return null;
  };

  const saveMessage = async (conversationId: string, role: string, content: string) => {
    try {
      await supabase
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          role,
          content,
          model: role === 'assistant' ? selectedModel : null,
          created_at: new Date().toISOString()
        }]);
    } catch (error) {
      console.error('Exception saving message:', error);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    toast.success('New chat started');
  };

  const deleteConversation = async (id: string) => {
    try {
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', id);

      await supabase
        .from('conversations')
        .delete()
        .eq('id', id);

      await loadConversations();
      
      if (currentConversationId === id) {
        clearChat();
      }
      
      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Exception deleting conversation:', error);
      toast.error('Failed to delete conversation');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
      type: 'text' as const
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);

    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createNewConversation(input);
      setCurrentConversationId(conversationId);
    }

    if (conversationId) {
      await saveMessage(conversationId, 'user', userMessage.content);
    }

    try {
      abortControllerRef.current = new AbortController();
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: selectedModel,
          temperature,
          max_tokens: maxTokens,
          stream: streamingEnabled,
          web_search: webSearchEnabled,
          custom_instructions: customInstructions
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();
      
      const assistantMessage = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        type: 'text' as const,
        model: selectedModel
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      if (conversationId) {
        await saveMessage(conversationId, 'assistant', assistantMessage.content);
        await supabase
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Chat error:', error);
        toast.error('Failed to get response');
      }
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setIsTyping(false);
      toast.success('Generation stopped');
    }
  };

  const regenerateLastMessage = async () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      const filteredMessages = messages.slice(0, messages.lastIndexOf(lastUserMessage) + 1);
      setMessages(filteredMessages);
      setInput(lastUserMessage.content);
      await handleSubmit();
    }
  };

  const editMessage = async (index: number, newContent: string) => {
    const updatedMessages = [...messages];
    updatedMessages[index] = {
      ...updatedMessages[index],
      content: newContent,
      edited: true
    };
    setMessages(updatedMessages);
    
    if (currentConversationId && updatedMessages[index].id) {
      await supabase
        .from('messages')
        .update({ content: newContent, edited: true })
        .eq('id', updatedMessages[index].id);
    }
  };

  const handleExport = (format: 'markdown' | 'json' | 'html') => {
    const conversation = {
      title: conversations.find(c => c.id === currentConversationId)?.title || 'Chat Export',
      messages,
      date: new Date().toISOString()
    };

    if (format === 'markdown') {
      const markdown = exportToMarkdown(conversation);
      downloadFile(markdown, `chat-${Date.now()}.md`, 'text/markdown');
    } else if (format === 'json') {
      const json = exportToJSON(conversation);
      downloadFile(json, `chat-${Date.now()}.json`, 'application/json');
    } else if (format === 'html') {
      const html = exportAsHTML(conversation);
      downloadFile(html, `chat-${Date.now()}.html`, 'text/html');
    }
    setShowExportMenu(false);
  };

  const togglePinChat = (id: string) => {
    setPinnedChats(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(conversationSearch.toLowerCase())
  );

  const searchedMessages = showSearch && searchQuery 
    ? searchMessages(messages, searchQuery)
    : messages;

  const pinnedConversations = filteredConversations.filter(c => pinnedChats.includes(c.id));
  const unpinnedConversations = filteredConversations.filter(c => !pinnedChats.includes(c.id));

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-white border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!isSignedIn) return null;

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #333',
          },
        }}
      />

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-[#1a1a1a] border border-[#333] p-6 rounded-lg max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-4">Keyboard Shortcuts</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>New Chat</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">Cmd/Ctrl + N</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Toggle Sidebar</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">Cmd/Ctrl + B</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Search</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">Cmd/Ctrl + K</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Save Draft</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">Cmd/Ctrl + S</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Send Message</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">Cmd/Ctrl + Enter</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Show Shortcuts</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">Cmd/Ctrl + /</kbd>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div
        initial={{ x: -300 }}
        animate={{ x: showSidebar ? 0 : -300 }}
        className="w-64 bg-[#0a0a0a] border-r border-[#333333] flex flex-col fixed md:relative h-full z-40"
      >
        <div className="p-4 border-b border-[#333333]">
          <button
            onClick={clearChat}
            className="w-full px-4 py-2 bg-white text-black hover:bg-gray-200 transition-colors font-medium flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>NEW CHAT</span>
          </button>
          
          <div className="mt-4 relative">
            <input
              type="text"
              placeholder="Search conversations..."
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white pl-8"
            />
            <svg className="w-4 h-4 absolute left-2 top-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {conversations.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-8">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p>No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          )}
          
          {pinnedConversations.length > 0 && (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/>
                </svg>
                Pinned
              </div>
              {pinnedConversations.map(conv => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="group flex items-center space-x-2 hover:bg-[#1a1a1a] rounded p-1"
                >
                  <button
                    onClick={() => togglePinChat(conv.id)}
                    className="text-yellow-500 hover:text-yellow-400"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => loadConversation(conv.id)}
                    className={`flex-1 text-left px-2 py-1 truncate ${
                      conv.id === currentConversationId ? 'bg-[#2a2a2a] border-l-2 border-white' : ''
                    }`}
                  >
                    <div className="text-sm truncate">{conv.title}</div>
                    <div className="text-xs text-gray-500">{formatRelativeTime(new Date(conv.updated_at))}</div>
                  </button>
                  <button
                    onClick={() => deleteConversation(conv.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </>
          )}
          
          {unpinnedConversations.length > 0 && (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 mt-4">Recent</div>
              {unpinnedConversations.map(conv => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="group flex items-center space-x-2 hover:bg-[#1a1a1a] rounded p-1"
                >
                  <button
                    onClick={() => togglePinChat(conv.id)}
                    className="text-gray-400 hover:text-yellow-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => loadConversation(conv.id)}
                    className={`flex-1 text-left px-2 py-1 truncate ${
                      conv.id === currentConversationId ? 'bg-[#2a2a2a] border-l-2 border-white' : ''
                    }`}
                  >
                    <div className="text-sm truncate">{conv.title}</div>
                    <div className="text-xs text-gray-500">{formatRelativeTime(new Date(conv.updated_at))}</div>
                  </button>
                  <button
                    onClick={() => deleteConversation(conv.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </>
          )}
        </div>
        
        <div className="p-4 border-t border-[#333333]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Tokens</span>
            <span className="text-xs">{tokenCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Est. Cost</span>
            <span className="text-xs">${estimatedCost.toFixed(4)}</span>
          </div>
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-black border-b border-[#333333] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="text-gray-400 hover:text-white md:hidden"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="appearance-none px-4 py-2 bg-[#1a1a1a] border border-[#333333] text-white focus:outline-none focus:border-white pr-8 cursor-pointer"
                >
                  {AI_MODELS.map(model => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
                <svg className="w-4 h-4 absolute right-2 top-3 pointer-events-none text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              <button
                onClick={() => setShowPromptLibrary(!showPromptLibrary)}
                className="px-3 py-2 border border-[#333333] hover:bg-[#1a1a1a] transition-colors text-sm"
              >
                PROMPTS
              </button>

              <button
                onClick={() => setShowImageGen(!showImageGen)}
                className="px-3 py-2 border border-[#333333] hover:bg-[#1a1a1a] transition-colors text-sm"
              >
                IMAGE GEN
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-2 text-gray-400 hover:text-white relative"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333333] rounded shadow-lg">
                    <button
                      onClick={() => handleExport('markdown')}
                      className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a]"
                    >
                      Export as Markdown
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a]"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => handleExport('html')}
                      className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a]"
                    >
                      Export as HTML
                    </button>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setShowShortcuts(true)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              
              <button
                onClick={() => router.push('/analytics')}
                className="p-2 text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
          
          {showSearch && (
            <div className="mt-3">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white"
              />
            </div>
          )}
        </header>

        {/* Messages Area */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4">
          {searchedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h2 className="text-xl mb-2">Start a conversation</h2>
              <p className="text-sm">Ask me anything or choose a suggested prompt</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {searchedMessages.map((message, index) => (
                <MessageBlock
                  key={index}
                  message={message}
                  onEdit={(newContent: string) => editMessage(index, newContent)}
                  onRegenerate={index === messages.length - 1 ? regenerateLastMessage : undefined}
                  onDelete={() => {
                    const filtered = messages.filter((_, i) => i !== index);
                    setMessages(filtered);
                  }}
                />
              ))}
              {isTyping && (
                <div className="mb-6">
                  <div className="flex items-center space-x-2 text-gray-500">
                    <span>CORPREX AI is typing</span>
                    <motion.div className="flex space-x-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 bg-gray-500 rounded-full"
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                        />
                      ))}
                    </motion.div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[#333333] p-4">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="flex space-x-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white resize-none"
                rows={1}
                style={{ minHeight: '48px', maxHeight: '200px' }}
              />
              
              {voiceEnabled && (
                <button
                  type="button"
                  onClick={() => setIsListening(!isListening)}
                  className={`px-4 py-3 border ${isListening ? 'bg-red-600 border-red-600' : 'border-[#333333]'} hover:bg-[#1a1a1a] transition-colors`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
              
              {isLoading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="px-6 py-3 bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
                >
                  STOP
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="px-6 py-3 bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  SEND
                </button>
              )}
            </div>
            
            {isListening && (
              <div className="text-center text-sm text-red-500 animate-pulse">
                Listening... Speak now
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// Message Component
function MessageBlock({ message, onEdit, onRegenerate, onDelete }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isHovered, setIsHovered] = useState(false);

  const handleSaveEdit = () => {
    onEdit(editContent);
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mb-6 group ${message.role === 'user' ? 'text-right' : 'text-left'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`inline-block max-w-full ${message.role === 'user' ? 'ml-auto' : ''}`}>
        <div className="flex items-center mb-1 text-xs text-gray-500">
          <span className="font-medium">
            {message.role === 'user' ? 'You' : 'CORPREX AI'}
          </span>
          {message.model && (
            <>
              <span className="mx-2">•</span>
              <span>{message.model}</span>
            </>
          )}
          <span className="mx-2">•</span>
          <span>{message.timestamp.toLocaleTimeString()}</span>
          {message.edited && (
            <>
              <span className="mx-2">•</span>
              <span>edited</span>
            </>
          )}
        </div>

        <div className={`relative px-4 py-3 ${
          message.role === 'user' 
            ? 'bg-white text-black' 
            : 'bg-[#1a1a1a] text-white border border-[#333333]'
        }`}>
          {isEditing ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-2 bg-transparent border border-[#333333] focus:outline-none"
                rows={4}
              />
              <div className="flex space-x-2 mt-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 bg-white text-black text-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 border border-[#333333] text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.type === 'image' ? (
                <img src={message.imageUrl} alt="Generated" className="max-w-full h-auto" />
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code({node, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      return match ? (
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
              
              {isHovered && (
                <div className="absolute top-0 right-0 -mt-8 flex space-x-1">
                  <button
                    onClick={() => copyToClipboardWithToast(message.content)}
                    className="p-1 bg-[#2a2a2a] border border-[#333333] hover:bg-[#3a3a3a]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 bg-[#2a2a2a] border border-[#333333] hover:bg-[#3a3a3a]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {onRegenerate && (
                    <button
                      onClick={onRegenerate}
                      className="p-1 bg-[#2a2a2a] border border-[#333333] hover:bg-[#3a3a3a]"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={onDelete}
                    className="p-1 bg-[#2a2a2a] border border-[#333333] hover:bg-red-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
