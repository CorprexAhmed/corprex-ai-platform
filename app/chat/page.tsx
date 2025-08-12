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
    fileAttachment?: {
      name: string;
      type: string;
      url: string;
    };
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
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  
  // Features State
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [codeExecutionEnabled, setCodeExecutionEnabled] = useState(false);
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<Set<number>>(new Set());
  const [copiedCode, setCopiedCode] = useState<number | null>(null);
  
  // Refs
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Voice instances
  const voiceInputRef = useRef<VoiceInput | null>(null);
  const voiceOutputRef = useRef<VoiceOutput | null>(null);
  
  // Initialize voice instances
  useEffect(() => {
    if (typeof window !== 'undefined') {
      voiceInputRef.current = new VoiceInput();
      voiceOutputRef.current = new VoiceOutput();
    }
  }, []);
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Load conversations on mount
  useEffect(() => {
    if (isSignedIn && user) {
      loadConversations();
      const savedModel = localStorage.getItem('selectedModel');
      if (savedModel) setSelectedModel(savedModel);
    }
  }, [isSignedIn, user]);
  
  // Save draft periodically
  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentConversationId && input) {
        saveDraft(currentConversationId, input);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [input, currentConversationId]);
  
  // Keyboard shortcuts
  useHotkeys('cmd+n, ctrl+n', (e) => {
    e.preventDefault();
    clearChat();
  });
  
  useHotkeys('cmd+b, ctrl+b', (e) => {
    e.preventDefault();
    setShowSidebar(!showSidebar);
  });
  
  useHotkeys('cmd+/, ctrl+/', (e) => {
    e.preventDefault();
    setShowShortcuts(!showShortcuts);
  });
  
  useHotkeys('cmd+k, ctrl+k', (e) => {
    e.preventDefault();
    setShowSearch(!showSearch);
  });
  
  useHotkeys('escape', () => {
    setShowExportMenu(false);
    setShowSettings(false);
    setShowSearch(false);
    setShowModelDetails(false);
    setShowShortcuts(false);
    setShowPromptLibrary(false);
    setShowImageGen(false);
  });
  
  const loadConversations = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        return;
      }
      
      if (data) {
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
      
      if (error) {
        console.error('Error loading messages:', error);
        return;
      }
      
      if (data) {
        setMessages(data.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          model: msg.model
        })));
        setCurrentConversationId(conversationId);
      }
    } catch (error) {
      console.error('Exception loading conversation:', error);
    }
  };
  
  const createNewConversation = async (firstMessage: string) => {
    if (!user) return null;
    
    const title = generateConversationSummary([{ role: 'user', content: firstMessage }]);
    
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert([{
          user_id: user.id,
          title,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Error creating conversation:', error);
        return null;
      }
      
      await loadConversations();
      return data?.id || null;
    } catch (error) {
      console.error('Exception creating conversation:', error);
      return null;
    }
  };
  
  const updateConversationTitle = async (conversationId: string, title: string) => {
    try {
      await supabase
        .from('conversations')
        .update({ 
          title,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);
      
      await loadConversations();
    } catch (error) {
      console.error('Error updating conversation title:', error);
    }
  };
  
  const saveMessage = async (conversationId: string, role: string, content: string) => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          conversation_id: conversationId,
          user_id: user.id,
          role,
          content,
          model: role === 'assistant' ? selectedModel : null,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Error saving message:', error);
      }
      return data;
    } catch (error) {
      console.error('Exception saving message:', error);
      return null;
    }
  };
  
  const clearChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    setAttachedFile(null);
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
  
  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      toast.success(`File attached: ${file.name}`);
    }
  };
  
  const removeAttachment = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
      type: 'text' as const,
      fileAttachment: attachedFile ? {
        name: attachedFile.name,
        type: attachedFile.type,
        url: URL.createObjectURL(attachedFile)
      } : undefined
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedFile(null);
    setIsLoading(true);
    setIsTyping(true);
    
    let conversationId = currentConversationId;
    
    // Create new conversation if needed
    if (!conversationId) {
      conversationId = await createNewConversation(input);
      setCurrentConversationId(conversationId);
    }
    
    // Save user message
    if (conversationId) {
      await saveMessage(conversationId, 'user', userMessage.content);
    }
    
    try {
      abortControllerRef.current = new AbortController();
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
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
        model: selectedModel
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Save assistant message
      if (conversationId) {
        await saveMessage(conversationId, 'assistant', assistantMessage.content);
        await updateConversationTitle(conversationId, generateConversationSummary([...messages, userMessage, assistantMessage]));
      }
      
      // Voice output if enabled
      if (voiceOutputEnabled && voiceOutputRef.current) {
        voiceOutputRef.current.speak(assistantMessage.content);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.success('Generation stopped');
      } else {
        console.error('Chat error:', error);
        toast.error('Failed to get response');
      }
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };
  
  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setIsTyping(false);
    }
  };
  
  const regenerateLastMessage = async () => {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMessage) return;
    
    const messagesWithoutLastAssistant = messages.slice(0, -1);
    setMessages(messagesWithoutLastAssistant);
    
    setInput(lastUserMessage.content);
    await handleSubmit();
  };
  
  const editMessage = (index: number, newContent: string) => {
    const updatedMessages = [...messages];
    updatedMessages[index].content = newContent;
    updatedMessages[index].edited = true;
    setMessages(updatedMessages);
  };
  
  const handleExport = (format: 'markdown' | 'json' | 'html') => {
    let content = '';
    let filename = '';
    
    switch (format) {
      case 'markdown':
        content = exportToMarkdown(messages);
        filename = 'conversation.md';
        break;
      case 'json':
        content = exportToJSON(messages);
        filename = 'conversation.json';
        break;
      case 'html':
        content = exportAsHTML(messages);
        filename = 'conversation.html';
        break;
    }
    
    downloadFile(content, filename);
    toast.success(`Exported as ${format.toUpperCase()}`);
    setShowExportMenu(false);
  };
  
  const toggleCodeExpansion = (index: number) => {
    setExpandedCode(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };
  
  const copyCode = (code: string, index: number) => {
    copyToClipboardWithToast(code);
    setCopiedCode(index);
    setTimeout(() => setCopiedCode(null), 2000);
  };
  
  const togglePinChat = (id: string) => {
    setPinnedChats(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };
  
  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };
  
  const handleVoiceInput = (transcript: string) => {
    setInput(prev => prev + ' ' + transcript);
  };
  
  const startVoiceInput = async () => {
    if (!voiceInputRef.current) return;
    
    setIsListening(true);
    try {
      const transcript = await voiceInputRef.current.startListening();
      handleVoiceInput(transcript);
    } catch (error) {
      console.error('Voice input error:', error);
      toast.error('Voice input failed. Please check your microphone permissions.');
    } finally {
      setIsListening(false);
    }
  };
  
  const stopVoiceInput = () => {
    if (voiceInputRef.current) {
      voiceInputRef.current.stopListening();
      setIsListening(false);
    }
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
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileAttachment}
        accept="image/*,.pdf,.doc,.docx,.txt"
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
                  <span>Shortcuts</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">Cmd/Ctrl + /</kbd>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-80 bg-[#0a0a0a] border-r border-[#333333] flex flex-col"
          >
            <div className="p-4 border-b border-[#333333]">
              <button
                onClick={clearChat}
                className="w-full px-4 py-2 bg-white text-black hover:bg-gray-200 transition-colors font-medium"
              >
                NEW CHAT
              </button>
            </div>
            
            <div className="p-4 border-b border-[#333333]">
              <input
                type="text"
                placeholder="Search conversations..."
                value={conversationSearch}
                onChange={(e) => setConversationSearch(e.target.value)}
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {pinnedConversations.length > 0 && (
                <div className="p-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wider px-2 mb-2">Pinned</div>
                  {pinnedConversations.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={currentConversationId === conv.id}
                      onSelect={() => loadConversation(conv.id)}
                      onDelete={() => deleteConversation(conv.id)}
                      onPin={() => togglePinChat(conv.id)}
                      isPinned={true}
                    />
                  ))}
                </div>
              )}
              
              {unpinnedConversations.length > 0 && (
                <div className="p-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wider px-2 mb-2">Recent</div>
                  {unpinnedConversations.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={currentConversationId === conv.id}
                      onSelect={() => loadConversation(conv.id)}
                      onDelete={() => deleteConversation(conv.id)}
                      onPin={() => togglePinChat(conv.id)}
                      isPinned={false}
                    />
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-[#333333] space-y-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-full text-left px-3 py-2 hover:bg-[#1a1a1a] transition-colors flex items-center justify-between"
              >
                <span>Settings</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              
              <div className="flex items-center justify-between px-3 py-2">
                <UserButton afterSignOutUrl="/" />
                <span className="text-xs text-gray-500">{user?.primaryEmailAddress?.emailAddress}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-[#333333] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-[#1a1a1a] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <h1 className="text-xl font-bold">CORPREX AI</h1>
              
              <select
                value={selectedModel}
                onChange={(e) => {
                  setSelectedModel(e.target.value);
                  localStorage.setItem('selectedModel', e.target.value);
                }}
                className="bg-[#1a1a1a] border border-[#333333] px-3 py-1 text-sm focus:outline-none focus:border-white"
              >
                {Object.entries(AI_MODELS).map(([key, model]) => (
                  <option key={key} value={key}>{model.name}</option>
                ))}
              </select>
              
              <button
                onClick={() => setShowModelDetails(!showModelDetails)}
                className="text-xs text-gray-500 hover:text-white"
              >
                Model Info
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 hover:bg-[#1a1a1a] transition-colors"
                title="Search messages (Cmd/Ctrl + K)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-2 hover:bg-[#1a1a1a] transition-colors"
                title="Export conversation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              
              <button
                onClick={() => setShowShortcuts(!showShortcuts)}
                className="p-2 hover:bg-[#1a1a1a] transition-colors"
                title="Keyboard shortcuts (Cmd/Ctrl + /)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          {showSearch && (
            <div className="mt-4">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white"
                autoFocus
              />
            </div>
          )}
          
          {/* Export Menu */}
          {showExportMenu && (
            <div className="absolute right-4 top-16 bg-[#1a1a1a] border border-[#333333] p-2 z-10">
              <button
                onClick={() => handleExport('markdown')}
                className="block w-full text-left px-3 py-2 hover:bg-[#2a2a2a] transition-colors"
              >
                Export as Markdown
              </button>
              <button
                onClick={() => handleExport('json')}
                className="block w-full text-left px-3 py-2 hover:bg-[#2a2a2a] transition-colors"
              >
                Export as JSON
              </button>
              <button
                onClick={() => handleExport('html')}
                className="block w-full text-left px-3 py-2 hover:bg-[#2a2a2a] transition-colors"
              >
                Export as HTML
              </button>
            </div>
          )}
        </div>
        
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {searchedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <h2 className="text-2xl font-bold mb-4">Welcome to CORPREX AI</h2>
              <p className="mb-8">Start a conversation or select from suggestions below</p>
              
              <div className="grid grid-cols-2 gap-4 max-w-2xl">
                {generateSuggestedPrompts('').map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestedPrompt(prompt)}
                    className="p-4 bg-[#1a1a1a] border border-[#333333] hover:border-white transition-colors text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {searchedMessages.map((message, index) => (
                <MessageBlock
                  key={index}
                  message={message}
                  onEdit={(content: string) => editMessage(index, content)}
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
          {/* Attached file indicator */}
          {attachedFile && (
            <div className="max-w-4xl mx-auto mb-2 flex items-center justify-between bg-[#1a1a1a] border border-[#333333] p-2">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="text-sm text-gray-400">{attachedFile.name}</span>
              </div>
              <button
                onClick={removeAttachment}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-3 border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
                title="Attach file"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              
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
                  onClick={isListening ? stopVoiceInput : startVoiceInput}
                  className={`px-3 py-3 border transition-colors ${
                    isListening 
                      ? 'border-red-500 bg-red-500/10 animate-pulse' 
                      : 'border-[#333333] hover:bg-[#1a1a1a]'
                  }`}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? (
                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>
              )}
              
              <button
                type="button"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`px-3 py-3 border ${voiceEnabled ? 'border-white bg-[#1a1a1a]' : 'border-[#333333]'} hover:bg-[#1a1a1a] transition-colors`}
                title="Toggle voice input"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              
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
              <div className="text-center text-sm text-red-500 animate-pulse mt-2">
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
            <span className="ml-2">• {message.model}</span>
          )}
          {message.edited && (
            <span className="ml-2">• edited</span>
          )}
        </div>
        
        <div className={`p-4 ${
          message.role === 'user' 
            ? 'bg-white text-black' 
            : 'bg-[#1a1a1a] border border-[#333333]'
        }`}>
          {isEditing ? (
            <div>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-2 bg-transparent border border-[#333333] focus:outline-none focus:border-white resize-none"
                rows={4}
              />
              <div className="mt-2 flex space-x-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 bg-white text-black hover:bg-gray-200 text-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(message.content);
                  }}
                  className="px-3 py-1 border border-[#333333] hover:bg-[#1a1a1a] text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <div className="relative">
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                      <button
                        onClick={() => copyToClipboardWithToast(String(children))}
                        className="absolute top-2 right-2 px-2 py-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] text-xs"
                      >
                        Copy
                      </button>
                    </div>
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
          
          {message.fileAttachment && (
            <div className="mt-2 p-2 bg-[#0a0a0a] border border-[#333333]">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="text-sm">{message.fileAttachment.name}</span>
              </div>
            </div>
          )}
        </div>
        
        {isHovered && (
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => copyToClipboardWithToast(message.content)}
              className="text-xs text-gray-500 hover:text-white"
            >
              Copy
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-gray-500 hover:text-white"
            >
              Edit
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="text-xs text-gray-500 hover:text-white"
              >
                Regenerate
              </button>
            )}
            <button
              onClick={onDelete}
              className="text-xs text-gray-500 hover:text-red-500"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Conversation Item Component
function ConversationItem({ conversation, isActive, onSelect, onDelete, onPin, isPinned }: any) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div
      className={`relative px-3 py-2 mb-1 cursor-pointer transition-colors ${
        isActive ? 'bg-[#1a1a1a] border-l-2 border-white' : 'hover:bg-[#1a1a1a]'
      }`}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 truncate">
          <div className="font-medium truncate">{conversation.title}</div>
          <div className="text-xs text-gray-500">
            {formatRelativeTime(new Date(conversation.updated_at))}
          </div>
        </div>
        
        {isHovered && (
          <div className="flex space-x-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin();
              }}
              className="p-1 hover:bg-[#2a2a2a] transition-colors"
            >
              <svg className="w-3 h-3" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 hover:bg-[#2a2a2a] transition-colors text-red-500"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
