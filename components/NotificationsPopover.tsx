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

  const popoverRef = useRef<HTMLDivElement>(null);
  const lastMaxIdRef = useRef<number | null>(null);
  const router = useRouter();

  const userRole = String((session?.user as any)?.role || '').toLowerCase();
  const userSubRole = String((session?.user as any)?.sub_role || '').toLowerCase();
  const userName = session?.user?.name || '';
  const userEmail = session?.user?.email || '';
  const isAuthenticatedMember =
    status === 'authenticated' &&
    Boolean(session?.user) &&
    userRole !== 'guest' &&
    userRole !== '';

  const fireBrowserNotification = useCallback(async (title: string, body: string, url?: string) => {
    try {
      toast.info(title, { description: body });

      if (title.includes('คำขอเปิดการแจ้งเตือน') || body.includes('เปิดการแจ้งเตือนสำหรับ mobile')) {
        if (typeof window !== 'undefined' && (!('Notification' in window) || Notification.permission !== 'granted')) {
          setShowMobilePrompt(true);
        }
      }

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration('/sw.js');
          if (reg) {
            await reg.showNotification(title, {
              body,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: `role-push-${Date.now()}`,
              data: { url: url || window.location.pathname },
            } as NotificationOptions);
            return;
          }
        }
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    } catch {
      // Fallback if mobile browser blocks direct constructor
    }
  }, []);

  const handleEnableMobilePush = async () => {
    if (!isAuthenticatedMember) {
      toast.error('กรุณาเข้าสู่ระบบในบทบาทสมาชิกก่อนเปิดรับการแจ้งเตือน');
      return;
    }

    const res = await subscribeDeviceToWebPush({
      role: userRole,
      subRole: userSubRole,
      userName,
      userEmail,
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
        description: 'สามารถพับหน้าจอหรือล็อกหน้าจอเพื่อรับแจ้งเตือนนอกแอปได้ทันที',
      });
    } else {
      toast.error(res.message);
    }
  };

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticatedMember) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const list: NotificationItem[] = data.data;
        setNotifications(list);
        setUnreadCount(data.unreadCount);

        const newestUnread = list.find((n) => !n.is_read);
        if (newestUnread) {
          if (lastMaxIdRef.current !== null && newestUnread.id > lastMaxIdRef.current) {
            fireBrowserNotification(newestUnread.title, newestUnread.message, newestUnread.action_url);
          }
          lastMaxIdRef.current = Math.max(lastMaxIdRef.current || 0, newestUnread.id);
        } else if (lastMaxIdRef.current === null && list.length > 0) {
          lastMaxIdRef.current = Math.max(...list.map((n) => n.id));
        } else if (lastMaxIdRef.current === null) {
          lastMaxIdRef.current = 0;
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticatedMember, fireBrowserNotification]);

  useEffect(() => {
    // Do NOT run notifications or push subscription for unauthenticated users or guests
    if (!isAuthenticatedMember) {
      setShowMobilePrompt(false);
      setLoading(false);
      return;
    }

    if (typeof window !== 'undefined') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
      if (isIosDevice() && !isStandalonePwa()) {
        setIosHint(true);
        setShowMobilePrompt(true);
      } else if ('Notification' in window) {
        setPushPerm(Notification.permission);
        if (Notification.permission === 'granted') {
          // Sync current logged-in role & identity with VAPID server
          subscribeDeviceToWebPush({
            role: userRole,
            subRole: userSubRole,
            userName,
            userEmail,
            sendConfirmationPush: false,
          }).catch(() => {});
        } else if (Notification.permission === 'default') {
          const isMobileScreen =
            window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
          if (isMobileScreen) {
            setShowMobilePrompt(true);
          }
        }
      } else {
        setPushPerm('unsupported');
      }
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);

    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('smartdorm_web_push');
        bc.onmessage = (ev) => {
          if (ev.data?.type === 'BROADCAST_ALL_ROLES') {
            fetchNotifications();
          } else if (ev.data?.type === 'REQUEST_MOBILE_PERMISSION') {
            setShowMobilePrompt(true);
            fetchNotifications();
          }
        };
      } catch {
        // ignore
      }
    }

    return () => {
      clearInterval(interval);
      if (bc) bc.close();
    };
  }, [isAuthenticatedMember, userRole, userSubRole, userName, userEmail, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Hide notification bell completely if not authenticated
  if (!isAuthenticatedMember) {
    return null;
  }

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

  const handleNotificationClick = (actionUrl: string | null) => {
    setIsOpen(false);
    if (actionUrl) {
      router.push(actionUrl);
    }
  };

  const latestUpdates = SYSTEM_UPDATES.slice(0, 3);

  return (
    <>
      {/* Floating Mobile Permission Request Modal / Banner (Only for authenticated members) */}
      {showMobilePrompt && pushPerm !== 'granted' && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-50 rounded-2xl bg-slate-900/95 text-white border border-cyan-400/50 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-2xl">📲</span>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-cyan-300">
                  คำขอเปิดการแจ้งเตือนสำหรับมือถือ ({userName || userRole})
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  กดปุ่มด้านล่างเพื่ออนุญาตให้ระบบหอพักเกษร 2 แจ้งเตือนบิล งานซ่อม และข้อความสำคัญบนมือถือของคุณทันที
                </p>
                {iosHint && (
                  <p className="text-[10px] text-amber-300 font-bold mt-1">
                    💡 สำหรับ iPhone (Safari): กดปุ่มแชร์ ⬆️ แล้วเลือก &ldquo;เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)&rdquo; ก่อนเปิดรับแจ้งเตือน
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowMobilePrompt(false)}
              className="text-xs text-slate-400 hover:text-white px-1.5 py-0.5"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnableMobilePush}
              className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs shadow-lg transition-all cursor-pointer"
            >
              🔔 กดอนุญาตเปิดการแจ้งเตือนบนมือถือ
            </button>
            <button
              type="button"
              onClick={() => setShowMobilePrompt(false)}
              className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 font-bold text-xs cursor-pointer"
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
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card text-card-foreground border border-border rounded-2xl shadow-2xl z-50 overflow-hidden transform opacity-100 scale-100 transition-all origin-top-right">
            {/* Tabs Navigation Header */}
            <div className="bg-secondary/50 p-2 border-b border-border flex items-center gap-1">
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

            {/* Mobile Push Permission Status Bar inside Popover */}
            <div className="px-3 py-2 bg-secondary/40 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-muted-foreground">
                📲 แจ้งเตือนมือถือ:{' '}
                <strong className={pushPerm === 'granted' ? 'text-emerald-500' : 'text-amber-500'}>
                  {pushPerm === 'granted' ? 'เปิดแล้ว' : 'ยังไม่เปิด'}
                </strong>
              </span>
              {pushPerm !== 'granted' && (
                <button
                  type="button"
                  onClick={handleEnableMobilePush}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[11px] cursor-pointer"
                >
                  กดเปิดแจ้งเตือนมือถือ
                </button>
              )}
            </div>

            {/* Tab 1: Notifications */}
            {activeTab === 'notifications' && (
              <div>
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-secondary/20">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    รายการแจ้งเตือนส่วนตัว ({userName || userRole})
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

                <div className="max-h-[380px] overflow-y-auto">
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
                          className={`p-4 hover:bg-secondary/50 transition-colors cursor-pointer flex gap-4 ${
                            n.is_read ? 'opacity-70' : 'bg-primary/5'
                          }`}
                        >
                          <div className="flex-shrink-0 mt-1">
                            {n.type === 'billing' ? '💰' : n.type === 'maintenance' ? '🔧' : '📢'}
                          </div>
                          <div>
                            <h4
                              className={`text-sm ${
                                n.is_read ? 'font-medium text-muted-foreground' : 'font-bold text-foreground'
                              }`}
                            >
                              {n.title}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                              {n.message}
                            </p>
                            <p className="text-[10px] font-bold text-muted-foreground/60 uppercase mt-2">
                              {new Date(n.created_at).toLocaleString('th-TH')}
                            </p>
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
              <div>
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-secondary/20">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-500 dark:text-purple-300">
                    ประวัติการปรับปรุงระบบ
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {SYSTEM_UPDATES[0]?.version}
                  </span>
                </div>

                <div className="max-h-[380px] overflow-y-auto p-3 space-y-3">
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
                <div className="p-3 bg-secondary/40 border-t border-border text-center">
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
        )}
      </div>
    </>
  );
}
