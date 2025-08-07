import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';

export default async function HomePage() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center max-w-4xl px-6">
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
            Corprex AI
          </h1>
          <div className="w-24 h-0.5 bg-white mx-auto mb-6"></div>
          <p className="text-xl text-gray-400 font-light">
            Advanced Intelligence Platform
          </p>
        </div>
        
        <p className="text-gray-500 mb-12 max-w-2xl mx-auto leading-relaxed">
          Enterprise-grade AI solutions with multiple language models, 
          secure data handling, and professional workflow automation.
        </p>
        
        {userId ? (
          <Link
            href="/chat"
            className="inline-block px-8 py-3 bg-white text-black font-semibold rounded-none hover:bg-gray-200 transition-colors duration-200 tracking-wide uppercase text-sm"
          >
            Enter Platform
          </Link>
        ) : (
          <div className="space-x-6">
            <Link
              href="/sign-in"
              className="inline-block px-8 py-3 bg-transparent text-white font-semibold border border-white hover:bg-white hover:text-black transition-all duration-200 tracking-wide uppercase text-sm"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="inline-block px-8 py-3 bg-white text-black font-semibold hover:bg-gray-200 transition-colors duration-200 tracking-wide uppercase text-sm"
            >
              Get Started
            </Link>
          </div>
        )}
        
        <div className="mt-16 pt-8 border-t border-gray-800">
          <p className="text-gray-600 text-xs uppercase tracking-wider">
            Powered by OpenAI • Anthropic • Google • Groq
          </p>
        </div>
      </div>
    </div>
  );
}