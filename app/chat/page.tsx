'use client';

import { useState, useRef, useEffect } from 'react';
import { UserButton, useUser } from "@clerk/nextjs";
import { useRouter } from 'next/navigation';
import { supabase, type Conversation, type Message } from '@/lib/supabase';
import { AI_MODELS, getModelConfig } from '@/lib/ai-models';
import { exportToMarkdown, exportToJSON, downloadFile, copyToClipboard } from '@/lib/export-utils';
import { VoiceInput, VoiceOutput } from '@/lib/voice-utils';

export default function ChatPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const voiceInput = useRef<VoiceInput | null>(null);
  const voiceOutput = useRef<VoiceOutput | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    voiceInput.current = new VoiceInput();
    voiceOutput.current = new VoiceOutput();
  }, []);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  const [messages, setMessages] = useState<Array<{role: string, content: string, timestamp: Date}>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversations = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setConversations(data);
    }
  };

  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const loadConversation = async (conversationId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      const formattedMessages = data.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.created_at)
      }));
      setMessages(formattedMessages);
      setCurrentConversationId(conversationId);
      
      const conv = conversations.find(c => c.id === conversationId);
      if (conv) {
        setSelectedModel(conv.model || 'gpt-3.5-turbo');
      }
    }
  };

  const createNewConversation = async (firstMessage: string) => {
    if (!user) return null;

    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    
    const { data, error } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        title: title,
        model: selectedModel
      })
      .select()
      .single();

    if (!error && data) {
      await loadConversations();
      return data.id;
    }
    return null;
  };

  const saveMessage = async (conversationId: string, role: string, content: string) => {
    await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: role,
        content: content
      });
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
        setInput(transcript);
        setIsListening(false);
      } catch (error) {
        console.error('Voice input error:', error);
        setIsListening(false);
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
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let convId = currentConversationId;
    
    if (!convId) {
      convId = await createNewConversation(input);
      if (!convId) return;
      setCurrentConversationId(convId);
    }

    const userMessage = { 
      role: 'user', 
      content: input,
      timestamp: new Date()
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);

    await saveMessage(convId, 'user', input);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: newMessages,
          model: selectedModel 
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');
      
      const data = await response.json();
      setIsTyping(false);
      
      const assistantMessage = { 
        role: 'assistant', 
        content: data.content,
        timestamp: new Date()
      };
      
      setMessages([...newMessages, assistantMessage]);
      
      if (voiceEnabled && voiceOutput.current) {
        voiceOutput.current.speak(data.content);
      }
      
      await saveMessage(convId, 'assistant', data.content);
      
      await supabase
        .from('conversations')
        .update({ 
          updated_at: new Date().toISOString(),
          model: selectedModel 
        })
        .eq('id', convId);
      
      await loadConversations();
    } catch (error) {
      console.error('Error:', error);
      setIsTyping(false);
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: 'An error occurred. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = (format: 'markdown' | 'json' | 'copy') => {
    if (format === 'markdown') {
      const markdown = exportToMarkdown(messages);
      downloadFile(markdown, `corprex-chat-${Date.now()}.md`);
    } else if (format === 'json') {
      const json = exportToJSON(messages);
      downloadFile(json, `corprex-chat-${Date.now()}.json`);
    } else if (format === 'copy') {
      const text = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      copyToClipboard(text);
      // Show a subtle notification instead of alert
      const notification = document.createElement('div');
      notification.textContent = 'Conversation copied';
      notification.className = 'fixed bottom-4 right-4 bg-white text-black px-4 py-2 rounded shadow-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 2000);
    }
    setShowExportMenu(false);
  };

  const clearChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
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
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500">Loading Corprex AI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex">
      {/* Sidebar */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} transition-all duration-300 bg-[#0a0a0a] border-r border-[#333333] overflow-hidden flex flex-col`}>
        <div className="p-4 border-b border-[#333333]">
          <button
            onClick={clearChat}
            className="w-full px-4 py-2 bg-white text-black font-medium hover:bg-gray-200 transition-colors"
          >
            NEW CONVERSATION
          </button>
        </div>
        
        <div className="p-4 border-b border-[#333333]">
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
          />
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">History</h3>
          <div className="space-y-2">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`p-2 cursor-pointer hover:bg-[#1a1a1a] transition-colors ${
                  currentConversationId === conv.id ? 'bg-[#1a1a1a] border-l-2 border-white' : ''
                }`}
              >
                <div 
                  onClick={() => loadConversation(conv.id)}
                  className="flex justify-between items-start"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {conv.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="ml-2 p-1 hover:bg-[#2a2a2a] rounded transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-[#333333]">
          <p className="text-xs text-gray-500 text-center">
            CORPREX AI PLATFORM
          </p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-[#0a0a0a] border-b border-[#333333]">
          <div className="px-4 py-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="p-2 hover:bg-[#1a1a1a] transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                
                <div className="flex items-center gap-3">
                  <h1 className="text-lg font-semibold text-white tracking-tight">CORPREX</h1>
                  <div className="w-px h-6 bg-[#333333]"></div>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333333] text-white text-sm focus:outline-none focus:border-white transition-colors"
                  >
                    {AI_MODELS.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className={`p-2 transition-colors ${voiceEnabled ? 'bg-white text-black' : 'hover:bg-[#1a1a1a] text-white'}`}
                  title="Toggle voice output"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
                
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="p-2 hover:bg-[#1a1a1a] transition-colors text-white"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  
                  {showExportMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-[#0a0a0a] border border-[#333333] shadow-xl">
                      <button
                        onClick={() => handleExport('markdown')}
                        className="w-full text-left px-4 py-2 text-white hover:bg-[#1a1a1a] transition-colors text-sm"
                      >
                        Export as Markdown
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        className="w-full text-left px-4 py-2 text-white hover:bg-[#1a1a1a] transition-colors text-sm"
                      >
                        Export as JSON
                      </button>
                      <button
                        onClick={() => handleExport('copy')}
                        className="w-full text-left px-4 py-2 text-white hover:bg-[#1a1a1a] transition-colors text-sm"
                      >
                        Copy to Clipboard
                      </button>
                    </div>
                  )}
                </div>
                
                <UserButton 
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-8 h-8"
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto bg-black">
          <div className="max-w-4xl mx-auto p-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="text-center">
                  <h2 className="text-2xl font-light text-white mb-2">Corprex AI</h2>
                  <p className="text-gray-500 text-sm">Select a model and begin your conversation</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className="animate-slide-up"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-8 h-8 flex items-center justify-center text-xs font-semibold ${
                        message.role === 'user' 
                          ? 'bg-white text-black' 
                          : 'bg-[#1a1a1a] text-white border border-[#333333]'
                      }`}>
                        {message.role === 'user' ? user?.firstName?.[0] || 'U' : 'AI'}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-baseline gap-3 mb-1">
                          <span className="text-sm font-medium text-white">
                            {message.role === 'user' ? 'You' : getModelConfig(selectedModel).name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                        <div className="text-gray-300 whitespace-pre-wrap">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="animate-slide-up">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-[#1a1a1a] border border-[#333333] flex items-center justify-center text-xs font-semibold text-white">
                        AI
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1 mt-2">
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-[#333333] bg-[#0a0a0a] p-4">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept=".txt,.md,.csv"
              />
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 hover:bg-[#1a1a1a] transition-colors text-white"
                title="Upload file"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              
              <button
                type="button"
                onClick={handleVoiceInput}
                className={`p-3 transition-colors ${isListening ? 'bg-red-600 text-white' : 'hover:bg-[#1a1a1a] text-white'}`}
                title="Voice input"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Corprex AI..."
                disabled={isLoading}
                className="flex-1 px-4 py-3 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white transition-colors"
                autoFocus
              />
              
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-6 py-3 bg-white text-black font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors uppercase text-sm tracking-wider"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}