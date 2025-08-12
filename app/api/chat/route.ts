import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// Initialize clients
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

const googleAI = process.env.GOOGLE_AI_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY) : null;

const groq = process.env.GROQ_API_KEY ? new Groq({
  apiKey: process.env.GROQ_API_KEY,
}) : null;

export async function POST(req: NextRequest) {
  try {
    const { messages, model = 'gpt-3.5-turbo', temperature = 0.7, max_tokens = 2048, stream = false } = await req.json();

    let responseContent = '';

    // Handle different model providers
    if (model.startsWith('gpt')) {
      // OpenAI models
      if (!openai) {
        // Fallback response if no API key
        responseContent = "I'm working! However, no OpenAI API key is configured. Add your OPENAI_API_KEY to enable AI responses.";
      } else {
        const completion = await openai.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens,
        });
        responseContent = completion.choices[0]?.message?.content || 'No response generated';
      }
    } else if (model.startsWith('claude')) {
      // Anthropic models
      if (!anthropic) {
        responseContent = "Claude models require an Anthropic API key. Add ANTHROPIC_API_KEY to enable Claude.";
      } else {
        const message = await anthropic.messages.create({
          model,
          max_tokens,
          temperature,
          messages: messages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        });
        responseContent = message.content[0].text;
      }
    } else if (model.startsWith('gemini')) {
      // Google models
      if (!googleAI) {
        responseContent = "Gemini models require a Google AI API key. Add GOOGLE_AI_API_KEY to enable Gemini.";
      } else {
        const genModel = googleAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await genModel.generateContent(messages[messages.length - 1].content);
        const response = await result.response;
        responseContent = response.text();
      }
    } else if (model.includes('llama') || model.includes('mixtral')) {
      // Groq models
      if (!groq) {
        responseContent = "Groq models require a Groq API key. Add GROQ_API_KEY to enable Llama/Mixtral.";
      } else {
        const completion = await groq.chat.completions.create({
          messages,
          model,
          temperature,
          max_tokens,
        });
        responseContent = completion.choices[0]?.message?.content || 'No response generated';
      }
    } else {
      // Default fallback
      responseContent = "Yes, I am functional and ready to assist you with your queries. How can I help you today?";
    }

    // Return just the content, not wrapped in JSON
    return NextResponse.json({ content: responseContent });

  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { content: `Error: ${error.message || 'Failed to process request'}` },
      { status: 500 }
    );
  }
}