import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { configureStore, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { Provider, useSelector, useDispatch } from 'react-redux';
import axios from 'axios';

// --- Types ---
interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
}

interface Thread {
  id: string;
  title: string;
  createdAt: number;
}

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  url?: string; // For uploaded files
  status: 'uploading' | 'uploaded' | 'failed';
}

interface AssistantState {
  threads: Thread[];
  currentThreadId: string | null;
  messages: { [threadId: string]: Message[] };
  attachments: { [messageId: string]: Attachment[] };
  status: 'idle' | 'loading' | 'streaming' | 'succeeded' | 'failed';
  error: string | null;
}

// --- Redux Toolkit Slice ---
const initialState: AssistantState = {
  threads: [],
  currentThreadId: null,
  messages: {},
  attachments: {},
  status: 'idle',
  error: null,
};

const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    addThread: (state, action: PayloadAction<Thread>) => {
      state.threads.push(action.payload);
      if (!state.currentThreadId) {
        state.currentThreadId = action.payload.id;
      }
    },
    setCurrentThread: (state, action: PayloadAction<string>) => {
      state.currentThreadId = action.payload;
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      const { threadId, id: messageId } = action.payload;
      if (!state.messages[threadId]) {
        state.messages[threadId] = [];
      }
      state.messages[threadId].push(action.payload);
      state.status = 'succeeded'; // Message added, operation succeeded
      state.error = null;
    },
    updateStreamingMessage: (state, action: PayloadAction<{ threadId: string; messageId: string; content: string }>) => {
      const { threadId, messageId, content } = action.payload;
      if (state.messages[threadId]) {
        const messageIndex = state.messages[threadId].findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          state.messages[threadId][messageIndex].content = content;
        }
      }
    },
    addAttachment: (state, action: PayloadAction<{ messageId: string; attachment: Attachment }>) => {
      const { messageId, attachment } = action.payload;
      if (!state.attachments[messageId]) {
        state.attachments[messageId] = [];
      }
      state.attachments[messageId].push(attachment);
    },
    updateAttachmentStatus: (state, action: PayloadAction<{ messageId: string; attachmentId: string; status: 'uploaded' | 'failed'; url?: string }>) => {
      const { messageId, attachmentId, status, url } = action.payload;
      if (state.attachments[messageId]) {
        const attachmentIndex = state.attachments[messageId].findIndex(att => att.id === attachmentId);
        if (attachmentIndex !== -1) {
          state.attachments[messageId][attachmentIndex].status = status;
          if (url) {
            state.attachments[messageId][attachmentIndex].url = url;
          }
        }
      }
    },
    setStatus: (state, action: PayloadAction<AssistantState['status']>) => {
      state.status = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.status = 'failed';
    },
    clearMessages: (state, action: PayloadAction<string>) => {
      const threadId = action.payload;
      state.messages[threadId] = [];
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendMessage.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to send message';
      })
      .addCase(fetchThreadMessages.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchThreadMessages.fulfilled, (state, action) => {
        const { threadId, messages } = action.payload;
        state.messages[threadId] = messages;
        state.status = 'succeeded';
      })
      .addCase(fetchThreadMessages.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message || 'Failed to load messages';
      });
  },
});

export const {
  addThread,
  setCurrentThread,
  addMessage,
  updateStreamingMessage,
  addAttachment,
  updateAttachmentStatus,
  setStatus,
  setError,
  clearMessages
} = assistantSlice.actions;

