'use client';

import { useState, useRef, useEffect } from 'react';
import { UserButton, useUser } from "@clerk/nextjs";
import { useRouter } from 'next/navigation';
import { supabase, type Conversation } from '@/lib/supabase';
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
  
  // New features state
  const [showImageGen, setShowImageGen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);
  
  const voiceInput = useRef<VoiceInput | null>(null);
  const voiceOutput = useRef<VoiceOutput | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  useEffect(() => {
    // Initialize voice features
    try {
      voiceInput.current = new VoiceInput();
      voiceOutput.current = new VoiceOutput();
    } catch (error) {
      console.log('Voice features not available');
    }
    
    // Load custom instructions
    const saved = localStorage.getItem('customInstructions');
    if (saved) setCustomInstructions(saved);
  }, []);

  useEffect(() => {
    if (user) {
      console.log('User loaded:', user.id);
      loadConversations();
    }
  }, [user]);

  const [messages, setMessages] = useState<Array<{role: string, content: string, timestamp: Date, type?: string, imageUrl?: string}>>([]);
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
    
    // Use Clerk's user ID format
    const userId = user.id.startsWith('user_') ? user.id : `user_${user.id}`;
    
    try {
      console.log('Loading conversations for user:', userId);
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading conversations:', error);
      } else {
        console.log('Loaded conversations:', data?.length || 0);
        setConversations(data || []);
      }
    } catch (error) {
      console.error('Exception loading conversations:', error);
    }
  };

  const filteredConversations = conversations.filter(conv => 
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
        const formattedMessages = data.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.created_at),
          type: msg.type || 'text'
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
    if (!user) {
      console.error('No user found');
      return null;
    }

    // Use Clerk's user ID format
    const userId = user.id.startsWith('user_') ? user.id : `user_${user.id}`;
    
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '');
    
    try {
      console.log('Creating conversation for user:', userId);
      console.log('Title:', title);
      console.log('Model:', selectedModel);
      
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

      if (error) {
        console.error('Error creating conversation:', error);
        alert(`Failed to create conversation: ${error.message}`);
        return null;
      }

      if (data) {
        console.log('Conversation created:', data.id);
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

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/pdf', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      setInput(`[PDF Document: ${data.filename}]\n\nContent: ${data.text}`);
    } catch (error) {
      console.error('PDF upload failed:', error);
    }
  };

  const generateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;
    
    setIsGeneratingImage(true);
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
        
        if (currentConversationId) {
          await saveMessage(currentConversationId, 'assistant', data.imageUrl, 'image');
        }
      }
    } catch (error) {
      console.error('Image generation failed:', error);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Main send message function
  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    console.log('=== SEND MESSAGE DEBUG ===');
    console.log('User:', user);
    console.log('User ID:', user?.id);
    console.log('Message:', messageText);
    console.log('Current Conversation ID:', currentConversationId);

    if (!user) {
      alert('User not authenticated. Please refresh the page and try again.');
      return;
    }

    let convId = currentConversationId;
    
    // Create new conversation if needed
    if (!convId) {
      console.log('No current conversation, creating new one...');
      convId = await createNewConversation(messageText);
      if (!convId) {
        console.error('Failed to create conversation - stopping');
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
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);

    await saveMessage(convId, 'user', messageText);

    try {
      const messagesWithContext = customInstructions 
        ? [{ role: 'system', content: customInstructions }, ...newMessages]
        : newMessages;
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messagesWithContext,
          model: selectedModel 
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      setIsTyping(false);
      
      const assistantMessage = { 
        role: 'assistant', 
        content: data.content,
        timestamp: new Date(),
        type: 'text'
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
      console.error('Error in sendMessage:', error);
      setIsTyping(false);
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: `An error occurred: ${error}. Please check your API configuration.`,
        timestamp: new Date(),
        type: 'text'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  const handleExampleClick = async (prompt: string) => {
    setInput(prompt);
    await sendMessage(prompt);
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

  const togglePinChat = (id: string) => {
    setPinnedChats(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  const pinnedConversations = filteredConversations.filter(c => pinnedChats.includes(c.id));
  const unpinnedConversations = filteredConversations.filter(c => !pinnedChats.includes(c.id));

  if (!isLoaded) {
    return <div className="flex items-center justify-center h-screen bg-black">
      <div className="text-white">Loading...</div>
    </div>;
  }

  if (!isSignedIn) {
    return null;
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Sidebar */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} bg-[#0a0a0a] border-r border-[#333333] flex flex-col transition-all duration-300 overflow-hidden`}>
        <div className="p-4 border-b border-[#333333]">
          <button
            onClick={clearChat}
            className="w-full px-4 py-2 bg-white text-black hover:bg-gray-200 transition-colors font-medium"
          >
            NEW CHAT
          </button>
          
          <div className="mt-4">
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {conversations.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-4">
              No conversations yet. Start a new chat!
            </div>
          )}
          
          {pinnedConversations.length > 0 && (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pinned</div>
              {pinnedConversations.map(conv => (
                <div key={conv.id} className="flex items-center space-x-2">
                  <button
                    onClick={() => togglePinChat(conv.id)}
                    className="text-gray-400 hover:text-white"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 016 0v2h2V7a5 5 0 00-5-5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => loadConversation(conv.id)}
                    className={`flex-1 text-left px-3 py-2 hover:bg-[#1a1a1a] transition-colors truncate ${
                      conv.id === currentConversationId ? 'bg-[#1a1a1a] border-l-2 border-white' : ''
                    }`}
                  >
                    {conv.title}
                  </button>
                  <button
                    onClick={() => deleteConversation(conv.id)}
                    className="text-gray-400 hover:text-red-500 text-xl"
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
          
          {unpinnedConversations.length > 0 && (
            <>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 mt-4">Recent</div>
              {unpinnedConversations.map(conv => (
                <div key={conv.id} className="flex items-center space-x-2">
                  <button
                    onClick={() => togglePinChat(conv.id)}
                    className="text-gray-400 hover:text-white opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => loadConversation(conv.id)}
                    className={`flex-1 text-left px-3 py-2 hover:bg-[#1a1a1a] transition-colors truncate ${
                      conv.id === currentConversationId ? 'bg-[#1a1a1a] border-l-2 border-white' : ''
                    }`}
                  >
                    {conv.title}
                  </button>
                  <button
                    onClick={() => deleteConversation(conv.id)}
                    className="text-gray-400 hover:text-red-500 text-xl"
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Fixed Header */}
        <header className="sticky top-0 z-10 bg-black border-b border-[#333333] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-4 py-2 bg-[#1a1a1a] border border-[#333333] text-white focus:outline-none focus:border-white"
            >
              {Object.entries(AI_MODELS).map(([key, model]) => (
                <option key={key} value={key}>{model.name}</option>
              ))}
            </select>

            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`px-3 py-2 border ${voiceEnabled ? 'bg-white text-black' : 'border-[#333333] text-white'} hover:bg-gray-200 transition-colors`}
            >
              {voiceEnabled ? 'VOICE ON' : 'VOICE OFF'}
            </button>

            <button
              onClick={() => setShowImageGen(!showImageGen)}
              className="px-3 py-2 border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
            >
              IMAGE
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
            >
              FILE
            </button>

            <button
              onClick={() => pdfInputRef.current?.click()}
              className="px-3 py-2 border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
            >
              PDF
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              onChange={handlePDFUpload}
              className="hidden"
            />
          </div>
          
          <div className="flex items-center space-x-4">
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
                <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-[#333333] shadow-lg">
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
                    onClick={() => handleExport('copy')}
                    className="block w-full text-left px-4 py-2 hover:bg-[#2a2a2a]"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              )}
            </div>
            
            <UserButton 
              appearance={{
                elements: {
                  userButtonAvatarBox: "w-10 h-10",
                }
              }}
            />
          </div>
        </header>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-[#0a0a0a] border-b border-[#333333] p-4">
            <h3 className="text-sm font-medium mb-2">Custom Instructions</h3>
            <textarea
              value={customInstructions}
              onChange={(e) => {
                setCustomInstructions(e.target.value);
                localStorage.setItem('customInstructions', e.target.value);
              }}
              placeholder="Add custom instructions for AI responses..."
              className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white resize-none"
              rows={3}
            />
          </div>
        )}

        {/* Image Generation Panel */}
        {showImageGen && (
          <div className="bg-[#0a0a0a] border-b border-[#333333] p-4">
            <div className="flex space-x-2">
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
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="max-w-3xl mx-auto text-center py-12">
              <h1 className="text-4xl font-bold mb-4">CORPREX AI</h1>
              <p className="text-gray-400 mb-8">How can I assist you today?</p>
              
              {/* Debug info for troubleshooting */}
              {user && (
                <div className="text-xs text-gray-600 mb-4">
                  User: {user.id} | Chats: {conversations.length}
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                <button
                  onClick={() => handleExampleClick('Explain quantum computing in simple terms')}
                  className="text-left p-4 bg-[#0a0a0a] border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
                  disabled={isLoading}
                >
                  <div className="text-sm text-gray-500 mb-1">EXAMPLE</div>
                  <div>Explain quantum computing</div>
                </button>
                
                <button
                  onClick={() => handleExampleClick('Write a Python function to sort a list')}
                  className="text-left p-4 bg-[#0a0a0a] border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
                  disabled={isLoading}
                >
                  <div className="text-sm text-gray-500 mb-1">CODE</div>
                  <div>Write Python code</div>
                </button>
                
                <button
                  onClick={() => handleExampleClick('What are the latest AI developments?')}
                  className="text-left p-4 bg-[#0a0a0a] border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
                  disabled={isLoading}
                >
                  <div className="text-sm text-gray-500 mb-1">RESEARCH</div>
                  <div>Latest AI developments</div>
                </button>
                
                <button
                  onClick={() => handleExampleClick('Help me brainstorm business ideas')}
                  className="text-left p-4 bg-[#0a0a0a] border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
                  disabled={isLoading}
                >
                  <div className="text-sm text-gray-500 mb-1">CREATIVE</div>
                  <div>Brainstorm ideas</div>
                </button>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div key={index} className={`mb-6 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className={`inline-block max-w-3xl ${message.role === 'user' ? 'ml-auto' : ''}`}>
                    <div className={`px-4 py-3 ${
                      message.role === 'user' 
                        ? 'bg-white text-black' 
                        : 'bg-[#1a1a1a] text-white border border-[#333333]'
                    }`}>
                      {message.type === 'image' && message.imageUrl ? (
                        <img src={message.imageUrl} alt="Generated" className="max-w-full h-auto" />
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="mb-6">
                  <div className="inline-block">
                    <div className="px-4 py-3 bg-[#1a1a1a] border border-[#333333]">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="border-t border-[#333333] px-6 py-4 bg-black">
          <div className="max-w-3xl mx-auto flex space-x-4">
            {isListening && (
              <div className="flex items-center text-red-500">
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="10" />
                </svg>
                <span className="ml-2 text-sm">Listening...</span>
              </div>
            )}
            
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-3 bg-[#1a1a1a] border border-[#333333] text-white placeholder-gray-500 focus:outline-none focus:border-white"
              disabled={isLoading}
            />
            
            <button
              type="button"
              onClick={handleVoiceInput}
              className="px-4 py-3 border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
              disabled={isLoading}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium uppercase text-sm tracking-wider"
            >
              {isLoading ? 'SENDING...' : 'SEND'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}