import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// Initialize all AI clients
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
      // OpenAI models (GPT-4, GPT-3.5, etc.)
      if (!openai) {
        responseContent = "Welcome to Corprex AI! To enable OpenAI models, please add your OPENAI_API_KEY in Vercel settings.";
      } else {
        try {
          if (stream) {
            // Streaming response
            const stream = await openai.chat.completions.create({
              model,
              messages,
              temperature,
              max_tokens,
              stream: true,
            });

            // Return streaming response
            const encoder = new TextEncoder();
            const readableStream = new ReadableStream({
              async start(controller) {
                for await (const chunk of stream) {
                  const text = chunk.choices[0]?.delta?.content || '';
                  controller.enqueue(encoder.encode(text));
                }
                controller.close();
              },
            });

            return new Response(readableStream, {
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
              },
            });
          } else {
            // Non-streaming response
            const completion = await openai.chat.completions.create({
              model,
              messages,
              temperature,
              max_tokens,
            });
            responseContent = completion.choices[0]?.message?.content || 'No response generated';
          }
        } catch (error: any) {
          console.error('OpenAI API error:', error);
          responseContent = `Error: ${error.message}. Please check your API key and try again.`;
        }
      }
    } else if (model.startsWith('claude')) {
      // Anthropic Claude models
      if (!anthropic) {
        responseContent = "To use Claude models, please add your ANTHROPIC_API_KEY in Vercel settings.";
      } else {
        try {
          const message = await anthropic.messages.create({
            model: model,
            max_tokens: max_tokens,
            temperature: temperature,
            messages: messages.filter((m: any) => m.role !== 'system').map((m: any) => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content,
            })),
            system: messages.find((m: any) => m.role === 'system')?.content,
          });
          responseContent = message.content[0].type === 'text' ? message.content[0].text : 'No response generated';
        } catch (error: any) {
          console.error('Anthropic API error:', error);
          responseContent = `Error: ${error.message}. Please check your Anthropic API key.`;
        }
      }
    } else if (model.includes('gemini')) {
      // Google Gemini models
      if (!googleAI) {
        responseContent = "To use Gemini models, please add your GOOGLE_AI_API_KEY in Vercel settings.";
      } else {
        try {
          const genModel = googleAI.getGenerativeModel({ model: "gemini-pro" });
          const lastMessage = messages[messages.length - 1].content;
          const result = await genModel.generateContent(lastMessage);
          const response = await result.response;
          responseContent = response.text();
        } catch (error: any) {
          console.error('Google AI API error:', error);
          responseContent = `Error: ${error.message}. Please check your Google AI API key.`;
        }
      }
    } else if (model.includes('llama') || model.includes('mixtral')) {
      // Groq models (Llama, Mixtral)
      if (!groq) {
        responseContent = "To use Llama/Mixtral models, please add your GROQ_API_KEY in Vercel settings.";
      } else {
        try {
          const completion = await groq.chat.completions.create({
            messages,
            model,
            temperature,
            max_tokens,
          });
          responseContent = completion.choices[0]?.message?.content || 'No response generated';
        } catch (error: any) {
          console.error('Groq API error:', error);
          responseContent = `Error: ${error.message}. Please check your Groq API key.`;
        }
      }
    } else {
      // Default fallback response
      responseContent = "I'm ready to assist you! Please select a valid AI model or add the required API keys in your Vercel settings.";
    }

    // IMPORTANT: Always return in the correct format
    return NextResponse.json({ 
      content: responseContent 
    });

  } catch (error: any) {
    console.error('Chat API error:', error);
    
    // Return error in correct format
    return NextResponse.json(
      { content: `Sorry, an error occurred: ${error.message || 'Unknown error'}. Please try again.` },
      { status: 500 }
    );
  }
}

// Support for streaming responses
export const runtime = 'edge';