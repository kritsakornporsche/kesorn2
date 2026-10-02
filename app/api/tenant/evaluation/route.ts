import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      respondent_code,
      gender,
      stay_duration,
      major,
      accommodation_type,
      // Section 2: usability tasks (true=pass, false=fail)
      task_login,
      task_qr_payment,
      task_view_contract,
      task_maintenance,
      task_services,
      task_chat,
      task_submit_slip,
      task_billing_history,
      task_contract_check,
      task_announcements,
      task_move_out,
      // Section 3: satisfaction ratings (1-5)
      sat_usability,
      sat_design,
      sat_reliability,
      sat_performance,
      sat_communication,
      sat_qr_payment,
      sat_notifications,
      sat_maintenance,
      sat_billing,
      sat_overall,
      // Section 4: open suggestions
      suggestion_like,
      suggestion_improve,
      suggestion_other,
      dorm_id,
    } = body;

    const sql = getDb();

    // Create table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS evaluations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        respondent_code VARCHAR(20),
        gender VARCHAR(10),
        stay_duration VARCHAR(20),
        major VARCHAR(100),
        accommodation_type VARCHAR(50),
        task_login TINYINT(1) DEFAULT NULL,
        task_qr_payment TINYINT(1) DEFAULT NULL,
        task_view_contract TINYINT(1) DEFAULT NULL,
        task_maintenance TINYINT(1) DEFAULT NULL,
        task_services TINYINT(1) DEFAULT NULL,
        task_chat TINYINT(1) DEFAULT NULL,
        task_submit_slip TINYINT(1) DEFAULT NULL,
        task_billing_history TINYINT(1) DEFAULT NULL,
        task_contract_check TINYINT(1) DEFAULT NULL,
        task_announcements TINYINT(1) DEFAULT NULL,
        task_move_out TINYINT(1) DEFAULT NULL,
        sat_usability TINYINT DEFAULT NULL,
        sat_design TINYINT DEFAULT NULL,
        sat_reliability TINYINT DEFAULT NULL,
        sat_performance TINYINT DEFAULT NULL,
        sat_communication TINYINT DEFAULT NULL,
        sat_qr_payment TINYINT DEFAULT NULL,
        sat_notifications TINYINT DEFAULT NULL,
        sat_maintenance TINYINT DEFAULT NULL,
        sat_billing TINYINT DEFAULT NULL,
        sat_overall TINYINT DEFAULT NULL,
        suggestion_like TEXT,
        suggestion_improve TEXT,
        suggestion_other TEXT,
        dorm_id INT DEFAULT 1,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await sql`
      INSERT INTO evaluations (
        respondent_code, gender, stay_duration, major, accommodation_type,
        task_login, task_qr_payment, task_view_contract, task_maintenance, task_services,
        task_chat, task_submit_slip, task_billing_history, task_contract_check, task_announcements, task_move_out,
        sat_usability, sat_design, sat_reliability, sat_performance, sat_communication,
        sat_qr_payment, sat_notifications, sat_maintenance, sat_billing, sat_overall,
        suggestion_like, suggestion_improve, suggestion_other, dorm_id
      ) VALUES (
        ${respondent_code || null}, ${gender || null}, ${stay_duration || null},
        ${major || null}, ${accommodation_type || null},
        ${task_login ?? null}, ${task_qr_payment ?? null}, ${task_view_contract ?? null},
        ${task_maintenance ?? null}, ${task_services ?? null}, ${task_chat ?? null},
        ${task_submit_slip ?? null}, ${task_billing_history ?? null}, ${task_contract_check ?? null},
        ${task_announcements ?? null}, ${task_move_out ?? null},
        ${sat_usability || null}, ${sat_design || null}, ${sat_reliability || null},
        ${sat_performance || null}, ${sat_communication || null}, ${sat_qr_payment || null},
        ${sat_notifications || null}, ${sat_maintenance || null}, ${sat_billing || null},
        ${sat_overall || null},
        ${suggestion_like || null}, ${suggestion_improve || null}, ${suggestion_other || null},
        ${dorm_id || 1}
      )
    `;

    return NextResponse.json({ success: true, message: 'บันทึกแบบประเมินสำเร็จ ขอบคุณสำหรับการตอบแบบสอบถาม' });
  } catch (err: any) {
    console.error('[Evaluation API] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== 'owner' && role !== 'platform_admin' && role !== 'researcher') {
      return NextResponse.json({ success: false, message: 'Forbidden: เฉพาะเจ้าของหอพัก ผู้ดูแลระบบ หรือผู้วิจัย' }, { status: 403 });
    }
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const dormId = parseInt(searchParams.get('dormId') || '1');

    // Check table exists first
    const tableCheck = await sql`
      SELECT COUNT(*) as cnt FROM information_schema.tables 
      WHERE table_schema = DATABASE() AND table_name = 'evaluations'
    `;
    if (!tableCheck[0]?.cnt) {
      return NextResponse.json({ success: true, data: [], summary: null });
    }

    const rows = await sql`
      SELECT * FROM evaluations WHERE dorm_id = ${dormId} ORDER BY submitted_at DESC
    `;

    // Calculate averages for section 3
    const satFields = ['sat_usability','sat_design','sat_reliability','sat_performance',
      'sat_communication','sat_qr_payment','sat_notifications','sat_maintenance','sat_billing','sat_overall'];
    
    const summary = rows.length > 0 ? {
      count: rows.length,
      averages: Object.fromEntries(
        satFields.map(f => [
          f,
          rows.reduce((sum: number, r: any) => sum + (Number(r[f]) || 0), 0) /
          rows.filter((r: any) => r[f] !== null).length || 0
        ])
      ),
      task_pass_rates: ['task_login','task_qr_payment','task_view_contract','task_maintenance',
        'task_services','task_chat','task_submit_slip','task_billing_history',
        'task_contract_check','task_announcements','task_move_out'].reduce((acc: any, f) => {
        const answered = rows.filter((r: any) => r[f] !== null);
        acc[f] = answered.length > 0
          ? Math.round((answered.filter((r: any) => r[f] === 1).length / answered.length) * 100)
          : null;
        return acc;
      }, {})
    } : null;

    return NextResponse.json({ success: true, data: rows, summary });
  } catch (err: any) {
    console.error('[Evaluation GET] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
