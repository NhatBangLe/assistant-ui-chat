// package.json
{
  "name": "assistant-ui-nextjs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@reduxjs/toolkit": "^1.9.7",
    "react-redux": "^8.1.3",
    "axios": "^1.6.0",
    "@types/node": "^20.8.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.2.0",
    "tailwindcss": "^3.3.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.31",
    "lucide-react": "^0.263.1",
    "uuid": "^9.0.1",
    "@types/uuid": "^9.0.6"
  },
  "devDependencies": {
    "eslint": "^8.51.0",
    "eslint-config-next": "14.0.0"
  }
}

// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
}

module.exports = nextConfig

// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-gentle': 'bounce 1s infinite',
      },
    },
  },
  plugins: [],
}

// postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

// src/types/index.ts
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  attachments?: Attachment[];
  isStreaming?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  file?: File;
}

export interface Thread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExternalStoreState {
  threads: Thread[];
  currentThreadId: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface StreamingResponse {
  content: string;
  done: boolean;
  messageId: string;
}

// src/lib/external-store.ts
import { v4 as uuidv4 } from 'uuid';
import { ExternalStoreState, Thread, Message } from '@/types';

class ExternalStoreRuntime {
  private state: ExternalStoreState = {
    threads: [],
    currentThreadId: null,
    isLoading: false,
    error: null,
  };

  private listeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot = () => this.state;

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  setState(newState: Partial<ExternalStoreState>) {
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  createThread(title: string = 'New Conversation'): string {
    const threadId = uuidv4();
    const newThread: Thread = {
      id: threadId,
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.setState({
      threads: [...this.state.threads, newThread],
      currentThreadId: threadId,
    });

    return threadId;
  }

  addMessage(threadId: string, message: Omit<Message, 'id' | 'timestamp'>) {
    const messageWithId: Message = {
      ...message,
      id: uuidv4(),
      timestamp: new Date(),
    };

    this.setState({
      threads: this.state.threads.map(thread =>
        thread.id === threadId
          ? {
              ...thread,
              messages: [...thread.messages, messageWithId],
              updatedAt: new Date(),
            }
          : thread
      ),
    });

    return messageWithId.id;
  }

  updateMessage(threadId: string, messageId: string, updates: Partial<Message>) {
    this.setState({
      threads: this.state.threads.map(thread =>
        thread.id === threadId
          ? {
              ...thread,
              messages: thread.messages.map(msg =>
                msg.id === messageId ? { ...msg, ...updates } : msg
              ),
              updatedAt: new Date(),
            }
          : thread
      ),
    });
  }

  setCurrentThread(threadId: string | null) {
    this.setState({ currentThreadId: threadId });
  }

  deleteThread(threadId: string) {
    this.setState({
      threads: this.state.threads.filter(thread => thread.id !== threadId),
      currentThreadId: this.state.currentThreadId === threadId ? null : this.state.currentThreadId,
    });
  }

  setLoading(isLoading: boolean) {
    this.setState({ isLoading });
  }

  setError(error: string | null) {
    this.setState({ error });
  }
}

export const externalStoreRuntime = new ExternalStoreRuntime();

// src/lib/api.ts
import axios from 'axios';
import { StreamingResponse } from '@/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  timeout: 30000,
});

export class AssistantAPI {
  static async sendMessage(content: string, threadId?: string): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content, threadId }),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    return response.body!;
  }

  static async uploadAttachment(file: File): Promise<{ id: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/attachments/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  static async deleteAttachment(attachmentId: string): Promise<void> {
    await api.delete(`/attachments/${attachmentId}`);
  }
}

// src/lib/attachment-adapter.ts
import { Attachment } from '@/types';
import { AssistantAPI } from './api';

export class AttachmentAdapter {
  private attachments: Map<string, Attachment> = new Map();

  async addAttachment(file: File): Promise<Attachment> {
    const attachment: Attachment = {
      id: `temp-${Date.now()}`,
      name: file.name,
      type: file.type,
      size: file.size,
      file,
    };

    this.attachments.set(attachment.id, attachment);

    try {
      const uploadResult = await AssistantAPI.uploadAttachment(file);
      const uploadedAttachment: Attachment = {
        ...attachment,
        id: uploadResult.id,
        url: uploadResult.url,
        file: undefined,
      };

      this.attachments.delete(attachment.id);
      this.attachments.set(uploadedAttachment.id, uploadedAttachment);

      return uploadedAttachment;
    } catch (error) {
      this.attachments.delete(attachment.id);
      throw error;
    }
  }

