import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface LineWindowStatus {
  success: boolean;
  enabled: boolean;
  isLineRunning: boolean;
  found: boolean;
  targetTitle?: string;
  isLocked?: boolean;
  isTopMost?: boolean;
  error?: string;
  action?: string;
  message?: string;
}

function getConfigPath() {
  return path.join(process.cwd(), 'storage', 'settings', 'auto-payment.json');
}

export function getAutoPaymentConfig(): { enabled: boolean } {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch {}
  return { enabled: false };
}

export function setAutoPaymentConfig(cfg: { enabled: boolean }) {
  try {
    const p = getConfigPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
  } catch {}
}

export async function executeLineWindowManager(action: 'status' | 'lock' | 'unlock' | 'launch'): Promise<LineWindowStatus> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'manage-krungthai-window.ps1');
  const cfg = getAutoPaymentConfig();

  if (!fs.existsSync(scriptPath)) {
    return {
      success: false,
      enabled: cfg.enabled,
      isLineRunning: false,
      found: false,
      error: 'SCRIPT_NOT_FOUND',
      message: 'ไม่พบไฟล์สคริปต์ manage-krungthai-window.ps1',
    };
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Action', action],
      { timeout: 10000 }
    );
    const trimmed = (stdout || '').trim();
    const jsonLine = trimmed.split(/\r?\n/).pop() || '{}';
    const data = JSON.parse(jsonLine);

    if (action === 'lock' && data.success) {
      setAutoPaymentConfig({ enabled: true });
    } else if (action === 'unlock') {
      setAutoPaymentConfig({ enabled: false });
    }

    const currentCfg = getAutoPaymentConfig();

    let thaiMessage = '';
    if (data.error === 'LINE_NOT_RUNNING') {
      thaiMessage = 'โปรแกรม LINE ยังไม่ได้เปิดทำงาน (กรุณาเปิด LINE บนเครื่อง)';
    } else if (data.error === 'LINE_LAUNCHED') {
      thaiMessage = 'กำลังเปิดโปรแกรม LINE กรุณารอสักครู่แล้วเปิดห้องแชท Krungthai Connext';
    } else if (data.error === 'WINDOW_NOT_FOUND') {
      thaiMessage = 'ไม่พบหน้าต่างแชท Krungthai Connext (กรุณาดับเบิลคลิกเปิดห้องแชท Krungthai Connext แยกเป็นหน้าต่างเดี่ยว)';
    } else if (data.action === 'locked') {
      thaiMessage = `✅ ล็อกหน้าต่างแชท "${data.targetTitle || 'Krungthai Connext'}" ไม่ให้พับ และตรึงให้อยู่บนสุดเสมอเรียบร้อยแล้ว`;
    } else if (data.action === 'unlocked') {
      thaiMessage = `ปลดล็อกหน้าต่างแชท "${data.targetTitle || 'Krungthai Connext'}" กลับสู่โหมดปกติแล้ว`;
    } else if (data.isLocked) {
      thaiMessage = `หน้าต่างแชท "${data.targetTitle || 'Krungthai Connext'}" กำลังเปิดและถูกล็อกไม่ให้พับ (พร้อมส่องยอดเงิน)`;
    } else {
      thaiMessage = `หน้าต่างแชท "${data.targetTitle || 'Krungthai Connext'}" อยู่ในโหมดปกติ`;
    }

    return {
      success: Boolean(data.success),
      enabled: currentCfg.enabled,
      isLineRunning: Boolean(data.isLineRunning),
      found: Boolean(data.found),
      targetTitle: data.targetTitle || '',
      isLocked: Boolean(data.isLocked),
      isTopMost: Boolean(data.isTopMost),
      error: data.error,
      action: data.action,
      message: thaiMessage,
    };
  } catch (err: any) {
    return {
      success: false,
      enabled: cfg.enabled,
      isLineRunning: false,
      found: false,
      error: err.message,
      message: 'เกิดข้อผิดพลาดในการรันสคริปต์: ' + err.message,
    };
  }
}
