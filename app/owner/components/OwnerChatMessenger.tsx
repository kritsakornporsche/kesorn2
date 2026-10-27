'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';

interface Conversation {
  id: number;
  guest_name: string;
  guest_role?: string;
  role_label?: string;
  dorm_name: string;
  last_message: string;
  updated_at: string;
  unread_count?: number;
}

interface Message {
  id: number;
  sender_id: number;
  message: string;
  image_url?: string | null;
  created_at: string;
}

function formatRelativeTime(dateStr: string) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาที`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชม.`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'เมื่อวานนี้';
  if (diffDay < 7) return `${diffDay} วัน`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function OwnerChatMessenger() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopFileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);

  // Listen to open event from top navbar button
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-owner-chat', handleOpen);
    return () => window.removeEventListener('open-owner-chat', handleOpen);
  }, []);

  // Poll for conversations
  const fetchConvs = async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setConversations(data.data);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!session) return;
    fetchConvs();
    const interval = setInterval(fetchConvs, 10000);
    return () => clearInterval(interval);
  }, [session]);

  // Poll for messages in active chat
  useEffect(() => {
    if (!activeConv || !isOpen) return;
    const fetchMsgs = async () => {
      try {
        const res = await fetch(`/api/chat/messages?convId=${activeConv.id}`);
        const data = await res.json();
        if (data.success) {
          setMessages(data.data);
          if (Number(activeConv.unread_count) > 0) {
            setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, unread_count: 0 } : c));
            window.dispatchEvent(new CustomEvent('chat-unread-updated'));
          }
        }
      } catch (e) { console.error(e); }
    };

    fetchMsgs();
    const interval = setInterval(fetchMsgs, 3000);
    return () => clearInterval(interval);
  }, [activeConv, isOpen]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (mobileScrollRef.current) {
      mobileScrollRef.current.scrollTop = mobileScrollRef.current.scrollHeight;
    }
  }, [messages, activeConv]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageError('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImageError('ขนาดรูปภาพต้องไม่เกิน 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedImage) || !activeConv || sending) return;

    const messageText = newMessage.trim();
    const imageToSend = selectedImage;
    setNewMessage('');
    setSelectedImage(null);
    setImageError(null);
    setSending(true);

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConv.id,
          message: messageText || (imageToSend ? '📷 รูปภาพ' : ''),
          image: imageToSend,
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, data.data]);
        fetchConvs();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const openConversation = (conv: Conversation) => {
    setActiveConv(conv);
    if (Number(conv.unread_count) > 0) {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      fetch('/api/chat/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conv.id })
      }).catch(console.error);
      window.dispatchEvent(new CustomEvent('chat-unread-updated'));
    }
  };

  const pathname = usePathname();
  const isOwner = (session?.user as any)?.role === 'owner' || (session?.user as any)?.primary_role === 'owner';
  if (!session || !isOwner || pathname === '/owner/chat') return null;

  const totalUnread = conversations.reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0);

  // Filtered conversations by search query
  const filteredConversations = conversations.filter(c => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.guest_name?.toLowerCase().includes(query) ||
      c.last_message?.toLowerCase().includes(query) ||
      c.dorm_name?.toLowerCase().includes(query)
    );
  });

  const dormTitle = conversations[0]?.dorm_name || 'SmartDom Messenger';

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. MOBILE FULL-SCREEN CHAT (Instagram DM Style - Visible on mobile only)  */}
      {/* ========================================================================= */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-background text-foreground flex flex-col md:hidden animate-in slide-in-from-bottom duration-300">
          
          {/* Top Bar / Navigation */}
          <div className="h-14 px-4 bg-card border-b border-border flex items-center justify-between shrink-0 shadow-sm">
            {activeConv ? (
              /* Active Chat Header */
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setActiveConv(null)}
                  className="p-1.5 -ml-1.5 hover:bg-secondary rounded-full transition-colors active:scale-95 text-foreground"
                  aria-label="กลับไปหน้ารายการข้อความ"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                  {activeConv.guest_name?.charAt(0) || 'G'}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-foreground truncate leading-tight">
                    {activeConv.guest_name}
                  </h3>
                  <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 leading-none mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>กำลังออนไลน์</span>
                  </p>
                </div>
              </div>
            ) : (
              /* Messages List Header (Instagram style dropdown username) */
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 -ml-1.5 hover:bg-secondary rounded-full transition-colors active:scale-95 text-foreground"
                  aria-label="ปิดกล่องข้อความ"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-1.5 cursor-pointer">
                  <h2 className="text-base font-black tracking-tight text-foreground">
                    {dormTitle}
                  </h2>
                  <span className="text-xs text-muted-foreground">▼</span>
                </div>
              </div>
            )}

            {/* Right Action Button */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (activeConv) {
                    // refresh current
                    fetch(`/api/chat/messages?convId=${activeConv.id}`)
                      .then(r => r.json())
                      .then(d => { if (d.success) setMessages(d.data); });
                  } else {
                    fetchConvs();
                  }
                }}
                className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground active:scale-95"
                title="รีเฟรชข้อความ"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground active:scale-95"
                title="ปิด"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex flex-col overflow-hidden bg-background">
            {!activeConv ? (
              /* Conversation List View (Instagram DM Style) */
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* 1. Meta / Search Bar */}
                <div className="px-4 pt-3 pb-2 shrink-0">
                  <div className="bg-secondary/70 border border-border/60 rounded-2xl px-3.5 py-2 flex items-center gap-2.5 focus-within:ring-2 focus-within:ring-primary/40 transition-all">
                    <svg className="w-4 h-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="ค้นหาผู้เช่า หรือข้อความ..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none outline-none text-xs font-medium text-foreground placeholder:text-muted-foreground w-full"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="text-muted-foreground text-xs p-1">
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Instagram Notes / Quick Avatars Stories Row */}
                <div className="px-4 py-2 border-b border-border/40 shrink-0">
                  <div className="flex items-center gap-4 overflow-x-auto no-scrollbar py-1">
                    {/* Owner Note / Dorm Status */}
                    <div className="flex flex-col items-center shrink-0 w-16 text-center group cursor-pointer">
                      <div className="relative mb-1">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-600 via-purple-500 to-indigo-600 p-0.5 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                          <div className="w-full h-full rounded-full bg-card flex items-center justify-center text-xl">
                            🏢
                          </div>
                        </div>
                        {/* Note speech bubble */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-card border border-border text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm text-primary whitespace-nowrap">
                          พร้อมดูแล ✨
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground truncate w-full">
                        หอพักคุณ
                      </span>
                    </div>

                    {/* Quick Contacts from recent conversations */}
                    {conversations.slice(0, 7).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setActiveConv(c)}
                        className="flex flex-col items-center shrink-0 w-16 text-center group cursor-pointer focus:outline-none"
                      >
                        <div className="relative mb-1">
                          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-purple-500 to-amber-500 p-0.5 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                            <div className="w-full h-full rounded-full bg-card flex items-center justify-center font-bold text-foreground text-base">
                              {c.guest_name.charAt(0)}
                            </div>
                          </div>
                          {/* Green online dot */}
                          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-2 ring-background" />
                        </div>
                        <span className="text-[10px] font-medium text-foreground truncate w-full">
                          {c.guest_name.split(' ')[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Section Title */}
                <div className="px-4 pt-3 pb-1 flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-black text-foreground tracking-tight">ข้อความ</h3>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    ทั้งหมด {filteredConversations.length} รายการ
                  </span>
                </div>

                {/* 4. Conversations List (Instagram DM Style) */}
                <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
                  {filteredConversations.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-center p-6">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3 text-xl">
                        💬
                      </div>
                      <p className="text-xs font-bold text-muted-foreground">ไม่พบข้อความการสนทนา</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">ข้อความใหม่จะแสดงขึ้นที่นี่อัตโนมัติ</p>
                    </div>
                  ) : (
                    filteredConversations.map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => openConversation(conv)}
                        className="w-full p-3 flex items-center gap-3.5 rounded-2xl hover:bg-secondary/70 transition-all text-left group active:bg-secondary"
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className="w-13 h-13 rounded-full bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-600 p-0.5 shadow-sm">
                            <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center font-bold text-foreground text-base">
                              {conv.guest_name.charAt(0)}
                            </div>
                          </div>
                          <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-2 ring-card" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h4 className={`text-sm truncate ${Number(conv.unread_count) > 0 ? 'font-black text-foreground' : 'font-bold text-foreground/90'}`}>
                                {conv.guest_name}
                              </h4>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                conv.guest_role === 'tenant'
                                  ? 'bg-primary/15 text-primary'
                                  : conv.guest_role === 'keeper'
                                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                {conv.role_label || (conv.guest_role === 'tenant' ? 'ลูกหอ' : (conv.guest_role === 'keeper' ? 'ผู้ดูแล' : 'แขก'))}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                              {formatRelativeTime(conv.updated_at)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className={`text-xs truncate leading-relaxed ${Number(conv.unread_count) > 0 ? 'text-foreground font-bold' : 'text-muted-foreground font-normal'}`}>
                              {conv.last_message || 'เริ่มการสนทนาใหม่...'}
                            </p>
                            {Number(conv.unread_count) > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 bg-purple-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                                {conv.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Active 1-on-1 Chat View (Fullscreen) */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Messages Feed */}
                <div ref={mobileScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 bg-background/50">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3 text-2xl">
                        💬
                      </div>
                      <p className="text-xs font-bold text-muted-foreground">ยังไม่มีข้อความ</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">ส่งข้อความทักทายลูกหอหรือแขกได้เลย</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = String(msg.sender_id) === String((session?.user as any)?.id);
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}>
                          <div className={`max-w-[78%] p-3.5 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${
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
                                  className="rounded-xl max-h-56 w-auto object-cover cursor-pointer hover:opacity-95 transition-all border border-white/10 shadow-sm"
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
                    })
                  )}
                </div>

                {/* Selected Image Preview before sending */}
                {selectedImage && (
                  <div className="px-3 py-2 bg-card border-t border-border flex items-center justify-between shrink-0">
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

                {imageError && (
                  <div className="px-3 py-1.5 bg-rose-500/10 border-t border-rose-500/20 text-rose-500 text-[11px] font-bold shrink-0">
                    ✕ {imageError}
                  </div>
                )}

                {/* Sticky Bottom Input Bar */}
                <div className="p-3 bg-card border-t border-border shrink-0 pb-safe">
                  <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={mobileFileInputRef}
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => mobileFileInputRef.current?.click()}
                      className="p-3 bg-muted hover:bg-muted/80 text-foreground rounded-full border border-border transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer text-base"
                      title="แนบรูปภาพ"
                    >
                      📷
                    </button>
                    <input
                      type="text"
                      placeholder={selectedImage ? "พิมพ์ข้อความเพิ่มเติม..." : "เขียนข้อความของคุณ..."}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 py-3 px-4 bg-muted/60 text-foreground placeholder:text-muted-foreground rounded-full border border-border focus:border-primary focus:bg-background outline-none text-xs font-medium transition-all shadow-inner"
                    />
                    <button
                      type="submit"
                      disabled={(!newMessage.trim() && !selectedImage) || sending}
                      className="p-3 bg-gradient-to-br from-purple-700 to-indigo-700 text-white rounded-full hover:scale-105 active:scale-95 transition-all shadow-md shadow-purple-600/25 disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:shadow-none cursor-pointer shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DESKTOP FLOATING MESSENGER (Visible on desktop screens only md:flex)   */}
      {/* ========================================================================= */}
      {isOpen && (
        <div className="hidden md:flex w-[390px] h-[580px] fixed bottom-28 right-8 z-[60] bg-card text-foreground rounded-[2rem] shadow-2xl border border-border flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 text-white flex items-center justify-between shrink-0 shadow-md">
            {activeConv ? (
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveConv(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div>
                  <h3 className="text-sm font-bold text-white">{activeConv.guest_name}</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">กำลังออนไลน์</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center text-white font-black text-xs border border-white/30 shadow-sm">
                  💬
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">SmartDom Messenger</h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-purple-200">ศูนย์จัดการแชท</p>
                </div>
              </div>
            )}
            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-hidden flex flex-col bg-background/50">
            {!activeConv ? (
              /* Conversation List */
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {conversations.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3 text-xl">
                      💬
                    </div>
                    <p className="text-xs font-bold text-muted-foreground">ยังไม่มีการทักทายจากแขก</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">ข้อความใหม่จะแสดงขึ้นที่นี่อัตโนมัติ</p>
                  </div>
                ) : (
                  conversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => openConversation(conv)}
                      className="w-full p-3.5 flex items-center gap-3.5 rounded-2xl hover:bg-muted/60 transition-all group text-left border border-transparent hover:border-border"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-purple-100 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 flex items-center justify-center font-bold text-primary text-base shadow-sm group-hover:scale-110 transition-transform shrink-0">
                        {conv.guest_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col min-w-0">
                            <h4 className={`text-sm truncate ${Number(conv.unread_count) > 0 ? 'font-black text-foreground' : 'font-bold text-foreground/90'}`}>{conv.guest_name}</h4>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full w-fit mt-1 border ${
                              conv.guest_role === 'tenant' 
                                ? 'bg-primary/15 text-primary border-primary/20' 
                                : conv.guest_role === 'keeper'
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20'
                                : 'bg-muted text-muted-foreground border-border'
                            }`}>
                              {conv.role_label || (conv.guest_role === 'tenant' ? 'ลูกหอ' : (conv.guest_role === 'keeper' ? 'ผู้ดูแล' : 'แขกที่สนใจ'))}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium shrink-0 ml-2">
                            {formatRelativeTime(conv.updated_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className={`text-xs truncate ${Number(conv.unread_count) > 0 ? 'text-foreground font-bold' : 'text-muted-foreground'}`}>{conv.last_message || 'รอการตอบกลับ...'}</p>
                          {Number(conv.unread_count) > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 bg-purple-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* Active Chat Messages */
              <>
                <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3">
                  {messages.map(msg => {
                    const isMe = String(msg.sender_id) === String((session?.user as any)?.id);
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}>
                        <div className={`max-w-[75%] p-3.5 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${
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

                {imageError && (
                  <div className="px-3.5 py-1.5 bg-rose-500/10 border-t border-rose-500/20 text-rose-500 text-[11px] font-bold shrink-0">
                    ✕ {imageError}
                  </div>
                )}

                {/* Footer Input */}
                <div className="p-3.5 bg-card border-t border-border">
                  <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                    <input
                      type="file"
                      ref={desktopFileInputRef}
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => desktopFileInputRef.current?.click()}
                      className="p-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-full border border-border transition-all active:scale-95 flex items-center justify-center shrink-0 cursor-pointer text-sm"
                      title="แนบรูปภาพ"
                    >
                      📷
                    </button>
                    <input
                      type="text"
                      placeholder={selectedImage ? "พิมพ์ข้อความเพิ่มเติม..." : "เขียนข้อความของคุณ..."}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="flex-1 py-2.5 px-4 bg-muted/60 text-foreground placeholder:text-muted-foreground rounded-full border border-border focus:border-primary focus:bg-background outline-none text-xs font-medium transition-all shadow-inner"
                    />
                    <button
                      type="submit"
                      disabled={(!newMessage.trim() && !selectedImage) || sending}
                      className="p-2.5 bg-gradient-to-br from-purple-700 to-indigo-700 text-white rounded-full hover:scale-105 active:scale-95 transition-all shadow-md shadow-purple-600/25 disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:shadow-none cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DESKTOP TRIGGER BUBBLE (Hidden on mobile, only appears on md:flex)    */}
      {/* ========================================================================= */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="SmartDom Messenger"
        className={`hidden md:flex fixed bottom-8 right-8 z-[60] w-16 h-16 rounded-[2rem] items-center justify-center transition-all shadow-2xl hover:scale-110 active:scale-95 ${
          isOpen 
            ? 'bg-gradient-to-br from-purple-700 to-indigo-700 text-white rotate-90 shadow-purple-700/30' 
            : 'bg-gradient-to-br from-purple-700 to-indigo-700 text-white shadow-purple-700/30'
        }`}
      >
        {isOpen ? (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <div className="relative">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            {totalUnread > 0 && (
              <>
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-purple-800 animate-ping" />
                <div className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 bg-amber-400 text-purple-950 font-black text-[10px] rounded-full flex items-center justify-center shadow-md border-2 border-purple-900">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </div>
              </>
            )}
          </div>
        )}
      </button>

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
    </>
  );
}
