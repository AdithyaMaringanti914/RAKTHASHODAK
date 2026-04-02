import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

interface ChatSheetProps {
  requestId: string;
  open: boolean;
  onClose: () => void;
}

const ChatSheet = ({ requestId, open, onClose }: ChatSheetProps) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch initial messages
  useEffect(() => {
    if (!open || !requestId) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });
      setMessages((data as ChatMessage[]) ?? []);
    };

    fetchMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`chat-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `request_id=eq.${requestId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, requestId]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !user || sending) return;
    setSending(true);

    const newMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender_id: user.id,
      message: text.trim(),
      created_at: new Date().toISOString(),
    };

    // Optimistically add to UI immediately to bypass websocket delays/missing publication flags
    setMessages((prev) => [...prev, newMsg]);
    setText("");

    const { error } = await supabase.from("chat_messages").insert({
      id: newMsg.id,
      request_id: requestId,
      sender_id: user.id,
      message: text.trim(),
      created_at: newMsg.created_at,
    });

    if (error) {
      toast.error("Failed to send message: " + error.message);
      console.error("Chat insert error:", error);
      // Revert optimistic update
      setMessages((prev) => prev.filter((m) => m.id !== newMsg.id));
    }

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="fixed inset-0 z-[2000] flex flex-col bg-background max-w-lg mx-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-12 pb-3 border-b border-border">
          <div>
            <p className="text-label mb-0.5">Coordination</p>
            <h2 className="text-lg font-bold text-foreground">Chat</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-secondary rounded-full flex items-center justify-center"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-secondary text-foreground rounded-bl-md"
                  }`}
                >
                  <p className="text-sm">{msg.message}</p>
                  <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="px-4 pb-6 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              className="flex-1 h-11 bg-secondary rounded-2xl px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="w-11 h-11 bg-primary rounded-full flex items-center justify-center disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
              ) : (
                <Send className="w-4 h-4 text-primary-foreground" />
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ChatSheet;
