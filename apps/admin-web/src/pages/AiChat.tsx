import { useState, useRef, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Send, Bot, User, Loader2, Wrench, Sparkles, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type StreamStatus = 'idle' | 'thinking' | 'tools' | 'streaming';

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [toolInfo, setToolInfo] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streamStatus !== 'idle') return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setStreamStatus('thinking');
    setStreamingText('');
    setToolInfo('');

    try {
      // Build history from existing messages (exclude the current user prompt)
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/v1/admin/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: userMessage,
          history,
          lang: 'vi',
        }),
      });

      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);

              switch (currentEvent) {
                case 'tool_start':
                  setStreamStatus('tools');
                  setToolInfo(`Calling ${data.tools?.length || 0} tool(s)...`);
                  break;
                case 'tool_call':
                  setToolInfo(`⚙️ ${data.name}`);
                  break;
                case 'tool_result':
                  setToolInfo(`✅ ${data.name}`);
                  break;
                case 'stream_start':
                  setStreamStatus('streaming');
                  setToolInfo('');
                  break;
                case 'delta':
                  accumulated += data.text || '';
                  setStreamingText(accumulated);
                  break;
                case 'done':
                  // Finalize
                  if (accumulated) {
                    setMessages((prev) => [...prev, { role: 'assistant', content: accumulated }]);
                    setStreamingText('');
                  }
                  break;
                case 'error':
                  setMessages((prev) => [
                    ...prev,
                    { role: 'assistant', content: `⚠️ Error: ${data.message}` },
                  ]);
                  break;
              }
            } catch {
              // Ignore invalid JSON
            }
          }
        }
      }

      // Edge case: if stream ends without 'done' event
      if (accumulated && streamStatus !== 'idle') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === accumulated) return prev;
          return [...prev, { role: 'assistant', content: accumulated }];
        });
        setStreamingText('');
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Error communicating with AI server.' },
      ]);
    } finally {
      setStreamStatus('idle');
      setToolInfo('');
    }
  };

  const clearChat = () => {
    setMessages([]);
    setStreamingText('');
  };

  const isLoading = streamStatus !== 'idle';

  return (
    <div className="flex h-full flex-col max-w-5xl mx-auto p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Assistant</h1>
          <p className="text-muted-foreground">
            Connected to Core API + Gemini Flash + MCP Tool Server.{' '}
            <span className="text-xs opacity-60">SSE Streaming</span>
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="text-muted-foreground gap-1">
            <Trash2 size={14} />
            Clear
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md border-border shadow-xl">
        {/* Chat Log */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && !streamingText && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <Bot size={48} className="text-muted-foreground" />
              <p>Type a prompt to interact with Sensa Smart Home devices using natural language.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-primary" />
                </div>
              )}

              <div
                className={`px-4 py-3 rounded-2xl max-w-[80%] whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted/50 border border-border rounded-tl-sm'
                }`}
              >
                {msg.content}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User size={16} className="text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Live streaming text */}
          {streamingText && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="px-4 py-3 rounded-2xl max-w-[80%] whitespace-pre-wrap bg-muted/50 border border-border rounded-tl-sm">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />
              </div>
            </div>
          )}

          {/* Status indicators */}
          {isLoading && !streamingText && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-muted/50 border border-border flex items-center gap-2">
                {streamStatus === 'tools' ? (
                  <>
                    <Wrench size={16} className="animate-spin text-amber-400" />
                    <span className="text-sm text-amber-400">{toolInfo || 'Executing tools...'}</span>
                  </>
                ) : (
                  <>
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground animate-pulse">
                      Thinking...
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/50 border-t border-border">
          <form onSubmit={sendMessage} className="relative flex items-end w-full gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="E.g. Turn off the living room lights..."
              className="flex-1 bg-muted/50 border-white/10 resize-none rounded-xl pr-12 focus-visible:ring-primary/50"
              disabled={isLoading}
              autoComplete="off"
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-1.5 bottom-1.5 h-7 w-7 rounded-lg transition-transform active:scale-95"
              disabled={!input.trim() || isLoading}
            >
              <Send size={14} />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