  removeAttachment(attachmentId: string): void {
    const attachment = this.attachments.get(attachmentId);
    if (attachment && attachment.url) {
      AssistantAPI.deleteAttachment(attachmentId).catch(console.error);
    }
    this.attachments.delete(attachmentId);
  }

  getAttachment(attachmentId: string): Attachment | undefined {
    return this.attachments.get(attachmentId);
  }

  getAllAttachments(): Attachment[] {
    return Array.from(this.attachments.values());
  }

  clearAttachments(): void {
    this.attachments.clear();
  }
}

export const attachmentAdapter = new AttachmentAdapter();

// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import assistantReducer from './slices/assistantSlice';

export const store = configureStore({
  reducer: {
    assistant: assistantReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['assistant/setAttachments'],
        ignoredPaths: ['assistant.attachments'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// src/store/slices/assistantSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Attachment } from '@/types';
import { AssistantAPI } from '@/lib/api';
import { externalStoreRuntime } from '@/lib/external-store';

interface AssistantState {
  attachments: Attachment[];
  isProcessing: boolean;
  streamingMessageId: string | null;
}

const initialState: AssistantState = {
  attachments: [],
  isProcessing: false,
  streamingMessageId: null,
};

export const sendMessageAsync = createAsyncThunk(
  'assistant/sendMessage',
  async ({ content, threadId }: { content: string; threadId?: string }) => {
    try {
      externalStoreRuntime.setLoading(true);
      
      // Add user message
      const userMessageId = externalStoreRuntime.addMessage(threadId!, {
        content,
        role: 'user',
      });

      // Add assistant message placeholder
      const assistantMessageId = externalStoreRuntime.addMessage(threadId!, {
        content: '',
        role: 'assistant',
        isStreaming: true,
      });

      // Get streaming response
      const stream = await AssistantAPI.sendMessage(content, threadId);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                externalStoreRuntime.updateMessage(threadId!, assistantMessageId, {
                  content: fullContent,
                });
              }
            } catch (error) {
              console.error('Error parsing streaming data:', error);
            }
          }
        }
      }

      // Mark streaming as complete
      externalStoreRuntime.updateMessage(threadId!, assistantMessageId, {
        isStreaming: false,
      });

      return { messageId: assistantMessageId, content: fullContent };
    } catch (error) {
      externalStoreRuntime.setError(error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      externalStoreRuntime.setLoading(false);
    }
  }
);

const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    setAttachments: (state, action: PayloadAction<Attachment[]>) => {
      state.attachments = action.payload;
    },
    addAttachment: (state, action: PayloadAction<Attachment>) => {
      state.attachments.push(action.payload);
    },
    removeAttachment: (state, action: PayloadAction<string>) => {
      state.attachments = state.attachments.filter(att => att.id !== action.payload);
    },
    clearAttachments: (state) => {
      state.attachments = [];
    },
    setStreamingMessageId: (state, action: PayloadAction<string | null>) => {
      state.streamingMessageId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendMessageAsync.pending, (state) => {
        state.isProcessing = true;
      })
      .addCase(sendMessageAsync.fulfilled, (state, action) => {
        state.isProcessing = false;
        state.streamingMessageId = null;
        state.attachments = [];
      })
      .addCase(sendMessageAsync.rejected, (state) => {
        state.isProcessing = false;
        state.streamingMessageId = null;
      });
  },
});

export const {
  setAttachments,
  addAttachment,
  removeAttachment,
  clearAttachments,
  setStreamingMessageId,
} = assistantSlice.actions;

export default assistantSlice.reducer;

// src/hooks/useExternalStore.ts
import { useSyncExternalStore } from 'react';
import { externalStoreRuntime } from '@/lib/external-store';

export function useExternalStore() {
  const state = useSyncExternalStore(
    externalStoreRuntime.subscribe.bind(externalStoreRuntime),
    externalStoreRuntime.getSnapshot
  );

  return state;
}

