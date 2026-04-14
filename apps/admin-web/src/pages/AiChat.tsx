import { useState, useRef, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Direct fetch to leverage SSE or stream if needed, 
      // currently backend returns direct JSON for simplicity.
      const res = await fetch('/v1/admin/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: userMessage, lang: 'vi' })
      });

      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      
      setMessages((prev) => [
        ...prev, 
        { role: 'assistant', content: typeof data.response === 'string' ? data.response : JSON.stringify(data.response) }
      ]);
      
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Error communicating with AI server.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col max-w-5xl mx-auto p-4 md:p-8">
      <div className="flex flex-col mb-6">
        <h1 className="text-3xl font-bold tracking-tight">AI Assistant</h1>
        <p className="text-muted-foreground">Connected to Core API + Gemini Flash + MCP Tool Server.</p>
      </div>
      
      <Card className="flex-1 flex flex-col overflow-hidden bg-card/40 backdrop-blur-md border-border shadow-xl">
        {/* Chat Log */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <Bot size={48} className="text-muted-foreground" />
              <p>Type a prompt to interact with Sensa Smart Home devices using natural language.</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-primary" />
                </div>
              )}
              
              <div className={`px-4 py-3 rounded-2xl max-w-[80%] whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                  : 'bg-muted/50 border border-border rounded-tl-sm'
              }`}>
                {msg.content}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User size={16} className="text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-4 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-primary" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-muted/50 border border-border flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground animate-pulse">Thinking & invoking MCP tools...</span>
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
              disabled={loading}
              autoComplete="off"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="absolute right-1.5 bottom-1.5 h-7 w-7 rounded-lg transition-transform active:scale-95" 
              disabled={!input.trim() || loading}
            >
              <Send size={14} />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
