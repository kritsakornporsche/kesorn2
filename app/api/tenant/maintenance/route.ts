import { NextResponse } from 'next/server';
import { getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { issue_type, description, photo_url, photos } = body;
    if (!description) {
      return NextResponse.json({ success: false, message: 'Description is required' }, { status: 400 });
    }

    const sql = getDormDbFromSession(session);
    
    const tenantRes = await sql`
      SELECT t.id, COALESCE(t.room_id, c.room_id) as room_id, r.room_number, COALESCE(t.dorm_id, r.dorm_id, 1) as dorm_id
      FROM tenants t
      LEFT JOIN contracts c ON t.id = c.tenant_id AND c.status = 'Active'
      LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, c.room_id)
      WHERE LOWER(t.email) = LOWER(${session.user.email})
      LIMIT 1
    `;

    if (tenantRes.length === 0) {
      return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = tenantRes[0].id;
    const roomNumber = tenantRes[0].room_number;
    const dormId = tenantRes[0].dorm_id || 1;

    // Process multiple photos if provided
    let rawPhotos: string[] = [];
    if (Array.isArray(photos) && photos.length > 0) {
      rawPhotos = photos;
    } else if (photo_url) {
      rawPhotos = [photo_url];
    }

    const savedPhotoUrls: string[] = [];
    if (rawPhotos.length > 0) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'maintenance');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        for (let i = 0; i < rawPhotos.length; i++) {
          const item = rawPhotos[i];
          if (typeof item === 'string' && item.startsWith('data:image/')) {
            const matches = item.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
            if (matches) {
              const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
              const base64Data = matches[2];
              const filename = `maint_${tenantId}_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.${ext}`;
              const filePath = path.join(uploadDir, filename);
              fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
              savedPhotoUrls.push(`/uploads/maintenance/${filename}`);
            }
          } else if (typeof item === 'string' && (item.startsWith('/') || item.startsWith('http'))) {
            savedPhotoUrls.push(item);
          }
        }
      } catch (saveErr) {
        console.error('[POST /api/tenant/maintenance] Error saving images:', saveErr);
      }
    }

    const finalPhotoUrl = savedPhotoUrls.length > 1 
      ? JSON.stringify(savedPhotoUrls) 
      : (savedPhotoUrls[0] || null);

    const insertResult: any = await sql`
      INSERT INTO maintenance_requests (tenant_id, room_number, issue_type, description, status, photo_url, image_url, dorm_id)
      VALUES (${tenantId}, ${roomNumber}, ${issue_type}, ${description}, 'Pending', ${finalPhotoUrl}, ${finalPhotoUrl}, ${dormId})
    `;

    const newId = insertResult.insertId;

    // If request is for cleaning, also create a job in cleaning_jobs for Maid portal
    if (issue_type.includes('ทำความสะอาด') && tenantRes[0].room_id) {
      try {
        await sql`
          INSERT INTO cleaning_jobs (room_id, dorm_id, task, job_type, notes, status)
          VALUES (${tenantRes[0].room_id}, 1, ${'คำขอทำความสะอาด: ' + description}, 'requested', ${description}, 'pending')
        `;
      } catch (ce) {
        console.warn('Auto cleaning job notice:', ce);
      }
    }

    // Notify owner and keepers
    try {
      const staff = await sql`
        SELECT DISTINCT u.id as user_id, u.role
        FROM users u
        WHERE (
          u.id IN (SELECT owner_id FROM dormitory_registry WHERE id = 1 AND owner_id IS NOT NULL)
          OR LOWER(u.email) IN (SELECT LOWER(owner_email) FROM dormitory_registry WHERE id = 1 AND owner_email IS NOT NULL)
          OR u.role IN ('owner', 'keeper')
        )
      `;

      for (const p of staff as any[]) {
        const isOwner = p.role === 'owner';
        const link = isOwner ? '/owner/maintenance' : (issue_type.includes('ทำความสะอาด') ? '/keeper/maid' : '/keeper/technician');
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${p.user_id},
            'มีการแจ้งซ่อม/บริการใหม่',
            ${'ห้อง ' + (roomNumber || '-') + ' แจ้งเรื่อง: ' + issue_type + ' - ' + (description.length > 50 ? description.slice(0, 47) + '...' : description)},
            'maintenance',
            0,
            ${link},
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Maintenance notify warn:', ne);
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: newId, 
        tenant_id: tenantId, 
        room_number: roomNumber, 
        issue_type, 
        description, 
        status: 'Pending' 
      } 
    });
  } catch (error: any) {
    console.error('[POST /api/tenant/maintenance] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