// --- Redux Store ---
const store = configureStore({
  reducer: {
    assistant: assistantSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// --- API Service (Mocked) ---
// In a real application, this would interact with your backend.
// For streaming, we use `fetch` as it's better suited for ReadableStream.
// For other operations, we demonstrate using `axios`.

const API_DELAY = 500; // Simulate network latency

const assistantService = {
  // Use Axios for non-streaming calls
  createThread: async (title: string): Promise<Thread> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const newThread: Thread = {
          id: `thread-${Date.now()}`,
          title: title,
          createdAt: Date.now(),
        };
        console.log('API: Created thread', newThread);
        resolve(newThread);
      }, API_DELAY);
    });
  },

  fetchMessages: async (threadId: string): Promise<Message[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Mock existing messages for a thread
        const mockMessages: Message[] = [
          { id: 'msg-1', threadId, role: 'assistant', content: 'Hello! How can I help you today?', timestamp: Date.now() - 60000 },
          { id: 'msg-2', threadId, role: 'user', content: 'I need some information about your products.', timestamp: Date.now() - 50000 },
        ];
        console.log(`API: Fetched messages for ${threadId}`, mockMessages);
        resolve(mockMessages);
      }, API_DELAY);
    });
  },

  uploadAttachment: async (file: File): Promise<Attachment> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) { // 90% chance of success
          const newAttachment: Attachment = {
            id: `att-${Date.now()}`,
            fileName: file.name,
            fileType: file.type,
            url: URL.createObjectURL(file), // Mock URL
            status: 'uploaded',
          };
          console.log('API: Uploaded attachment', newAttachment);
          resolve(newAttachment);
        } else {
          console.error('API: Attachment upload failed');
          reject(new Error('Upload failed'));
        }
      }, API_DELAY * 2); // Longer delay for uploads
    });
  },

  // Use `fetch` for streaming responses, simulating Server-Sent Events (SSE) or chunked HTTP
  streamAssistantResponse: async (threadId: string, messageContent: string, userMessageId: string, attachmentDetails?: Attachment[]): Promise<void> => {
    let mockResponseContent = `Sure, I can help you with that. Let me gather some information based on your query: "${messageContent}".`;
    if (attachmentDetails && attachmentDetails.length > 0) {
      const attachmentNames = attachmentDetails.map(a => a.fileName).join(', ');
      // Example of adding context from attachments to the response
      mockResponseContent += ` I also see you've provided the following files: ${attachmentNames}.`;
    }

    // Simulate streaming by splitting the content into chunks
    const chunks = mockResponseContent.split(' ').map(word => word + ' ');
    const assistantMessageId = `msg-${Date.now()}-ai`;

    // Immediately add the initial assistant message to the state
    store.dispatch(addMessage({
      id: assistantMessageId,
      threadId,
      role: 'assistant',
      content: '', // Start with empty content, will be updated by stream
      timestamp: Date.now(),
    }));
    store.dispatch(setStatus('streaming'));

    let currentContent = '';
    for (let i = 0; i < chunks.length; i++) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 50)); // Simulate chunk delay
      currentContent += chunks[i];
      // Update the message content in the Redux store
      store.dispatch(updateStreamingMessage({
        threadId,
        messageId: assistantMessageId,
        content: currentContent,
      }));
    }
    store.dispatch(setStatus('succeeded'));
    console.log('API: Streaming response complete');
  },
};

