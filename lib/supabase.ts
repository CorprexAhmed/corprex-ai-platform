import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase environment variables are missing!');
  console.log('URL exists:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const supabase = createClient(
  supabaseUrl || 'https://smbwxpxdicdzmrozbmoi.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtYnd4cHhkaWNkem1yb3pibW9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1MjIyNTAsImV4cCI6MjA3MDA5ODI1MH0.j7TfuNcvlbotlmqr9LgD_ypT885yhEeXAixMca2KO7M'
);

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  model?: string;
  folder?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  type?: string;
  created_at: string;
}