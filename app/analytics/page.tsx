'use client';

import { useState, useEffect } from 'react';
import { useUser } from "@clerk/nextjs";
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AnalyticsPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState({
    totalChats: 0,
    totalMessages: 0,
    tokensUsed: 0,
    favoriteModel: 'GPT-4',
    costEstimate: 0,
    avgResponseTime: '1.2s',
    modelsUsed: [] as string[]
  });

  useEffect(() => {
    if (isLoaded && !user) {
      router.push('/sign-in');
    } else if (user) {
      loadAnalytics();
    }
  }, [user, isLoaded]);

  const loadAnalytics = async () => {
    if (!user) return;
    
    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id);
    
    const { data: messages } = await supabase
      .from('messages')
      .select('*');
    
    const tokensUsed = messages?.reduce((acc, msg) => acc + (msg.content.length / 4), 0) || 0;
    const costEstimate = (tokensUsed / 1000) * 0.002; // Rough estimate
    
    const modelsUsed = [...new Set(conversations?.map(c => c.model) || [])];
    
    setStats({
      totalChats: conversations?.length || 0,
      totalMessages: messages?.length || 0,
      tokensUsed: Math.round(tokensUsed),
      favoriteModel: modelsUsed[0] || 'GPT-4',
      costEstimate: costEstimate,
      avgResponseTime: '1.2s',
      modelsUsed: modelsUsed
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="bg-[#0a0a0a] border-b border-[#333333] p-6">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">CORPREX ANALYTICS</h1>
            <p className="text-gray-500 mt-1">AI Usage Dashboard</p>
          </div>
          <button
            onClick={() => router.push('/chat')}
            className="px-4 py-2 bg-white text-black hover:bg-gray-200 transition-colors"
          >
            BACK TO CHAT
          </button>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-[#0a0a0a] border border-[#333333] p-6">
            <h3 className="text-gray-500 text-xs uppercase tracking-wider">Total Conversations</h3>
            <p className="text-4xl font-bold mt-2">{stats.totalChats}</p>
            <p className="text-gray-500 text-sm mt-2">All time</p>
          </div>
          
          <div className="bg-[#0a0a0a] border border-[#333333] p-6">
            <h3 className="text-gray-500 text-xs uppercase tracking-wider">Messages Sent</h3>
            <p className="text-4xl font-bold mt-2">{stats.totalMessages}</p>
            <p className="text-gray-500 text-sm mt-2">Total exchanges</p>
          </div>
          
          <div className="bg-[#0a0a0a] border border-[#333333] p-6">
            <h3 className="text-gray-500 text-xs uppercase tracking-wider">Tokens Used</h3>
            <p className="text-4xl font-bold mt-2">{stats.tokensUsed.toLocaleString()}</p>
            <p className="text-gray-500 text-sm mt-2">≈ ${stats.costEstimate.toFixed(2)}</p>
          </div>
          
          <div className="bg-[#0a0a0a] border border-[#333333] p-6">
            <h3 className="text-gray-500 text-xs uppercase tracking-wider">Avg Response Time</h3>
            <p className="text-4xl font-bold mt-2">{stats.avgResponseTime}</p>
            <p className="text-gray-500 text-sm mt-2">Per message</p>
          </div>
        </div>

        {/* Models Used */}
        <div className="bg-[#0a0a0a] border border-[#333333] p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Models Used</h2>
          <div className="flex flex-wrap gap-2">
            {stats.modelsUsed.map(model => (
              <span key={model} className="px-3 py-1 bg-[#1a1a1a] border border-[#333333] text-sm">
                {model}
              </span>
            ))}
          </div>
        </div>

        {/* Usage Chart Placeholder */}
        <div className="bg-[#0a0a0a] border border-[#333333] p-6">
          <h2 className="text-xl font-semibold mb-4">Usage Over Time</h2>
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p>Advanced analytics coming soon</p>
              <p className="text-sm mt-2">Track usage patterns and optimize costs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}