// src/components/MessageList.tsx
import React from 'react';
import { Message } from '@/types';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
};

// src/components/MessageBubble.tsx
import React from 'react';
import { Message } from '@/types';
import { User, Bot, Loader2 } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
        ${isUser ? 'bg-blue-500' : 'bg-gray-600'}
      `}>
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-white" />
        )}
      </div>
      
      <div className={`
        max-w-3xl p-4 rounded-2xl shadow-lg
        ${isUser 
          ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white' 
          : 'bg-white border border-gray-200'
        }
      `}>
        <div className="whitespace-pre-wrap">
          {message.content}
          {message.isStreaming && (
            <Loader2 className="inline w-4 h-4 ml-2 animate-spin" />
          )}
        </div>
        
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map((attachment) => (
              <div key={attachment.id} className="text-sm opacity-75">
                📎 {attachment.name}
              </div>
            ))}
          </div>
        )}
        
        <div className="text-xs opacity-50 mt-2">
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

// src/components/MessageInput.tsx
import React, { useState, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { Send, Paperclip, X } from 'lucide-react';
import { AppDispatch } from '@/store';
import { sendMessageAsync, addAttachment, removeAttachment } from '@/store/slices/assistantSlice';
import { useExternalStore } from '@/hooks/useExternalStore';
import { attachmentAdapter } from '@/lib/attachment-adapter';
import { Attachment } from '@/types';

export const MessageInput: React.FC = () => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const dispatch = useDispatch<AppDispatch>();
  const { currentThreadId, isLoading } = useExternalStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() && attachments.length === 0) return;
    if (!currentThreadId) return;

    try {
      await dispatch(sendMessageAsync({
        content: input,
        threadId: currentThreadId,
      })).unwrap();

      setInput('');
      setAttachments([]);
      attachmentAdapter.clearAttachments();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    for (const file of files) {
      try {
        const attachment = await attachmentAdapter.addAttachment(file);
        setAttachments(prev => [...prev, attachment]);
        dispatch(addAttachment(attachment));
      } catch (error) {
        console.error('Failed to upload attachment:', error);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    attachmentAdapter.removeAttachment(attachmentId);
    setAttachments(prev => prev.filter(att => att.id !== attachmentId));
    dispatch(removeAttachment(attachmentId));
  };

  return (
    <div className="border-t border-gray-200 p-4 bg-white">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-2"
            >
              <span className="text-sm text-gray-700">{attachment.name}</span>
              <button
                onClick={() => handleRemoveAttachment(attachment.id)}
                className="text-gray-500 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        <div className="flex-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="w-full p-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '120px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3 text-gray-500 hover:text-blue-500 transition-colors"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        
        <button
          type="submit"
          disabled={isLoading || (!input.trim() && attachments.length === 0)}
          className="p-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};

// src/components/ThreadSidebar.tsx
import React from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { useExternalStore } from '@/hooks/useExternalStore';
import { externalStoreRuntime } from '@/lib/external-store';

export const ThreadSidebar: React.FC = () => {
  const { threads, currentThreadId } = useExternalStore();

  const handleNewThread = () => {
    externalStoreRuntime.createThread();
  };

  const handleSelectThread = (threadId: string) => {
    externalStoreRuntime.setCurrentThread(threadId);
  };

  const handleDeleteThread = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    externalStoreRuntime.deleteThread(threadId);
  };

  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={handleNewThread}
          className="w-full flex items-center space-x-2 px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>New Conversation</span>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className={`
                group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors
                ${currentThreadId === thread.id 
                  ? 'bg-blue-100 border-2 border-blue-500' 
                  : 'bg-white hover:bg-gray-50 border-2 border-transparent'
                }
              `}
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <MessageSquare className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">
                    {thread.title}
                  </div>
                  <div className="text-sm text-gray-500">
                    {thread.messages.length} messages
                  </div>
                </div>
              </div>
              
              <button
                onClick={(e) => handleDeleteThread(thread.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// src/components/AssistantUI.tsx
import React, { useEffect } from 'react';
import { ThreadSidebar } from './ThreadSidebar';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { useExternalStore } from '@/hooks/useExternalStore';
import { externalStoreRuntime } from '@/lib/external-store';

export const AssistantUI: React.FC = () => {
  const { threads, currentThreadId } = useExternalStore();
  
  const currentThread = threads.find(t => t.id === currentThreadId);

  useEffect(() => {
    // Create initial thread if none exists
    if (threads.length === 0) {
      externalStoreRuntime.createThread('Welcome Conversation');
    }
  }, [threads.length]);

  return (
    <div className="flex h-screen bg-gray-100">
      <ThreadSidebar />
      
      <div className="flex-1 flex flex-col">
        {currentThread ? (
          <>
            <div className="bg-white border-b border-gray-200 p-4">
              <h1 className="text-xl font-semibold text-gray-900">
                {currentThread.title}
              </h1>
            </div>
            
            <MessageList messages={currentThread.messages} />
            <MessageInput />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Welcome to Assistant UI
              </h2>
              <p className="text-gray-600">
                Select a conversation or create a new one to get started.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// src/app/layout.tsx
import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Assistant UI - Next.js',
  description: 'Complete Assistant UI with streaming, attachments, and thread management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}

// src/app/providers.tsx
'use client';

import React from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      {children}
    </Provider>
  );
}

// src/app/globals.css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* Smooth animations */
* {
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

/* Focus styles */
*:focus {
  outline: 2px solid transparent;
  outline-offset: 2px;
}

// src/app/page.tsx
import { AssistantUI } from '@/components/AssistantUI';

export default function Home() {
  return <AssistantUI />;
}

// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { content, threadId } = await request.json();

    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        // Simulate streaming response
        const response = `Here's my response to: ${content}`;
        const words = response.split(' ');
        
        let index = 0;
        const interval = setInterval(() => {
          if (index < words.length) {
            const chunk = `data: ${JSON.stringify({
              content: words[index] + ' ',
              done: false,
              messageId: `msg-${Date.now()}`,
            })}\n\n`;
            
            controller.enqueue(new TextEncoder().encode(chunk));
            index++;
          } else {
            const doneChunk = `data: ${JSON.stringify({
              content: '',
              done: true,
              messageId: `msg-${Date.now()}`,
            })}\n\n`;
            
            controller.enqueue(new TextEncoder().encode(doneChunk));
            controller.close();
            clearInterval(interval);
          }
        }, 100);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// src/app/api/attachments/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Generate unique filename
    const fileId = uuidv4();
    const fileName = `${fileId}-${file.name}`;
    const filePath = join(uploadsDir, fileName);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    return NextResponse.json({
      id: fileId,
      url: `/uploads/${fileName}`,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// src/app/api/attachments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { join } from 'path';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // In a real application, you would look up the file path from a database
    // For this example, we'll assume the file follows the naming pattern
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    
    // This is a simplified approach - in production, you'd want to:
    // 1. Look up the actual filename from a database
    // 2. Verify the user has permission to delete the file
    // 3. Handle cases where the file doesn't exist
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete attachment error:', error);
    return NextResponse.json(
      { error: 'Failed to delete attachment' },
      { status: 500 }
    );
  }
}

