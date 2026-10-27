'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { toast } from 'sonner';
import { SYSTEM_UPDATES } from '@/lib/updatesData';
import {
  subscribeDeviceToWebPush,
  isIosDevice,
  isStandalonePwa,
} from '@/lib/features/web-push-client';

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
  action_url: string;
}

export default function NotificationsPopover() {
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'updates'>('notifications');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [pushPerm, setPushPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const userRole = String((session?.user as any)?.role || '').toLowerCase();
  const userSubRole = String((session?.user as any)?.sub_role || '').toLowerCase();
  const userName = session?.user?.name || '';
  const userEmail = session?.user?.email || '';
  const isAuthenticatedMember =
    status === 'authenticated' &&
    Boolean(session?.user);

  // Check initial Notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPerm(Notification.permission);
      if (Notification.permission === 'default' && isAuthenticatedMember) {
        const t = setTimeout(() => setShowMobilePrompt(true), 2500);
        return () => clearTimeout(t);
      }
    } else {
      setPushPerm('unsupported');
    }
  }, [isAuthenticatedMember]);

  const handleEnablePush = async () => {
    if (!isAuthenticatedMember) {
      toast.error('กรุณาเข้าสู่ระบบก่อนเปิดรับการแจ้งเตือน');
      return;
    }

    setIsSubscribing(true);
    try {
      const res = await subscribeDeviceToWebPush({
        role: userRole || 'guest',
        subRole: userSubRole,
        userName: userName || session?.user?.name || '',
        userEmail: userEmail || session?.user?.email || '',
        sendConfirmationPush: true,
      });

      if (res.needsIosHomeScreen) {
        setIosHint(true);
        toast.warning(res.message);
        return;
      }
      setPushPerm(res.permission);
      if (res.success) {
        setShowMobilePrompt(false);
        toast.success(res.message, {
          description: 'พร้อมรับการแจ้งเตือนผลอนุมัติการจองและข่าวสารสำคัญแล้ว',
        });
      } else {
        toast.error(res.message);
      }
    } catch (e: any) {
      toast.error(e?.message || 'เกิดข้อผิดพลาดในการเปิดการแจ้งเตือน');
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      const res = await fetch('/api/features/web-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_email',
          targetEmail: userEmail,
          title: 'ทดสอบการแจ้งเตือน 🔔',
          message: 'การแจ้งเตือนบนอุปกรณ์ของคุณทำงานได้อย่างถูกต้องแล้ว',
          url: '/explore/booking-status',
        }),
      });
      const data = await res.json();
      if (data.success && data.sentCount > 0) {
        toast.success('ส่งข้อความทดสอบแจ้งเตือนเรียบร้อยแล้ว');
      } else {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('ทดสอบการแจ้งเตือน 🔔', {
            body: 'การแจ้งเตือนบนอุปกรณ์ของคุณทำงานได้อย่างถูกต้องแล้ว',
            icon: '/favicon.ico',
          });
          toast.success('แสดงการแจ้งเตือนทดสอบบนหน้าจอเรียบร้อยแล้ว');
        } else {
          toast.info('เปิดการแจ้งเตือนเพื่อรับข้อความทดสอบ');
        }
      }
    } catch {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('ทดสอบการแจ้งเตือน 🔔', {
          body: 'การแจ้งเตือนบนอุปกรณ์ของคุณทำงานได้อย่างถูกต้องแล้ว',
          icon: '/favicon.ico',
        });
        toast.success('แสดงการแจ้งเตือนทดสอบบนหน้าจอเรียบร้อยแล้ว');
      }
    }
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (data.success) {
        setNotifications(data.data || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

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
        setNotifications(notifications.map((n) => ({ ...n, is_read: 1 })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = (e: React.MouseEvent, n: NotificationItem) => {
    // 1. Mark as read immediately in UI
    if (!n.is_read) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }

    setIsOpen(false);

    const targetUrl = n.action_url || '/explore/booking-status';

    // If already on the target page, trigger a full reload to show fresh state
    if (typeof window !== 'undefined' && window.location.pathname === targetUrl) {
      e.preventDefault();
      window.location.reload();
    }
  };

  const latestUpdates = SYSTEM_UPDATES.slice(0, 3);

  return (
    <>
      {/* Floating Prompt Banner */}
      {showMobilePrompt && pushPerm !== 'granted' && isAuthenticatedMember && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-50 rounded-2xl bg-card text-foreground border border-primary/30 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-2xl">🔔</span>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-foreground">
                  เปิดการแจ้งเตือนบนอุปกรณ์
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  รับแจ้งเตือนผลอนุมัติการจองห้องพัก และข้อความสำคัญผ่าน Web Push ทันที
                </p>
                {iosHint && (
                  <p className="text-[10px] text-amber-500 font-bold mt-1">
                    💡 สำหรับ iPhone: กดปุ่มแชร์ ⬆️ แล้วเลือก &ldquo;เพิ่มไปยังหน้าจอโฮม&rdquo;
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMobilePrompt(false)}
              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={isSubscribing}
              className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs shadow-md transition-all cursor-pointer"
            >
              {isSubscribing ? 'กำลังเปิด...' : '🔔 เปิดรับการแจ้งเตือน'}
            </button>
            <button
              type="button"
              onClick={() => setShowMobilePrompt(false)}
              className="py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground font-bold text-xs cursor-pointer"
            >
              ไว้ทีหลัง
            </button>
          </div>
        </div>
      )}

      <div className="relative" ref={popoverRef}>
        {/* Bell Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 text-foreground/80 hover:bg-secondary hover:text-foreground rounded-xl transition-colors focus:outline-none cursor-pointer"
          title="การแจ้งเตือนและอัปเดตระบบ"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse"></span>
          )}
        </button>

        {/* Popover Dropdown */}
        {isOpen && (
          <>
            {/* Mobile Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 sm:hidden"
              onClick={() => setIsOpen(false)}
            />

            <div className="fixed inset-0 sm:inset-auto sm:absolute sm:right-0 sm:mt-2 w-full sm:w-96 h-[100dvh] sm:h-auto sm:max-h-[580px] bg-card text-card-foreground border-0 sm:border sm:border-border sm:rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col transform opacity-100 scale-100 transition-all origin-top-right">
              {/* Mobile Header Bar */}
              <div className="flex sm:hidden items-center justify-between px-4 py-3 border-b border-border bg-secondary/80 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔔</span>
                  <span className="text-sm font-black text-foreground">การแจ้งเตือน</span>
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

              {/* Push Permission Status Bar & Enable Button */}
              <div className="p-3 bg-secondary/60 border-b border-border flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <span>🔔</span>
                    <span>การแจ้งเตือนบนอุปกรณ์</span>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                    pushPerm === 'granted'
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : pushPerm === 'denied'
                      ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }`}>
                    {pushPerm === 'granted' ? 'เปิดใช้งานแล้ว ✓' : pushPerm === 'denied' ? 'ถูกปิดกั้นในเบราว์เซอร์' : 'ยังไม่เปิดใช้งาน'}
                  </span>
                </div>

                {pushPerm !== 'granted' && pushPerm !== 'denied' && (
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    disabled={isSubscribing}
                    className="w-full py-2 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <span>🔔</span>
                    <span>{isSubscribing ? 'กำลังเปิด...' : 'เปิดการแจ้งเตือน'}</span>
                  </button>
                )}

                {pushPerm === 'granted' && (
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[11px] text-muted-foreground">พร้อมรับแจ้งเตือนทันที</span>
                    <button
                      type="button"
                      onClick={handleTestNotification}
                      className="px-2.5 py-1 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground font-bold text-[11px] transition-all cursor-pointer"
                    >
                      ทดสอบแจ้งเตือน
                    </button>
                  </div>
                )}

                {pushPerm === 'denied' && (
                  <p className="text-[10px] text-rose-400 leading-tight">
                    💡 คลิกไอคอนแม่กุญแจ 🔒 ที่แถบ URL ด้านบน แล้วเลือกอนุญาตการแจ้งเตือน
                  </p>
                )}
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
                  <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-secondary/20 shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      รายการแจ้งเตือนส่วนตัว
                    </span>
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
                      <div className="p-8 text-center flex flex-col items-center space-y-3">
                        <span className="text-4xl opacity-50">📭</span>
                        <p className="text-muted-foreground text-sm font-bold">ไม่มีการแจ้งเตือน</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {notifications.map((n) => (
                          <Link
                            key={n.id}
                            href={n.action_url || '/explore/booking-status'}
                            onClick={(e) => handleNotificationClick(e, n)}
                            className={`p-3.5 hover:bg-primary/10 transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                              n.is_read ? 'opacity-65 hover:opacity-100' : 'bg-primary/5'
                            }`}
                          >
                            <div className="flex gap-3 items-start flex-1 min-w-0">
                              <div className="flex-shrink-0 mt-0.5 text-base">
                                {n.type === 'booking_approved' || n.title?.includes('อนุมัติ')
                                  ? '✅'
                                  : n.type === 'billing' || n.type === 'payment'
                                  ? '💰'
                                  : n.type === 'maintenance'
                                  ? '🔧'
                                  : '📢'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className={`text-xs ${n.is_read ? 'font-bold text-foreground/80' : 'font-black text-foreground'}`}>
                                    {n.title}
                                  </h4>
                                  {!n.is_read && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                  {n.message}
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 font-medium mt-1">
                                  {new Date(n.created_at).toLocaleString('th-TH')}
                                </p>
                              </div>
                            </div>

                            <div className="flex-shrink-0 self-center pl-1">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-secondary group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground text-xs font-black transition-all shadow-sm group-hover:scale-110">
                                →
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: System Updates */}
              {activeTab === 'updates' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-secondary/20 shrink-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-purple-500 dark:text-purple-300">
                      ประวัติการปรับปรุงระบบ
                    </span>
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
    </>
  );
}
