import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { messages, model = 'gpt-3.5-turbo' } = await req.json();
    
    // Clean messages - remove timestamp property that some APIs don't support
    const cleanMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }));
    
    let response = '';
    
    // OpenAI Models
    if (model.startsWith('gpt')) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }
      
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      
      const completion = await openai.chat.completions.create({
        model: model,
        messages: cleanMessages,
        stream: false,
      });
      response = completion.choices[0].message.content || '';
    }
    
    // Anthropic Claude - Updated model names
    else if (model.includes('claude')) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Anthropic API key not configured');
      }
      
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      
      // Convert messages format for Claude
      const formattedMessages = cleanMessages.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));
      
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022', // Updated model name
        max_tokens: 1024,
        messages: formattedMessages
      });
      
      if (message.content[0].type === 'text') {
        response = message.content[0].text;
      }
    }
    
    // Google Gemini - Updated model name
    else if (model.includes('gemini')) {
      if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error('Google AI API key not configured');
      }
      
      const gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
      const genModel = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Updated model
      
      // Build conversation history for Gemini
      const history = cleanMessages.slice(0, -1).map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      
      const chat = genModel.startChat({ history });
      const lastMessage = cleanMessages[cleanMessages.length - 1].content;
      const result = await chat.sendMessage(lastMessage);
      response = result.response.text();
    }
    
    // Groq (Mixtral) - Fixed to use clean messages
    else if (model === 'mixtral-8x7b') {
      if (!process.env.GROQ_API_KEY) {
        throw new Error('Groq API key not configured');
      }
      
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
      
      const completion = await groq.chat.completions.create({
        messages: cleanMessages, // Use cleaned messages without timestamp
        model: 'mixtral-8x7b-32768',
        temperature: 0.7,
      });
      
      response = completion.choices[0]?.message?.content || '';
    }
    
    // Default fallback to GPT-3.5
    else {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('No API keys configured');
      }
      
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: cleanMessages,
        stream: false,
      });
      response = completion.choices[0].message.content || '';
    }

    return NextResponse.json({ content: response });
    
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get response' },
      { status: 500 }
    );
  }
}