// src/lib/streaming-handler.ts
export class StreamingHandler {
  static async handleStreamingResponse(
    stream: ReadableStream<Uint8Array>,
    onChunk: (content: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          onComplete?.();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                onChunk(data.content);
              }
              if (data.done) {
                onComplete?.();
                return;
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming data:', parseError);
            }
          }
        }
      }
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Streaming error'));
    }
  }
}

// src/lib/thread-manager.ts
import { Thread, Message } from '@/types';
import { externalStoreRuntime } from './external-store';

export class ThreadManager {
  static generateThreadTitle(messages: Message[]): string {
    if (messages.length === 0) return 'New Conversation';
    
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) return 'New Conversation';
    
    // Generate title from first user message (max 50 characters)
    const title = firstUserMessage.content.slice(0, 50);
    return title.length < firstUserMessage.content.length ? title + '...' : title;
  }

  static updateThreadTitle(threadId: string): void {
    const state = externalStoreRuntime.getSnapshot();
    const thread = state.threads.find(t => t.id === threadId);
    
    if (!thread || thread.messages.length === 0) return;
    
    const newTitle = this.generateThreadTitle(thread.messages);
    
    if (newTitle !== thread.title && newTitle !== 'New Conversation') {
      externalStoreRuntime.setState({
        threads: state.threads.map(t =>
          t.id === threadId ? { ...t, title: newTitle } : t
        ),
      });
    }
  }

  static exportThread(threadId: string): string {
    const state = externalStoreRuntime.getSnapshot();
    const thread = state.threads.find(t => t.id === threadId);
    
    if (!thread) throw new Error('Thread not found');
    
    const exportData = {
      id: thread.id,
      title: thread.title,
      createdAt: thread.createdAt,
      messages: thread.messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        attachments: m.attachments,
      })),
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  static importThread(jsonData: string): Thread {
    try {
      const data = JSON.parse(jsonData);
      
      const thread: Thread = {
        id: data.id || crypto.randomUUID(),
        title: data.title || 'Imported Conversation',
        createdAt: new Date(data.createdAt || Date.now()),
        updatedAt: new Date(),
        messages: data.messages?.map((m: any) => ({
          id: crypto.randomUUID(),
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp || Date.now()),
          attachments: m.attachments || [],
        })) || [],
      };
      
      externalStoreRuntime.setState({
        threads: [...externalStoreRuntime.getSnapshot().threads, thread],
      });
      
      return thread;
    } catch (error) {
      throw new Error('Invalid thread data format');
    }
  }
}

