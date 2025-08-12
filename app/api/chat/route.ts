import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// Initialize API clients only if API keys are present
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

const googleAI = process.env.GOOGLE_AI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

const groq = process.env.GROQ_API_KEY ? new Groq({
  apiKey: process.env.GROQ_API_KEY,
}) : null;

export async function POST(req: Request) {
  try {
    const { messages, model = 'gpt-3.5-turbo', temperature = 0.7, max_tokens = 2048 } = await req.json();

    let responseContent = '';

    // Handle different models
    if (model.startsWith('gpt')) {
      // OpenAI models
      if (!openai) {
        return NextResponse.json({
          content: "To use GPT models, please add your OPENAI_API_KEY in Vercel settings."
        });
      }

      try {
        const completion = await openai.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens,
        });

        responseContent = completion.choices[0]?.message?.content || 'No response generated';
      } catch (error: any) {
        console.error('OpenAI API error:', error);
        responseContent = `Error: ${error.message}. Please check your OpenAI API key.`;
      }
    } else if (model.includes('claude')) {
      // Anthropic Claude models
      if (!anthropic) {
        return NextResponse.json({
          content: "To use Claude models, please add your ANTHROPIC_API_KEY in Vercel settings."
        });
      }

      try {
        // Use the correct Claude model ID
        const claudeModel = 'claude-3-5-sonnet-20241022';
        
        const message = await anthropic.messages.create({
          model: claudeModel,
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
    } else if (model.includes('gemini')) {
      // Google Gemini models
      if (!googleAI) {
        return NextResponse.json({
          content: "To use Gemini models, please add your GOOGLE_AI_API_KEY in Vercel settings."
        });
      }

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
    } else if (model.includes('llama') || model.includes('mixtral')) {
      // Groq models (Llama, Mixtral)
      if (!groq) {
        return NextResponse.json({
          content: "To use Llama/Mixtral models, please add your GROQ_API_KEY in Vercel settings."
        });
      }

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
    } else {
      // Default fallback response
      responseContent = "I'm ready to assist you! Please select a valid AI model or add the required API keys in your Vercel settings.";
    }

    return NextResponse.json({ content: responseContent });
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json({
      content: "An error occurred processing your request. Please try again."
    });
  }
}
