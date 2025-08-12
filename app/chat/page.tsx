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
  
  // Features State
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [tokenCount, setTokenCount] = useState({ input: 0, output: 0 });
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [showImageGen, setShowImageGen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const voiceInput = useRef<VoiceInput | null>(null);
  const voiceOutput = useRef<VoiceOutput | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Prompt Library
  const promptLibrary = [
    { category: "Writing", prompts: [
      "Write a professional email about...",
      "Create a blog post outline for...",
      "Draft a creative story about...",
      "Compose a persuasive essay on..."
    ]},
    { category: "Code", prompts: [
      "Write a Python function that...",
      "Debug this code: ",
      "Optimize this algorithm: ",
      "Convert this code to TypeScript: "
    ]},
    { category: "Analysis", prompts: [
      "Analyze the pros and cons of...",
      "Compare and contrast...",
      "What are the implications of...",
      "Evaluate the effectiveness of..."
    ]},
    { category: "Learning", prompts: [
      "Explain like I'm 5: ",
      "Create a study guide for...",
      "What are the key concepts of...",
      "Teach me about..."
    ]}
  ];

  // Keyboard Shortcuts
  useHotkeys('cmd+k, ctrl+k', () => setShowSearch(!showSearch));
  useHotkeys('cmd+/, ctrl+/', () => setShowShortcuts(!showShortcuts));
  useHotkeys('cmd+n, ctrl+n', () => clearChat());
  useHotkeys('cmd+b, ctrl+b', () => setShowSidebar(!showSidebar));
  useHotkeys('cmd+s, ctrl+s', () => {
    if (currentConversationId) {
      saveDraft(currentConversationId, input);
      toast.success('Draft saved!');
    }
  });
  useHotkeys('cmd+enter, ctrl+enter', () => {
    if (input.trim() && !isLoading) {
      handleSubmit(new Event('submit') as any);
    }
  });
  useHotkeys('escape', () => {
    setShowSearch(false);
    setShowShortcuts(false);
    setShowPromptLibrary(false);
    setShowExportMenu(false);
    setShowSettings(false);
  });

  // Initialize
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    try {
      voiceInput.current = new VoiceInput();
      voiceOutput.current = new VoiceOutput();
    } catch (error) {
      console.log('Voice features not available');
    }
    
    const saved = localStorage.getItem('customInstructions');
    if (saved) setCustomInstructions(saved);
    
    const savedTemp = localStorage.getItem('temperature');
    if (savedTemp) setTemperature(parseFloat(savedTemp));
    
    const savedMaxTokens = localStorage.getItem('maxTokens');
    if (savedMaxTokens) setMaxTokens(parseInt(savedMaxTokens));
    
    const savedAutoSave = localStorage.getItem('autoSave');
    if (savedAutoSave) setAutoSave(savedAutoSave === 'true');
    
    const savedStreaming = localStorage.getItem('streamingEnabled');
    if (savedStreaming) setStreamingEnabled(savedStreaming === 'true');
  }, []);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-save draft
  useEffect(() => {
    if (autoSave && currentConversationId) {
      const timeout = setTimeout(() => {
        saveDraft(currentConversationId, input);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [input, currentConversationId, autoSave]);

  // Load draft when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      const draft = loadDraft(currentConversationId);
      if (draft) {
        setInput(draft);
      }
    }
  }, [currentConversationId]);

  // Update token count
  useEffect(() => {
    const inputTokens = estimateTokens(input);
    const outputTokens = messages.reduce((acc, msg) => {
      if (msg.role === 'assistant') {
        return acc + estimateTokens(msg.content);
      }
      return acc;
    }, 0);
    
    setTokenCount({ input: inputTokens, output: outputTokens });
    setEstimatedCost(calculateCost(selectedModel, inputTokens, outputTokens));
  }, [input, messages, selectedModel]);

  // Generate suggested prompts
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        setSuggestedPrompts(generateSuggestedPrompts(lastMessage.content));
      }
    }
  }, [messages]);

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
        .insert({
          user_id: userId,
          title: title,
          model: selectedModel,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
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

  const saveMessage = async (conversationId: string, role: string, content: string, type: string = 'text') => {
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: role,
          content: content,
          type: type,
          model: selectedModel,
          created_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('Error saving message:', error);
      }
    } catch (error) {
      console.error('Exception saving message:', error);
    }
  };

  const handleVoiceInput = async () => {
    if (!voiceInput.current) return;
    
    if (isListening) {
      voiceInput.current.stopListening();
      setIsListening(false);
    } else {
      setIsListening(true);
      try {
        const transcript = await voiceInput.current.startListening();
        setInput(input + ' ' + transcript);
        setIsListening(false);
        toast.success('Voice input captured!');
      } catch (error) {
        console.error('Voice input error:', error);
        setIsListening(false);
        toast.error('Voice input failed');
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      setInput(`[File: ${file.name}]\n\n${text.slice(0, 1000)}...`);
      toast.success(`File ${file.name} loaded!`);
    };
    reader.readAsText(file);
  };

  const generateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;
    
    setIsGeneratingImage(true);
    toast.loading('Generating image...');
    
    try {
      const response = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
      });
      
      const data = await response.json();
      if (data.imageUrl) {
        const imageMessage = {
          role: 'assistant',
          content: `Generated image: "${imagePrompt}"`,
          timestamp: new Date(),
          type: 'image',
          imageUrl: data.imageUrl
        };
        setMessages(prev => [...prev, imageMessage]);
        setImagePrompt('');
        setShowImageGen(false);
        toast.dismiss();
        toast.success('Image generated!');
        
        if (currentConversationId) {
          await saveMessage(currentConversationId, 'assistant', data.imageUrl, 'image');
        }
      }
    } catch (error) {
      console.error('Image generation failed:', error);
      toast.dismiss();
      toast.error('Image generation failed');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const sendMessage = async (messageText: string, isRegeneration: boolean = false) => {
    if (!messageText.trim() || isLoading) return;
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    let convId = currentConversationId;
    
    if (!convId) {
      convId = await createNewConversation(messageText);
      if (!convId) {
        toast.error('Failed to create conversation');
        return;
      }
      setCurrentConversationId(convId);
    }

    const userMessage = { 
      role: 'user', 
      content: messageText,
      timestamp: new Date(),
      type: 'text'
    };
    
    let updatedMessages = isRegeneration ? messages : [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);
    
    if (!isRegeneration) {
      await saveMessage(convId, 'user', messageText);
    }

    try {
      // Create abort controller for streaming
      abortControllerRef.current = new AbortController();
      
      const messagesWithContext = customInstructions 
        ? [{ role: 'system', content: customInstructions }, ...updatedMessages]
        : updatedMessages;
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messagesWithContext,
          model: selectedModel,
          temperature,
          max_tokens: maxTokens,
          stream: streamingEnabled
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to get response');
      
      if (streamingEnabled && response.body) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = { 
          role: 'assistant', 
          content: '',
          timestamp: new Date(),
          type: 'text',
          model: selectedModel
        };
        
        setMessages([...updatedMessages, assistantMessage]);
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          assistantMessage.content += chunk;
          
          setMessages(prev => {
            const newMessages = [...prev];
            newMessages[newMessages.length - 1] = { ...assistantMessage };
            return newMessages;
          });
        }
        
        await saveMessage(convId, 'assistant', assistantMessage.content);
      } else {
        // Handle non-streaming response
        const data = await response.json();
        
        const assistantMessage = { 
          role: 'assistant', 
          content: data.content,
          timestamp: new Date(),
          type: 'text',
          model: selectedModel
        };
        
        setMessages([...updatedMessages, assistantMessage]);
        
        if (voiceEnabled && voiceOutput.current) {
          voiceOutput.current.speak(data.content);
        }
        
        await saveMessage(convId, 'assistant', data.content);
      }
      
      await supabase
        .from('conversations')
        .update({ 
          updated_at: new Date().toISOString(),
          model: selectedModel 
        })
        .eq('id', convId);
      
      await loadConversations();
      toast.success('Response received!');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        toast.success('Response stopped');
      } else {
        console.error('Error:', error);
        toast.error('Failed to get response');
        setMessages([...updatedMessages, { 
          role: 'assistant', 
          content: 'An error occurred. Please try again.',
          timestamp: new Date(),
          type: 'text'
        }]);
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
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleEditMessage = async (index: number, newContent: string) => {
    const updatedMessages = [...messages];
    updatedMessages[index] = { 
      ...updatedMessages[index], 
      content: newContent,
      edited: true 
    };
    setMessages(updatedMessages);
    
    // Regenerate response from this point
    const messagesToSend = updatedMessages.slice(0, index + 1);
    await sendMessage(newContent, true);
  };

  const handleRegenerateResponse = async (index: number) => {
    const messagesToSend = messages.slice(0, index);
    setMessages(messagesToSend);
    const lastUserMessage = messagesToSend.reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      await sendMessage(lastUserMessage.content, true);
    }
  };

  const handleDeleteMessage = (index: number) => {
    const updatedMessages = messages.filter((_, i) => i !== index);
    setMessages(updatedMessages);
    toast.success('Message deleted');
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setInput('');
    setSuggestedPrompts([]);
    toast.success('Chat cleared');
  };

  const deleteConversation = async (id: string) => {
    await supabase
      .from('conversations')
      .delete()
      .eq('id', id);
    
    if (id === currentConversationId) {
      clearChat();
    }
    
    await loadConversations();
    toast.success('Conversation deleted');
  };

  const handleExport = (format: 'markdown' | 'json' | 'html' | 'copy') => {
    if (format === 'markdown') {
      const markdown = exportToMarkdown(messages);
      downloadFile(markdown, `corprex-chat-${Date.now()}.md`);
    } else if (format === 'json') {
      const json = exportToJSON(messages);
      downloadFile(json, `corprex-chat-${Date.now()}.json`);
    } else if (format === 'html') {
      const html = exportAsHTML(messages);
      downloadFile(html, `corprex-chat-${Date.now()}.html`);
    } else if (format === 'copy') {
      const text = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      copyToClipboardWithToast(text, 'Conversation copied!');
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
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">⌘/Ctrl + N</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Toggle Sidebar</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">⌘/Ctrl + B</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Search</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">⌘/Ctrl + K</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Save Draft</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">⌘/Ctrl + S</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Send Message</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">⌘/Ctrl + Enter</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Show Shortcuts</span>
                  <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">⌘/Ctrl + /</kbd>
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
        
        {/* User Stats */}
        <div className="p-4 border-t border-[#333333] text-xs text-gray-500">
          <div className="flex justify-between mb-1">
            <span>Tokens Used</span>
            <span>{tokenCount.input + tokenCount.output}</span>
          </div>
          <div className="flex justify-between">
            <span>Est. Cost</span>
            <span>${estimatedCost.toFixed(4)}</span>
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
                  {Object.entries(AI_MODELS).map(([key, model]) => (
                    <option key={key} value={key}>{model.name}</option>
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
                IMAGE
              </button>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="text-gray-400 hover:text-white"
                title="Search (⌘K)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              
              <button
                onClick={() => router.push('/analytics')}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
              
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                
                {showExportMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333333] shadow-lg"
                  >
                    <button
                      onClick={() => handleExport('markdown')}
                      className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a] text-sm"
                    >
                      Export as Markdown
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a] text-sm"
                    >
                      Export as JSON
                    </button>
                    <button
                      onClick={() => handleExport('html')}
                      className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a] text-sm"
                    >
                      Export as HTML
                    </button>
                    <button
                      onClick={() => handleExport('copy')}
                      className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a] text-sm"
                    >
                      Copy to Clipboard
                    </button>
                  </motion.div>
                )}
              </div>
              
              <button
                onClick={() => setShowShortcuts(true)}
                className="text-gray-400 hover:text-white"
                title="Keyboard Shortcuts (⌘/)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </button>
              
              <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8",
                  }
                }}
              />
            </div>
          </div>

          {/* Search Bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-3"
              >
                <input
                  type="text"
                  placeholder="Search in messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white"
                  autoFocus
                />
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#0a0a0a] border-b border-[#333333] p-4"
            >
              <div className="max-w-4xl mx-auto space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Custom Instructions</h3>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => {
                      setCustomInstructions(e.target.value);
                      localStorage.setItem('customInstructions', e.target.value);
                    }}
                    placeholder="You are a helpful assistant..."
                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white resize-none"
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Temperature: {temperature}</label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => {
                        setTemperature(parseFloat(e.target.value));
                        localStorage.setItem('temperature', e.target.value);
                      }}
                      className="w-full"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 block mb-1">Max Tokens: {maxTokens}</label>
                    <input
                      type="range"
                      min="256"
                      max="4096"
                      step="256"
                      value={maxTokens}
                      onChange={(e) => {
                        setMaxTokens(parseInt(e.target.value));
                        localStorage.setItem('maxTokens', e.target.value);
                      }}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={streamingEnabled}
                        onChange={(e) => {
                          setStreamingEnabled(e.target.checked);
                          localStorage.setItem('streamingEnabled', String(e.target.checked));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">Streaming Responses</span>
                    </label>
                    
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={autoSave}
                        onChange={(e) => {
                          setAutoSave(e.target.checked);
                          localStorage.setItem('autoSave', String(e.target.checked));
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">Auto-save Drafts</span>
                    </label>
                    
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={voiceEnabled}
                        onChange={(e) => setVoiceEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Voice Output</span>
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prompt Library */}
        <AnimatePresence>
          {showPromptLibrary && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#0a0a0a] border-b border-[#333333] p-4"
            >
              <div className="max-w-4xl mx-auto">
                <h3 className="text-sm font-medium mb-3">Prompt Library</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {promptLibrary.map((category) => (
                    <div key={category.category}>
                      <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">{category.category}</h4>
                      <div className="space-y-1">
                        {category.prompts.map((prompt, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              setInput(prompt);
                              setShowPromptLibrary(false);
                            }}
                            className="block w-full text-left text-xs px-2 py-1 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#333333] truncate"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Image Generation Panel */}
        <AnimatePresence>
          {showImageGen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#0a0a0a] border-b border-[#333333] p-4"
            >
              <div className="max-w-4xl mx-auto flex space-x-2">
                <input
                  type="text"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe the image you want to generate..."
                  className="flex-1 px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white"
                />
                <button
                  onClick={generateImage}
                  disabled={isGeneratingImage}
                  className="px-4 py-2 bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {isGeneratingImage ? 'Generating...' : 'Generate'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {searchedMessages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto text-center py-12"
            >
              <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                CORPREX AI
              </h1>
              <p className="text-gray-400 mb-8">Your Advanced AI Assistant</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {[
                  { icon: '💡', title: 'Creative Writing', desc: 'Stories, scripts, and content' },
                  { icon: '🔬', title: 'Analysis', desc: 'Data insights and research' },
                  { icon: '💻', title: 'Coding', desc: 'Debug and write code' },
                  { icon: '🎓', title: 'Learning', desc: 'Explanations and tutorials' }
                ].map((item, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowPromptLibrary(true)}
                    className="text-left p-4 bg-[#0a0a0a] border border-[#333333] hover:bg-[#1a1a1a] transition-colors group"
                  >
                    <div className="text-2xl mb-2">{item.icon}</div>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-gray-500">{item.desc}</div>
                  </motion.button>
                ))}
              </div>
              
              <div className="mt-8 text-xs text-gray-600">
                Press <kbd className="bg-[#2a2a2a] px-2 py-1 rounded">⌘/</kbd> for keyboard shortcuts
              </div>
            </motion.div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {searchedMessages.map((message, index) => (
                <MessageBlock
                  key={index}
                  message={message}
                  onEdit={(content) => handleEditMessage(index, content)}
                  onRegenerate={() => handleRegenerateResponse(index)}
                  onDelete={() => handleDeleteMessage(index)}
                />
              ))}
              
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-6"
                >
                  <div className="inline-block">
                    <div className="px-4 py-3 bg-[#1a1a1a] border border-[#333333]">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
          
          {/* Suggested Prompts */}
          {suggestedPrompts.length > 0 && messages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto mt-4"
            >
              <div className="text-xs text-gray-500 mb-2">Suggested follow-ups:</div>
              <div className="flex flex-wrap gap-2">
                {suggestedPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => setInput(prompt)}
                    className="text-xs px-3 py-1 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#333333] rounded-full"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[#333333] p-4 bg-black">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="flex space-x-2 mb-2">
              <button
                type="button"
                onClick={handleVoiceInput}
                className={`p-2 border ${isListening ? 'bg-red-600 border-red-600' : 'border-[#333333]'} hover:bg-[#1a1a1a] transition-colors`}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
                disabled={isLoading}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message... (⌘+Enter to send)"
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white resize-none pr-12"
                  disabled={isLoading}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  style={{
                    minHeight: '48px',
                    maxHeight: '200px',
                    height: 'auto'
                  }}
                />
                
                {autoSave && input && (
                  <div className="absolute right-2 bottom-2 text-xs text-gray-600">
                    Draft saved
                  </div>
                )}
              </div>
              
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
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-2 bg-[#0a0a0a] border border-[#333333] text-white rounded focus:outline-none focus:border-white"
                rows={4}
              />
              <div className="flex space-x-2">
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
            <>
              {message.type === 'image' && message.imageUrl ? (
                <img src={message.imageUrl} alt="Generated" className="max-w-full h-auto" />
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <div className="relative group my-2">
                          <button
                            onClick={() => copyToClipboardWithToast(String(children).replace(/\n$/, ''), 'Code copied!')}
                            className="absolute right-2 top-2 text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] text-gray-400 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Copy
                          </button>
                          <SyntaxHighlighter
                            language={match[1]}
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '1rem',
                              fontSize: '0.875rem',
                            }}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code className="bg-[#2a2a2a] px-1 py-0.5 rounded text-sm" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </>
          )}

          {/* Action Buttons */}
          <AnimatePresence>
            {isHovered && !isEditing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -bottom-8 left-0 flex space-x-2"
              >
                <button
                  onClick={() => copyToClipboardWithToast(message.content)}
                  className="p-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded text-xs text-gray-400"
                  title="Copy"
                >
                  Copy
                </button>
                
                {message.role === 'user' && onEdit && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded text-xs text-gray-400"
                    title="Edit"
                  >
                    Edit
                  </button>
                )}
                
                {message.role === 'assistant' && onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    className="p-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded text-xs text-gray-400"
                    title="Regenerate"
                  >
                    Regenerate
                  </button>
                )}
                
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="p-1 bg-[#2a2a2a] hover:bg-red-600 rounded text-xs text-gray-400"
                    title="Delete"
                  >
                    Delete
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}