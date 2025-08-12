import React, { useState, useEffect, useCallback } from 'react';

// Speech Recognition Class
export class VoiceRecognition {
  private recognition: any;
  
  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || 
                                (window as any).webkitSpeechRecognition || 
                                (window as any).mozSpeechRecognition || 
                                (window as any).msSpeechRecognition;
      
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;
      }
    }
  }
  
  isSupported(): boolean {
    return !!this.recognition;
  }
  
  async startListening(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        reject(new Error('Speech recognition not supported in this browser'));
        return;
      }
      
      this.recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript;
        
        if (event.results[last].isFinal) {
          resolve(transcript);
        }
      };
      
      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        reject(new Error(`Speech recognition error: ${event.error}`));
      };
      
      this.recognition.onend = () => {
        console.log('Speech recognition ended');
      };
      
      try {
        this.recognition.start();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
    }
  }
}

// Text to Speech Class
export class VoiceOutput {
  private synthesis: SpeechSynthesis | null = null;
  
  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
    }
  }
  
  isSupported(): boolean {
    return !!this.synthesis;
  }
  
  speak(text: string, options?: { rate?: number; pitch?: number; volume?: number; voice?: string }) {
    if (!this.synthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }
    
    // Cancel any ongoing speech
    this.synthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.rate || 1;
    utterance.pitch = options?.pitch || 1;
    utterance.volume = options?.volume || 1;
    
    // Set voice if specified
    if (options?.voice) {
      const voices = this.synthesis.getVoices();
      const selectedVoice = voices.find(v => v.name === options.voice);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    this.synthesis.speak(utterance);
  }
  
  stop() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }
  
  getVoices(): SpeechSynthesisVoice[] {
    if (!this.synthesis) return [];
    return this.synthesis.getVoices();
  }
}

// React Component for Voice Input
interface VoiceInputProps {
  onTranscript: (transcript: string) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
}

export function VoiceInput({ onTranscript, isListening, setIsListening }: VoiceInputProps) {
  const [recognition, setRecognition] = useState<VoiceRecognition | null>(null);
  const [error, setError] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  
  useEffect(() => {
    const voiceRecognition = new VoiceRecognition();
    setRecognition(voiceRecognition);
    
    return () => {
      voiceRecognition.stopListening();
    };
  }, []);
  
  const startListening = useCallback(async () => {
    if (!recognition) {
      setError('Voice recognition not initialized');
      return;
    }
    
    if (!recognition.isSupported()) {
      setError('Voice recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }
    
    setError('');
    setIsListening(true);
    
    try {
      const transcript = await recognition.startListening();
      onTranscript(transcript);
      setInterimTranscript('');
    } catch (err: any) {
      console.error('Voice input error:', err);
      setError(err.message || 'Failed to capture voice input');
    } finally {
      setIsListening(false);
    }
  }, [recognition, onTranscript, setIsListening]);
  
  const stopListening = useCallback(() => {
    if (recognition) {
      recognition.stopListening();
      setIsListening(false);
      setInterimTranscript('');
    }
  }, [recognition, setIsListening]);
  
  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };
  
  return (
    <div className="voice-input-container">
      <button
        type="button"
        onClick={handleClick}
        className={`px-3 py-3 border transition-all duration-200 ${
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
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
            />
          </svg>
        )}
      </button>
      
      {error && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-red-500/10 border border-red-500 text-red-500 text-xs p-2 rounded">
          {error}
        </div>
      )}
      
      {interimTranscript && (
        <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#1a1a1a] border border-[#333] text-gray-400 text-xs p-2 rounded">
          {interimTranscript}
        </div>
      )}
    </div>
  );
}

// React Component for Voice Output
interface VoiceOutputControlProps {
  text: string;
  autoPlay?: boolean;
  onEnd?: () => void;
}

export function VoiceOutputControl({ text, autoPlay = false, onEnd }: VoiceOutputControlProps) {
  const [synthesis, setSynthesis] = useState<VoiceOutput | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  useEffect(() => {
    const voiceOutput = new VoiceOutput();
    setSynthesis(voiceOutput);
    
    // Load voices
    const loadVoices = () => {
      const availableVoices = voiceOutput.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoice) {
        setSelectedVoice(availableVoices[0].name);
      }
    };
    
    loadVoices();
    
    // Some browsers load voices asynchronously
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      voiceOutput.stop();
    };
  }, [selectedVoice]);
  
  useEffect(() => {
    if (autoPlay && text && synthesis) {
      handlePlay();
    }
  }, [text, autoPlay]);
  
  const handlePlay = () => {
    if (!synthesis || !text) return;
    
    if (!synthesis.isSupported()) {
      console.warn('Text-to-speech is not supported in your browser');
      return;
    }
    
    setIsPlaying(true);
    synthesis.speak(text, { voice: selectedVoice });
    
    // Monitor when speech ends
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const checkEnd = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          clearInterval(checkEnd);
          setIsPlaying(false);
          onEnd?.();
        }
      }, 100);
    }
  };
  
  const handleStop = () => {
    if (synthesis) {
      synthesis.stop();
      setIsPlaying(false);
    }
  };
  
  if (!synthesis?.isSupported()) {
    return null;
  }
  
  return (
    <div className="voice-output-control flex items-center gap-2">
      <button
        type="button"
        onClick={isPlaying ? handleStop : handlePlay}
        className="p-2 border border-[#333333] hover:bg-[#1a1a1a] transition-colors"
        title={isPlaying ? 'Stop speaking' : 'Read aloud'}
      >
        {isPlaying ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" 
            />
          </svg>
        )}
      </button>
      
      {voices.length > 0 && (
        <select
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
          className="text-xs bg-[#1a1a1a] border border-[#333] text-white px-2 py-1 rounded"
        >
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
