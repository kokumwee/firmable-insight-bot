import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Evidence {
  snippet: string;
  source?: string; // Legacy field
  source_url?: string;
  page_type?: string;
  offset?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  citations?: Evidence[];
  guardrail?: string;
}

interface ChatSectionProps {
  currentUrl: string;
  onAsk: (query: string) => Promise<{ answer: string; citations: Evidence[]; guardrail: string }>;
}

export const ChatSection = ({ currentUrl, onAsk }: ChatSectionProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Auto-focus on chat input when component mounts
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await onAsk(input.trim());
      
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.answer,
        citations: response.citations,
        guardrail: response.guardrail,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to get a response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto mt-8 shadow-card animate-fade-in">
      <div className="p-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Ask Anything About This Company
        </h3>

        <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Ask any question about the company based on their homepage.
            </p>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className="space-y-2">
                <div className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex gap-2 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary"
                    }`}>
                      {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`rounded-lg px-4 py-2 ${
                      msg.role === "user" 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-secondary text-secondary-foreground"
                    }`}>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  </div>
                </div>

                {msg.role === "assistant" && msg.citations && msg.citations.length > 0 && (
                  <div className="ml-12 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Citations:</p>
                    {msg.citations.map((citation, citIdx) => (
                      <div key={citIdx} className="space-y-1">
                        <p className="text-xs text-muted-foreground italic border-l-2 border-primary pl-2">
                          "{citation.snippet}"
                        </p>
                        {(citation.source_url || citation.page_type) && (
                          <div className="ml-2 flex items-center gap-2 text-xs text-muted-foreground/70">
                            {citation.source_url && (
                              <a
                                href={citation.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary transition-colors flex items-center gap-1"
                              >
                                <span>{new URL(citation.source_url).pathname}</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                            {citation.page_type && (
                              <>
                                <span>•</span>
                                <span className="capitalize">{citation.page_type}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {msg.role === "assistant" && msg.guardrail === "not_found" && (
                  <div className="ml-12">
                    <p className="text-xs text-warning">
                      ⚠️ No matching information found on the homepage.
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
};