// --- Redux Async Thunks ---
export const sendMessage = createAsyncThunk(
  'assistant/sendMessage',
  async ({ threadId, content, attachments }: { threadId: string; content: string; attachments?: File[] }, { dispatch }) => {
    // 1. Add user message
    const userMessageId = `msg-${Date.now()}-user`;
    const userMessage: Message = {
      id: userMessageId,
      threadId,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    dispatch(addMessage(userMessage));

    let uploadedAttachments: Attachment[] = [];
    if (attachments && attachments.length > 0) {
      // 2. Handle attachments
      for (const file of attachments) {
        const tempAttachmentId = `temp-att-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        dispatch(addAttachment({
          messageId: userMessageId,
          attachment: {
            id: tempAttachmentId,
            fileName: file.name,
            fileType: file.type,
            status: 'uploading',
          },
        }));

        try {
          const uploaded = await assistantService.uploadAttachment(file);
          dispatch(updateAttachmentStatus({
            messageId: userMessageId,
            attachmentId: tempAttachmentId,
            status: 'uploaded',
            url: uploaded.url,
          }));
          uploadedAttachments.push(uploaded);
        } catch (error) {
          dispatch(updateAttachmentStatus({
            messageId: userMessageId,
            attachmentId: tempAttachmentId,
            status: 'failed',
          }));
          console.error('Failed to upload attachment:', file.name, error);
          dispatch(setError(`Failed to upload ${file.name}`));
        }
      }
    }

    // 3. Trigger streaming assistant response
    await assistantService.streamAssistantResponse(threadId, content, userMessageId, uploadedAttachments);
  }
);

export const fetchThreadMessages = createAsyncThunk(
  'assistant/fetchThreadMessages',
  async (threadId: string) => {
    const messages = await assistantService.fetchMessages(threadId);
    return { threadId, messages };
  }
);

export const createNewThread = createAsyncThunk(
  'assistant/createNewThread',
  async (title: string, { dispatch }) => {
    const newThread = await assistantService.createThread(title);
    dispatch(addThread(newThread));
    dispatch(setCurrentThread(newThread.id));
    dispatch(clearMessages(newThread.id)); // Clear messages for new thread
    return newThread;
  }
);

// --- Context for ExternalStoreRuntime (Conceptual) ---
// In a real "ExternalStoreRuntime", this might be a more complex
// registration/deregistration mechanism. Here, we simulate it by providing
// a context that makes the Redux store available.

interface ExternalStoreContextType {
  dispatch: AppDispatch;
  getState: () => RootState;
  subscribe: (listener: () => void) => () => void;
}

const ExternalStoreContext = createContext<ExternalStoreContextType | undefined>(undefined);

const ExternalStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const storeRef = useRef(store);

  const contextValue = useRef<ExternalStoreContextType>({
    dispatch: storeRef.current.dispatch,
    getState: storeRef.current.getState,
    subscribe: (listener: () => void) => storeRef.current.subscribe(listener),
  });

  return (
    <ExternalStoreContext.Provider value={contextValue.current}>
      {children}
    </ExternalStoreContext.Provider>
  );
};

// Custom hook to consume the external store concept
function useExternalStoreRuntime() {
  const context = useContext(ExternalStoreContext);
  if (context === undefined) {
    throw new Error('useExternalStoreRuntime must be used within an ExternalStoreProvider');
  }
  return context;
}

// --- Components ---

// MessageBubble Component
const MessageBubble: React.FC<{ message: Message; attachments: Attachment[] }> = ({ message, attachments }) => (
  <div
    className={`flex mb-4 ${
      message.role === 'user' ? 'justify-end' : 'justify-start'
    }`}
  >
    <div
      className={`max-w-xl p-3 rounded-xl shadow-md text-gray-800 ${
        message.role === 'user'
          ? 'bg-blue-200 rounded-br-none'
          : 'bg-gray-200 rounded-bl-none'
      }`}
    >
      <p className="text-sm leading-relaxed">{message.content}</p>
      {attachments.length > 0 && (
        <div className="mt-2 text-xs text-gray-600">
          <strong>Attachments:</strong>
          <ul className="list-disc list-inside">
            {attachments.map((att) => (
              <li key={att.id}>
                {att.fileName} ({att.status})
                {att.url && att.status === 'uploaded' && (
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-500 hover:underline">
                    View
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-right text-xs text-gray-500 mt-1">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  </div>
);

// AttachmentUpload Component
const AttachmentUpload: React.FC<{ onFilesSelected: (files: File[]) => void }> = ({ onFilesSelected }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = ''; // Clear the input
    }
  };

  return (
    <div className="relative inline-block mr-2">
      <input
        type="file"
        multiple
        onChange={handleFileChange}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
      <button
        type="button"
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        onClick={() => { /* This click handler is just for styling/focus; input click is handled by actual input */ }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
        </svg>
        Attach
      </button>
    </div>
  );
};

// MessageInput Component
const MessageInput: React.FC<{ currentThreadId: string; status: AssistantState['status'] }> = ({ currentThreadId, status }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const dispatch: AppDispatch = useDispatch();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() && currentThreadId && status !== 'loading' && status !== 'streaming') {
      dispatch(sendMessage({ threadId: currentThreadId, content: inputMessage, attachments: selectedFiles }));
      setInputMessage('');
      setSelectedFiles([]);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (fileName: string) => {
    setSelectedFiles(prev => prev.filter(file => file.name !== fileName));
  };

  const isLoading = status === 'loading' || status === 'streaming';

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-gray-50 border-t border-gray-200">
      {selectedFiles.length > 0 && (
        <div className="mb-2">
          <span className="font-semibold text-sm text-gray-700">Selected Files:</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {selectedFiles.map((file, index) => (
              <span key={index} className="flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs">
                {file.name}
                <button
                  type="button"
                  onClick={() => removeFile(file.name)}
                  className="ml-2 text-blue-600 hover:text-blue-900 focus:outline-none"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center">
        <AttachmentUpload onFilesSelected={handleFilesSelected} />
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mr-2 shadow-sm"
          disabled={!currentThreadId || isLoading}
        />
        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!currentThreadId || isLoading || (!inputMessage.trim() && selectedFiles.length === 0)}
        >
          {isLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending...
            </span>
          ) : 'Send'}
        </button>
      </div>
    </form>
  );
};

// ThreadSelector Component
const ThreadSelector: React.FC<{ threads: Thread[]; currentThreadId: string | null; onSelectThread: (id: string) => void; onCreateNewThread: (title: string) => void }> = ({
  threads,
  currentThreadId,
  onSelectThread,
  onCreateNewThread,
}) => {
  const [newThreadTitle, setNewThreadTitle] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newThreadTitle.trim()) {
      onCreateNewThread(newThreadTitle.trim());
      setNewThreadTitle('');
    }
  };

  return (
    <div className="p-4 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Threads</h2>
      <form onSubmit={handleCreate} className="mb-4">
        <input
          type="text"
          value={newThreadTitle}
          onChange={(e) => setNewThreadTitle(e.target.value)}
          placeholder="New thread title"
          className="w-full p-2 border border-gray-300 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
        <button
          type="submit"
          className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 shadow-md"
        >
          Create New Thread
        </button>
      </form>
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="text-gray-500 text-sm">No threads yet. Create one!</p>
        ) : (
          <ul>
            {threads.map((thread) => (
              <li key={thread.id} className="mb-2">
                <button
                  onClick={() => onSelectThread(thread.id)}
                  className={`block w-full text-left p-3 rounded-md transition duration-200 ease-in-out ${
                    currentThreadId === thread.id
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'bg-white text-gray-700 hover:bg-gray-100 shadow-sm'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                >
                  <span className="font-medium text-base truncate block">{thread.title}</span>
                  <span className="text-xs opacity-80 mt-1 block">
                    {new Date(thread.createdAt).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ChatWindow Component
const ChatWindow: React.FC<{ currentThreadId: string | null; messages: Message[]; attachments: { [messageId: string]: Attachment[] }; status: AssistantState['status']; error: string | null }> = ({
  currentThreadId,
  messages,
  attachments,
  status,
  error,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, status]); // Scroll whenever messages update or status changes (e.g., streaming)

  if (!currentThreadId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-xl">
        Select a thread or create a new one to start chatting.
      </div>
    );
  }

  const currentThreadMessages = messages || [];

  return (
    <div className="flex-1 flex flex-col bg-white rounded-lg shadow-md overflow-hidden">
      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {currentThreadMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 italic">
            Start a conversation...
          </div>
        ) : (
          currentThreadMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              attachments={attachments[message.id] || []}
            />
          ))
        )}
        {status === 'streaming' && (
          <div className="flex justify-start mb-4">
            <div className="max-w-xl p-3 rounded-xl shadow-md bg-gray-200 rounded-bl-none">
              <div className="flex items-center">
                <span className="dot-pulse"></span>
                <span className="ml-2 text-sm text-gray-600">Assistant is typing...</span>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="text-red-600 p-2 border border-red-300 bg-red-50 rounded-md mb-4">
            Error: {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <MessageInput currentThreadId={currentThreadId} status={status} />
    </div>
  );
};

// --- Main App Component ---
const App: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const { threads, currentThreadId, messages, attachments, status, error } = useSelector((state: RootState) => state.assistant);

  // Initialize with a default thread if none exists
  useEffect(() => {
    if (threads.length === 0 && !currentThreadId) {
      dispatch(createNewThread('My First Conversation'));
    }
  }, [threads, currentThreadId, dispatch]);

  useEffect(() => {
    if (currentThreadId) {
      dispatch(fetchThreadMessages(currentThreadId));
    }
  }, [currentThreadId, dispatch]);

  const handleSelectThread = useCallback((threadId: string) => {
    dispatch(setCurrentThread(threadId));
  }, [dispatch]);

  const handleCreateNewThread = useCallback((title: string) => {
    dispatch(createNewThread(title));
  }, [dispatch]);

  return (
    // Tailwind CSS setup for the app container
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-sans text-gray-900 antialiased flex items-center justify-center p-4">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        /* Dot pulse for typing indicator */
        .dot-pulse {
          position: relative;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: #60a5fa; /* blue-400 */
          color: #60a5fa;
          animation: dotPulse 1.5s infinite ease-in-out;
        }
        .dot-pulse::before, .dot-pulse::after {
          content: '';
          position: absolute;
          display: inline-block;
          height: 10px;
          width: 10px;
          border-radius: 50%;
          background-color: #60a5fa;
          animation: dotPulse 1.5s infinite ease-in-out;
        }
        .dot-pulse::before {
          left: -15px;
          animation-delay: 0.2s;
        }
        .dot-pulse::after {
          right: -15px;
          animation-delay: 0.4s;
        }

        @keyframes dotPulse {
          0% {
            transform: scale(0.8);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.2);
            opacity: 1;
          }
          100% {
            transform: scale(0.8);
            opacity: 0.7;
          }
        }
      `}</style>
      <div className="flex w-full max-w-6xl h-[90vh] bg-white rounded-2xl shadow-xl overflow-hidden">
        <ThreadSelector
          threads={threads}
          currentThreadId={currentThreadId}
          onSelectThread={handleSelectThread}
          onCreateNewThread={handleCreateNewThread}
        />
        <ChatWindow
          currentThreadId={currentThreadId}
          messages={currentThreadId ? messages[currentThreadId] || [] : []}
          attachments={attachments}
          status={status}
          error={error}
        />
      </div>
    </div>
  );
};

// Wrap the main App component with Redux Provider and ExternalStoreProvider
const Root: React.FC = () => (
  <Provider store={store}>
    <ExternalStoreProvider>
      <App />
    </ExternalStoreProvider>
  </Provider>
);

export default Root;