// src/components/ThreadActions.tsx
import React, { useState } from 'react';
import { Download, Upload, MoreHorizontal, Trash2, Edit2 } from 'lucide-react';
import { ThreadManager } from '@/lib/thread-manager';
import { externalStoreRuntime } from '@/lib/external-store';

interface ThreadActionsProps {
  threadId: string;
  threadTitle: string;
}

export const ThreadActions: React.FC<ThreadActionsProps> = ({ threadId, threadTitle }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(threadTitle);

  const handleExport = () => {
    try {
      const exportData = ThreadManager.exportThread(threadId);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thread-${threadTitle.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
    setShowMenu(false);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        ThreadManager.importThread(text);
      } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import thread. Please check the file format.');
      }
    };
    input.click();
    setShowMenu(false);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      externalStoreRuntime.deleteThread(threadId);
    }
    setShowMenu(false);
  };

  const handleEditTitle = () => {
    setIsEditing(true);
    setShowMenu(false);
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== threadTitle) {
      const state = externalStoreRuntime.getSnapshot();
      externalStoreRuntime.setState({
        threads: state.threads.map(t =>
          t.id === threadId ? { ...t, title: editTitle.trim() } : t
        ),
      });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(threadTitle);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSaveTitle();
            if (e.key === 'Escape') handleCancelEdit();
          }}
          autoFocus
        />
        <button
          onClick={handleSaveTitle}
          className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Save
        </button>
        <button
          onClick={handleCancelEdit}
          className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px]">
            <button
              onClick={handleEditTitle}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center space-x-2"
            >
              <Edit2 className="w-4 h-4" />
              <span>Rename</span>
            </button>
            <button
              onClick={handleExport}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={handleImport}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>Import</span>
            </button>
            <hr className="my-1" />
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// src/components/LoadingIndicator.tsx
import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingIndicatorProps {
  message?: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ 
  message = 'Processing...' 
}) => {
  return (
    <div className="flex items-center justify-center space-x-2 p-4">
      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      <span className="text-sm text-gray-600">{message}</span>
    </div>
  );
};

// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex items-center justify-center h-64 bg-red-50 border border-red-200 rounded-lg">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-red-800 mb-2">
                Something went wrong
              </h2>
              <p className="text-sm text-red-600 mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: undefined })}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Try Again
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// Update src/app/layout.tsx to include ErrorBoundary
import './globals.css';
import { Providers } from './providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata = {
  title: 'Assistant UI - Next.js',
  description: 'Complete Assistant UI with streaming, attachments, and thread management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <Providers>
            {children}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}

// Update src/components/ThreadSidebar.tsx to include ThreadActions
import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { useExternalStore } from '@/hooks/useExternalStore';
import { externalStoreRuntime } from '@/lib/external-store';
import { ThreadActions } from './ThreadActions';

