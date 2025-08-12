import React, { useState, useEffect, useCallback } from 'react';

// Speech Recognition Class
export class VoiceInput {
  private recognition: any;
  
  constructor() {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    }
  }
  
  async startListening(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject('Speech recognition not supported');
        return;
      }
      
      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      };
      
      this.recognition.onerror = (event: any) => {
        reject(event.error);
      };
      
      this.recognition.start();
    });
  }
  
  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
    }
  }
}

// Text to Speech Class
export class VoiceOutput {
  speak(text: string, rate: number = 1) {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      window.speechSynthesis.speak(utterance);
    }
  }
  
  stop() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

// React Component for Voice Input
interface VoiceInputComponentProps {
  onTranscript: (transcript: string) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
}

export function VoiceInputComponent({ onTranscript, isListening, setIsListening }: VoiceInputComponentProps) {
  const [voiceInput, setVoiceInput] = useState<VoiceInput | null>(null);
  
  useEffect(() => {
    setVoiceInput(new VoiceInput());
  }, []);
  
  const handleVoiceInput = async () => {
    if (!voiceInput) return;
    
    if (isListening) {
      voiceInput.stopListening();
      setIsListening(false);
    } else {
      setIsListening(true);
      try {
        const transcript = await voiceInput.startListening();
        onTranscript(transcript);
      } catch (error) {
        console.error('Voice input error:', error);
      } finally {
        setIsListening(false);
      }
    }
  };
  
  return (
    <button
      type="button"
      onClick={handleVoiceInput}
      className={`px-3 py-3 border transition-colors ${
        isListening 
          ? 'border-red-500 bg-red-500/10 animate-pulse' 
          : 'border-[#333333] hover:bg-[#1a1a1a]'
      }`}
      title={isListening ? 'Stop listening' : 'Start voice input'}
    >
      {isListening ? (
        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      )}
    </button>
  );
}
