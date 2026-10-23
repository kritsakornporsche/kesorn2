'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SYSTEM_UPDATES } from '@/lib/updatesData';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
  action_url: string;
}

export default function NotificationsPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'updates'>('notifications');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data);
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async () => {
    try {
      const res = await fetch('/api/notifications', { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        setUnreadCount(0);
        setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = (actionUrl: string | null) => {
    setIsOpen(false);
    if (actionUrl) {
      router.push(actionUrl);
    }
  };

  const latestUpdates = SYSTEM_UPDATES.slice(0, 3);

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="relative p-2 text-foreground/80 hover:bg-secondary hover:text-foreground rounded-xl transition-colors focus:outline-none cursor-pointer"
        title="การแจ้งเตือนและอัปเดตระบบ"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse"></span>
        )}
      </button>

      {/* Popover Dropdown (Full-screen on Mobile, Floating Dropdown on Desktop) */}
      {isOpen && (
        <>
          {/* Mobile Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-0 sm:inset-auto sm:absolute sm:right-0 sm:mt-2 w-full sm:w-96 h-[100dvh] sm:h-auto sm:max-h-[580px] bg-card text-card-foreground border-0 sm:border sm:border-border sm:rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col transform opacity-100 scale-100 transition-all origin-top-right">
            
            {/* Mobile-only Header Bar with Close Button */}
            <div className="flex sm:hidden items-center justify-between px-4 py-3 border-b border-border bg-secondary/80 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">🔔</span>
                <span className="text-sm font-black text-foreground">การแจ้งเตือนและข่าวสาร</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm font-bold cursor-pointer"
                aria-label="ปิด"
              >
                ✕
              </button>
            </div>
            
            {/* Tabs Navigation Header */}
            <div className="bg-secondary/50 p-2 border-b border-border flex items-center gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <span>🔔 การแจ้งเตือน</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full font-black">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('updates')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'updates'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <span>🚀 อัปเดตระบบ</span>
              <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500 text-white rounded-full font-black uppercase">
                NEW
              </span>
            </button>
          </div>

          {/* Tab 1: Notifications */}
          {activeTab === 'notifications' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-secondary/20 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">รายการแจ้งเตือนส่วนตัว</span>
                {unreadCount > 0 && (
                  <button 
                    onClick={handleMarkAsRead}
                    className="text-xs text-primary hover:underline font-bold cursor-pointer"
                  >
                    ทำเครื่องหมายอ่านแล้ว
                  </button>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto sm:max-h-[380px]">
                {loading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">กำลังโหลด...</div>
                ) : notifications.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center">
                    <span className="text-4xl mb-3 opacity-50">📭</span>
                    <p className="text-muted-foreground text-sm font-bold">ไม่มีการแจ้งเตือน</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {notifications.map((n) => (
                      <div 
                        key={n.id} 
                        onClick={() => handleNotificationClick(n.action_url)}
                        className={`p-4 hover:bg-secondary/50 transition-colors cursor-pointer flex gap-4 ${n.is_read ? 'opacity-70' : 'bg-primary/5'}`}
                      >
                        <div className="flex-shrink-0 mt-1">
                          {n.type === 'billing' ? '💰' : n.type === 'maintenance' ? '🔧' : '📢'}
                        </div>
                        <div>
                          <h4 className={`text-sm ${n.is_read ? 'font-medium text-muted-foreground' : 'font-bold text-foreground'}`}>{n.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
                          <p className="text-[10px] font-bold text-muted-foreground/60 uppercase mt-2">{new Date(n.created_at).toLocaleString('th-TH')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: System Updates (Daily Progress) */}
          {activeTab === 'updates' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-secondary/20 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-500 dark:text-purple-300">ประวัติการปรับปรุงระบบ</span>
                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {SYSTEM_UPDATES[0]?.version}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto sm:max-h-[380px] p-3 space-y-3">
                {latestUpdates.map((upd) => (
                  <div 
                    key={upd.date}
                    className="p-3.5 rounded-xl bg-secondary/40 border border-border hover:border-purple-500/40 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                        <span>📅</span> {upd.date}
                      </span>
                      {upd.version && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/30">
                          {upd.version}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-medium line-clamp-2 leading-snug mb-2">
                      {upd.tagline}
                    </p>
                    <div className="space-y-1">
                      {upd.tasks.slice(0, 2).map((t) => (
                        <div key={t.id} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                          <span className="text-purple-500 font-bold">•</span>
                          <span className="font-semibold line-clamp-1">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* View Full Updates Link */}
              <div className="p-3 bg-secondary/40 border-t border-border text-center shrink-0">
                <Link
                  href="/updates"
                  onClick={() => setIsOpen(false)}
                  className="w-full py-2 px-4 rounded-xl bg-purple-600/15 hover:bg-purple-600 text-purple-600 dark:text-purple-200 hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-sm border border-purple-500/30"
                >
                  <span>ดูรายละเอียดการอัปเดตทั้งหมด</span>
                  <span>➔</span>
                </Link>
              </div>
            </div>
          )}

        </div>
        </>
      )}
    </div>
  );
}