export const ThreadSidebar: React.FC = () => {
  const { threads, currentThreadId } = useExternalStore();

  const handleNewThread = () => {
    externalStoreRuntime.createThread();
  };

  const handleSelectThread = (threadId: string) => {
    externalStoreRuntime.setCurrentThread(threadId);
  };

  return (
    <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={handleNewThread}
          className="w-full flex items-center space-x-2 px-4 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>New Conversation</span>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className={`
                group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors
                ${currentThreadId === thread.id 
                  ? 'bg-blue-100 border-2 border-blue-500' 
                  : 'bg-white hover:bg-gray-50 border-2 border-transparent'
                }
              `}
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <MessageSquare className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">
                    {thread.title}
                  </div>
                  <div className="text-sm text-gray-500">
                    {thread.messages.length} messages
                  </div>
                </div>
              </div>
              
              <div onClick={(e) => e.stopPropagation()}>
                <ThreadActions 
                  threadId={thread.id} 
                  threadTitle={thread.title}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// README.md
# Assistant UI - Next.js TypeScript Project

A complete assistant UI implementation built with Next.js, TypeScript, and modern React patterns.

## Features

- **ExternalStoreRuntime**: Custom external store implementation using React's `useSyncExternalStore`
- **Streaming Responses**: Real-time message streaming with Server-Sent Events
- **AttachmentAdapter**: File upload and management system
- **Thread Management**: Create, edit, delete, import/export conversations
- **Redux Integration**: State management with Redux Toolkit
- **Axios API**: HTTP client for API communications
- **TypeScript**: Full type safety throughout the application

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Create a new Next.js project:
```bash
npx create-next-app@latest assistant-ui --typescript --tailwind --eslint --app
cd assistant-ui
```

2. Install dependencies:
```bash
npm install @reduxjs/toolkit react-redux axios uuid lucide-react
npm install --save-dev @types/uuid
```

3. Copy all the source files from this project into your Next.js project structure.

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── chat/          # Chat streaming endpoint
│   │   └── attachments/   # File upload endpoints
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   ├── page.tsx          # Home page
│   └── providers.tsx     # Redux provider
├── components/            # React components
│   ├── AssistantUI.tsx   # Main UI component
│   ├── MessageList.tsx   # Message display
│   ├── MessageBubble.tsx # Individual message
│   ├── MessageInput.tsx  # Message input form
│   ├── ThreadSidebar.tsx # Thread navigation
│   ├── ThreadActions.tsx # Thread operations
│   ├── LoadingIndicator.tsx
│   └── ErrorBoundary.tsx
├── hooks/                 # Custom hooks
│   └── useExternalStore.ts
├── lib/                   # Utilities and services
│   ├── external-store.ts  # External store runtime
│   ├── api.ts            # API client
│   ├── attachment-adapter.ts
│   ├── streaming-handler.ts
│   └── thread-manager.ts
├── store/                 # Redux store
│   ├── index.ts          # Store configuration
│   └── slices/
│       └── assistantSlice.ts
└── types/                 # TypeScript definitions
    └── index.ts
```

## Key Features Explained

### ExternalStoreRuntime

The external store provides a centralized state management solution outside of React's component tree:

```typescript
const externalStoreRuntime = new ExternalStoreRuntime();
const state = useExternalStore(); // Custom hook using useSyncExternalStore
```

### Streaming Responses

Server-Sent Events implementation for real-time message streaming:

```typescript
const stream = await AssistantAPI.sendMessage(content, threadId);
// Handles chunked responses and updates UI in real-time
```

### AttachmentAdapter

File upload and management system with drag-and-drop support:

```typescript
const attachment = await attachmentAdapter.addAttachment(file);
// Handles file upload, storage, and cleanup
```

### Thread Management

Complete conversation management with import/export functionality:

```typescript
ThreadManager.exportThread(threadId); // Export as JSON
ThreadManager.importThread(jsonData); // Import from JSON
```

## API Integration

The project uses Axios for HTTP requests and includes:

- RESTful API endpoints
- File upload handling  
- Error handling and retry logic
- Request/response interceptors

## Development

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

### Building for Production

```bash
npm run build
npm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.