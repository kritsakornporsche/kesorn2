'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { toast } from 'sonner';
import { subscribeDeviceToWebPush } from '@/lib/features/web-push-client';

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
  action_url: string;
}

export default function NotificationsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pushPerm, setPushPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [isSubscribing, setIsSubscribing] = useState(false);

  const userRole = String((session?.user as any)?.role || '').toLowerCase();
  const userSubRole = String((session?.user as any)?.sub_role || '').toLowerCase();
  const userName = session?.user?.name || '';
  const userEmail = session?.user?.email || '';

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPerm(Notification.permission);
    } else {
      setPushPerm('unsupported');
    }
  }, []);

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
    if (sessionStatus === 'authenticated') {
      fetchNotifications();
    } else if (sessionStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/notifications');
    }
  }, [sessionStatus, fetchNotifications, router]);

  const handleEnablePush = async () => {
    setIsSubscribing(true);
    try {
      const res = await subscribeDeviceToWebPush({
        role: userRole || 'guest',
        subRole: userSubRole,
        userName: userName || session?.user?.name || '',
        userEmail: userEmail || session?.user?.email || '',
        sendConfirmationPush: true,
      });

      setPushPerm(res.permission);
      if (res.success) {
        toast.success(res.message);
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

    const targetUrl = n.action_url || '/explore/booking-status';
    if (typeof window !== 'undefined' && window.location.pathname === targetUrl) {
      e.preventDefault();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xs font-bold text-muted-foreground hover:text-foreground">
            ← กลับหน้าหลัก
          </Link>
          <span className="text-xs font-black text-primary uppercase tracking-widest">การแจ้งเตือน</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">🔔 รายการแจ้งเตือน</h1>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAsRead}
              className="px-3.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-primary font-bold text-xs cursor-pointer border border-border"
            >
              อ่านทั้งหมดแล้ว
            </button>
          )}
        </div>

        {/* Web Push Banner Card */}
        <div className="bg-card border border-border rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">📲</span>
              <div>
                <span className="text-sm font-black text-foreground block">การแจ้งเตือนบนอุปกรณ์ (Web Push)</span>
                <span className="text-xs text-muted-foreground block">
                  รับแจ้งเตือนผลอนุมัติการจองห้องพัก และข้อความสำคัญผ่านเบราว์เซอร์
                </span>
              </div>
            </div>

            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
              pushPerm === 'granted'
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : pushPerm === 'denied'
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
            }`}>
              {pushPerm === 'granted' ? 'เปิดใช้งานแล้ว ✓' : pushPerm === 'denied' ? 'ถูกปิดกั้นในเบราว์เซอร์' : 'ยังไม่เปิดใช้งาน'}
            </span>
          </div>

          <div className="pt-2 flex items-center gap-2">
            {pushPerm !== 'granted' && pushPerm !== 'denied' && (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={isSubscribing}
                className="py-3 px-5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <span>🔔</span>
                <span>{isSubscribing ? 'กำลังเปิด...' : 'เปิดการแจ้งเตือนบนอุปกรณ์นี้'}</span>
              </button>
            )}

            {pushPerm === 'granted' && (
              <button
                type="button"
                onClick={handleTestNotification}
                className="py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground font-bold text-xs transition-all cursor-pointer"
              >
                🔔 ส่งแจ้งเตือนทดสอบ
              </button>
            )}

            {pushPerm === 'denied' && (
              <p className="text-xs text-rose-400 font-semibold">
                ⚠️ กรุณาคลิกไอคอนแม่กุญแจ 🔒 ที่แถบ URL ของเบราว์เซอร์ แล้วเลือก &ldquo;อนุญาต (Allow)&rdquo; การแจ้งเตือน
              </p>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground text-sm">กำลังโหลด...</div>
          ) : notifications.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <span className="text-5xl opacity-40 block">📭</span>
              <p className="text-muted-foreground text-sm font-bold">ไม่มีรายการแจ้งเตือน</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.action_url || '/explore/booking-status'}
                  onClick={(e) => handleNotificationClick(e, n)}
                  className={`p-5 hover:bg-primary/10 transition-colors cursor-pointer flex items-center justify-between gap-4 group ${
                    n.is_read ? 'opacity-65 hover:opacity-100' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="text-2xl flex-shrink-0 mt-0.5">
                      {n.type === 'booking' || n.type === 'booking_approved' ? '🛎️' : n.type === 'billing' ? '💰' : '📢'}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`text-sm ${n.is_read ? 'font-semibold text-foreground/80' : 'font-black text-foreground'}`}>
                          {n.title}
                        </h3>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {n.message}
                      </p>
                      <span className="text-[11px] text-muted-foreground/60 font-medium block pt-1">
                        {new Date(n.created_at).toLocaleString('th-TH')}
                      </span>
                    </div>
                  </div>

                  <div className="flex-shrink-0 self-center pl-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-secondary group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground text-sm font-black transition-all shadow-sm group-hover:scale-110">
                      →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
