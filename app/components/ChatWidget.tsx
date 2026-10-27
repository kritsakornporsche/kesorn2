'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

interface Message {
  id: number;
  sender_id: number;
  message: string;
  image_url?: string | null;
  created_at: string;
}

interface ChatWidgetProps {
  dormId?: number;
  ownerName?: string;
  initialConversationId?: number;
}

export default function ChatWidget({ dormId: dormIdProp, ownerName, initialConversationId }: ChatWidgetProps) {
  // commit 28a: one dorm in this system — the home page widget had no dormId, so the chat opened without a conversation
  // and a typed message was never sent. Opening the chat now always makes sure there is a conversation, sending starts
  // one if needed, and a failure is shown in the window (never dropped silently).
  const dormId = dormIdProp || 1;
  const { data: session, status: sessionStatus } = useSession();
  const [chatError, setChatError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(initialConversationId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && conversationId) {
      fetchMessages();
      const interval = setInterval(fetchMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [isOpen, conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    if (!conversationId) return;
    try {
      const res = await fetch(`/api/chat/messages?convId=${conversationId}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.data);
      }
    } catch (e) {
      console.error('Fetch messages error:', e);
    }
  };

  /** The conversation with the dorm (created once); null with the reason shown when it cannot be started. */
  const startConversation = async (): Promise<number | null> => {
    setLoading(true);
    setChatError(null);
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dormId })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success && data.data?.id) {
        setConversationId(data.data.id);
        setIsOpen(true);
        return Number(data.data.id);
      }
      setChatError(res.status === 401 ? 'กรุณาเข้าสู่ระบบเพื่อแชต' : data.message || 'เริ่มการสนทนาไม่สำเร็จ กรุณาลองใหม่');
      setIsOpen(true);
    } catch (e) {
      console.error('Start conversation error:', e);
      setChatError('เชื่อมต่อแชตไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่');
      setIsOpen(true);
    } finally {
      setLoading(false);
    }
    return null;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setChatError('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setChatError('ขนาดรูปภาพต้องไม่เกิน 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedImage) || sending) return;
    setChatError(null);
    const id = conversationId || (await startConversation());
    if (!id) return;

    const messageText = newMessage.trim();
    const imageToSend = selectedImage;
    setNewMessage('');
    setSelectedImage(null);
    setSending(true);

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: id,
          message: messageText || (imageToSend ? '📷 รูปภาพ' : ''),
          image: imageToSend,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setMessages((list) => [...list, data.data]);
      } else {
        setChatError(res.status === 401 ? 'กรุณาเข้าสู่ระบบเพื่อแชต' : data.message || 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่');
      }
    } catch (e) {
      console.error('Send message error:', e);
      setChatError('ส่งข้อความไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่');
    } finally {
      setSending(false);
    }
  };

  /** Open the window: not signed in → the window says "เข้าสู่ระบบเพื่อแชต"; signed in → with the conversation. */
  const openChat = () => {
    if (sessionStatus === 'loading') return;
    setIsOpen(true);
    if (session && !conversationId) startConversation();
  };

  useEffect(() => {
    // every "open chat" (any page) opens the window with the dorm's conversation
    const handleOpenChat = () => openChat();
    window.addEventListener('open-chat', handleOpenChat);
    return () => window.removeEventListener('open-chat', handleOpenChat);
  }, [session, sessionStatus, dormId, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 font-sans">
      {!isOpen ? (
        <button
          id="open-chat-widget-btn"
          onClick={openChat}
          disabled={loading}
          aria-label="ติดต่อหอพัก"
          className="w-16 h-16 rounded-[2rem] bg-gradient-to-br from-purple-700 to-indigo-700 text-white shadow-2xl shadow-purple-700/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
        >
          <svg className="w-8 h-8 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {loading && <div className="absolute inset-0 bg-white/20 animate-pulse rounded-[2rem]" />}
        </button>
      ) : (
        <div className="w-[360px] sm:w-96 h-[520px] bg-card text-foreground rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-border animate-in slide-in-from-bottom-8 duration-300">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 text-white flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse" />
              <div>
                <p className="text-xs font-bold tracking-tight text-white">
                  {ownerName ? `แชทกับ ${ownerName}` : 'แชทกับเจ้าหน้าที่หอพัก'}
                </p>
                <p className="text-[10px] font-medium text-purple-200">สอบถามรายละเอียดห้องพัก</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="p-1 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 p-5 overflow-y-auto space-y-3 bg-background/50">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 text-xl">
                  💬
                </div>
                <p className="text-xs font-bold text-foreground">เริ่มการสนทนา</p>
                <p className="text-[11px] text-muted-foreground mt-1">สอบถามข้อมูลเพิ่มเติมกับเจ้าหน้าที่ได้เลย</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = String(msg.sender_id) === String((session?.user as any)?.id);
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}>
                  <div className={`max-w-[80%] p-3.5 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${
                    isMe 
                      ? 'bg-gradient-to-br from-purple-700 via-purple-600 to-indigo-600 text-white rounded-tr-none shadow-md shadow-purple-600/15' 
                      : 'bg-card border border-border text-foreground rounded-tl-none shadow-sm'
                  }`}>
                    {msg.image_url && (
                      <div className="mb-2">
                        <img
                          src={msg.image_url}
                          alt="รูปภาพแชท"
                          onClick={() => setPreviewModalUrl(msg.image_url!)}
                          className="rounded-xl max-h-52 w-auto object-cover cursor-pointer hover:opacity-95 transition-all border border-white/10 shadow-sm"
                        />
                      </div>
                    )}
                    {msg.message && (!msg.image_url || msg.message !== '📷 รูปภาพ') && (
                      <p className="break-words whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                    )}
                    <div className={`text-[9px] mt-1.5 font-medium flex items-center ${
                      isMe ? 'justify-end text-purple-200' : 'justify-start text-muted-foreground'
                    }`}>
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Image Preview before sending */}
          {selectedImage && (
            <div className="px-3.5 py-2 bg-card border-t border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <img
                    src={selectedImage}
                    alt="พรีวิวรูปภาพ"
                    className="w-12 h-12 object-cover rounded-xl border border-primary shadow-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold hover:bg-red-700 shadow"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[11px] font-bold text-foreground">แนบรูปภาพพร้อมส่ง</p>
              </div>
            </div>
          )}

          {chatError && (
            <p role="alert" className="px-4 py-2 text-[11px] font-bold text-rose-500 bg-rose-500/10 border-t border-rose-500/20 shrink-0">✕ {chatError}</p>
          )}

          {/* Input — signed-in users only; a visitor gets a link to sign in instead of a box that cannot send */}
          {!session ? (
            <div className="p-4 bg-card border-t border-border shrink-0 text-center">
              <a
                href={`/signin?callbackUrl=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/')}`}
                className="inline-block px-5 py-2.5 rounded-full bg-gradient-to-br from-purple-700 to-indigo-700 text-white text-xs font-bold"
              >
                เข้าสู่ระบบเพื่อแชต
              </a>
            </div>
          ) : (
          <form onSubmit={sendMessage} className="p-3 bg-card border-t border-border shrink-0">
            <div className="relative flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-full border border-border transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer text-sm"
                title="แนบรูปภาพ"
              >
                📷
              </button>
              <input
                type="text"
                placeholder={selectedImage ? "พิมพ์ข้อความเพิ่มเติม..." : "พิมพ์ข้อความ..."}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 py-2.5 pl-4 pr-12 bg-muted/60 text-foreground placeholder:text-muted-foreground rounded-full border border-border focus:border-primary focus:bg-background outline-none text-xs font-medium transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={(!newMessage.trim() && !selectedImage) || sending}
                className="absolute right-1 top-1 bottom-1 aspect-square bg-gradient-to-br from-purple-700 to-indigo-700 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shadow-purple-600/25 disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:shadow-none cursor-pointer"
              >
                <svg className="w-4 h-4 rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </div>
          </form>
          )}
        </div>
      )}

      {/* Lightbox / Image Preview Modal */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in cursor-pointer"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewModalUrl(null)}
              className="absolute -top-12 right-0 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-lg font-bold transition-colors cursor-pointer"
              aria-label="ปิดภาพขยาย"
            >
              ✕
            </button>
            <img
              src={previewModalUrl}
              alt="ภาพขยาย"
              className="max-h-[85vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}
