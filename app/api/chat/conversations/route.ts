import { NextResponse } from 'next/server';
import { getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = getDormDbFromSession(session);
    const { searchParams } = new URL(request.url);
    const targetDormIdParam = searchParams.get('dormId');

    const userResult = await sql`
      SELECT id, role, name, email 
      FROM users 
      WHERE email = ${session.user.email} 
      LIMIT 1
    `;
    
    if (userResult.length === 0) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    
    const user = userResult[0];
    const isOwner = user.role === 'owner';
    const isKeeper = user.role === 'keeper';

    let conversations: any[] = [];

    if (isOwner) {
      // 1. Get all dorms owned by this owner (matching ID or email)
      const ownerDorms = await sql`
        SELECT id, dorm_name 
        FROM dormitory_registry 
        WHERE owner_id = ${user.id}
           OR owner_email = ${user.email}
           OR owner_id IN (SELECT id FROM users WHERE email = ${user.email})
      `;

      if (ownerDorms.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      let dormIds = ownerDorms.map((d: any) => d.id);
      if (targetDormIdParam) {
        const filteredId = parseInt(targetDormIdParam, 10);
        if (dormIds.includes(filteredId)) {
          dormIds = [filteredId];
        }
      }

      // 2. Ensure conversations exist for all Keepers of the owner's dorm(s)
      const cleanDormIds = dormIds.map(Number).filter(Boolean);
      const safeDormIds = cleanDormIds.length > 0 ? cleanDormIds : [1];
      const keepers = await sql`
        SELECT k.id, k.name, k.position, k.user_id, k.dorm_id, k.email 
        FROM keepers k 
        WHERE k.dorm_id IN (${safeDormIds})
      `;

      for (const k of keepers) {
        let targetUserId = k.user_id;
        if (!targetUserId && k.email) {
          const matched = await sql`SELECT id FROM users WHERE email = ${k.email} LIMIT 1`;
          if (matched.length > 0) targetUserId = matched[0].id;
        }
        if (!targetUserId) continue;

        const existing = await sql`
          SELECT id FROM conversations 
          WHERE guest_id = ${targetUserId} AND owner_id = ${user.id} AND dorm_id = ${k.dorm_id}
          LIMIT 1
        `;

        if (existing.length === 0) {
          const initMsg = k.position === 'Maid' ? 'ติดต่อแม่บ้าน' : (k.position === 'Technician' ? 'ติดต่อช่างประจำหอ' : 'ติดต่อผู้ดูแลหอพัก');
          await sql`
            INSERT INTO conversations (guest_id, owner_id, dorm_id, last_message, updated_at)
            VALUES (${targetUserId}, ${user.id}, ${k.dorm_id}, ${initMsg}, CURRENT_TIMESTAMP)
          `;
        }
      }

      // 3. Ensure conversations exist for active Tenants of the owner's dorm(s)
      const activeTenants = await sql`
        SELECT t.id, t.name, t.user_id, t.dorm_id, t.email, r.room_number
        FROM tenants t
        LEFT JOIN rooms r ON t.room_id = r.id
        WHERE t.dorm_id IN (${safeDormIds})
          AND (t.status = 'Active' OR t.status = 'Occupied')
      `;

      for (const t of activeTenants) {
        let targetUserId = t.user_id;
        if (!targetUserId && t.email) {
          const matched = await sql`SELECT id FROM users WHERE email = ${t.email} LIMIT 1`;
          if (matched.length > 0) targetUserId = matched[0].id;
        }
        if (!targetUserId) continue;

        const existing = await sql`
          SELECT id FROM conversations 
          WHERE guest_id = ${targetUserId} AND owner_id = ${user.id} AND dorm_id = ${t.dorm_id}
          LIMIT 1
        `;

        if (existing.length === 0) {
          await sql`
            INSERT INTO conversations (guest_id, owner_id, dorm_id, last_message, updated_at)
            VALUES (${targetUserId}, ${user.id}, ${t.dorm_id}, 'ติดต่อลูกหอ', CURRENT_TIMESTAMP)
          `;
        }
      }

      // 4. Clean up any dummy/orphan conversations with 0 messages that are NOT tenants and NOT keepers
      await sql`
        DELETE FROM conversations 
        WHERE (owner_id = ${user.id} OR dorm_id IN (${safeDormIds}))
          AND NOT EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.conversation_id = conversations.id)
          AND guest_id NOT IN (SELECT COALESCE(user_id, 0) FROM keepers WHERE dorm_id IN (${safeDormIds}))
          AND guest_id NOT IN (SELECT COALESCE(user_id, 0) FROM tenants WHERE dorm_id IN (${safeDormIds}))
      `;

      // 5. Query ONLY the 3 approved groups:
      //    a. ผู้ดูแลหอของตัวเอง (Keepers)
      //    b. ลูกหอของตัวเอง (Tenants)
      //    c. แขกที่เริ่มต้นทักมา (Guests who sent at least 1 message)
      conversations = await sql`
        SELECT 
          c.id,
          c.guest_id,
          c.owner_id,
          c.dorm_id,
          c.last_message,
          c.updated_at,
          c.created_at,
          (
            SELECT COUNT(*) 
            FROM chat_messages cm 
            WHERE cm.conversation_id = c.id 
              AND cm.sender_id != ${user.id} 
              AND cm.is_read = 0
          ) as unread_count,
          COALESCE(k.name, t.name, u.name, 'ผู้ติดต่อ') as guest_name,
          CASE 
            WHEN k.id IS NOT NULL THEN 'keeper'
            WHEN t.id IS NOT NULL THEN 'tenant'
            ELSE 'guest'
          END as guest_role,
          CASE 
            WHEN k.id IS NOT NULL AND k.position = 'Maid' THEN 'แม่บ้าน'
            WHEN k.id IS NOT NULL AND k.position = 'Technician' THEN 'ช่างประจำหอ'
            WHEN k.id IS NOT NULL THEN 'ผู้ดูแล'
            WHEN t.id IS NOT NULL AND r.room_number IS NOT NULL THEN CONCAT('ลูกหอ ห้อง ', r.room_number)
            WHEN t.id IS NOT NULL THEN 'ลูกหอ'
            ELSE 'แขกที่สนใจ'
          END as role_label,
          COALESCE(dr.dorm_name, 'หอพัก') as dorm_name,
          r.room_number
        FROM conversations c
        JOIN users u ON c.guest_id = u.id
        LEFT JOIN dormitory_registry dr ON c.dorm_id = dr.id
        LEFT JOIN keepers k ON (k.user_id = u.id OR k.email = u.email) AND k.dorm_id = c.dorm_id
        LEFT JOIN tenants t ON (t.user_id = u.id OR t.email = u.email) AND t.dorm_id = c.dorm_id
        LEFT JOIN rooms r ON t.room_id = r.id
        WHERE (c.owner_id = ${user.id} OR c.dorm_id IN (${safeDormIds}))
          AND (
            -- 1. ผู้ดูแลหอของตัวเอง
            k.id IS NOT NULL
            -- 2. ลูกหอของตัวเอง
            OR t.id IS NOT NULL
            -- 3. แขกที่เริ่มต้นทักมา (ต้องมีข้อความส่งมาจริงใน chat_messages)
            OR EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.conversation_id = c.id)
          )
        ORDER BY c.updated_at DESC
      `;
    } else if (isKeeper) {
      // Keeper sees their dorm's owner and tenants
      conversations = await sql`
        SELECT 
          c.id,
          c.guest_id,
          c.owner_id,
          c.dorm_id,
          c.last_message,
          c.updated_at,
          c.created_at,
          (
            SELECT COUNT(*) 
            FROM chat_messages cm 
            WHERE cm.conversation_id = c.id 
              AND cm.sender_id != ${user.id} 
              AND cm.is_read = 0
          ) as unread_count,
          COALESCE(u.name, dr.owner_name, 'เจ้าของหอพัก') as owner_name,
          COALESCE(u.name, 'คู่สนทนา') as guest_name,
          'owner' as guest_role,
          'เจ้าของหอพัก' as role_label,
          COALESCE(dr.dorm_name, 'หอพัก') as dorm_name
        FROM conversations c
        LEFT JOIN users u ON c.owner_id = u.id
        LEFT JOIN dormitory_registry dr ON c.dorm_id = dr.id
        WHERE c.guest_id = ${user.id}
        ORDER BY c.updated_at DESC
      `;
    } else {
      // Tenant / Guest sees their conversations with the dorm owner
      conversations = await sql`
        SELECT 
          c.id,
          c.guest_id,
          c.owner_id,
          c.dorm_id,
          c.last_message,
          c.updated_at,
          c.created_at,
          (
            SELECT COUNT(*) 
            FROM chat_messages cm 
            WHERE cm.conversation_id = c.id 
              AND cm.sender_id != ${user.id} 
              AND cm.is_read = 0
          ) as unread_count,
          COALESCE(u.name, dr.owner_name, 'เจ้าของหอพัก') as owner_name,
          COALESCE(dr.dorm_name, 'หอพัก') as dorm_name
        FROM conversations c
        LEFT JOIN users u ON c.owner_id = u.id
        LEFT JOIN dormitory_registry dr ON c.dorm_id = dr.id
        WHERE c.guest_id = ${user.id}
        ORDER BY c.updated_at DESC
      `;

      // If tenant has no conversation yet, auto-detect their dorm from tenants or contracts
      if (conversations.length === 0) {
        let detectedDormId: number | null = null;
        let detectedOwnerId: number | null = null;
        let detectedDormName = 'หอพักของคุณ';

        // 1. Check tenants table
        const tenantRows = await sql`
          SELECT t.dorm_id, dr.owner_id, dr.dorm_name 
          FROM tenants t 
          JOIN dormitory_registry dr ON t.dorm_id = dr.id 
          WHERE t.email = ${session.user.email} OR t.user_id = ${user.id}
          LIMIT 1
        `;

        if (tenantRows.length > 0) {
          detectedDormId = tenantRows[0].dorm_id;
          detectedOwnerId = tenantRows[0].owner_id;
          detectedDormName = tenantRows[0].dorm_name;
        } else {
          // 2. Check contracts table
          const contractRows = await sql`
            SELECT c.dorm_id, dr.owner_id, dr.dorm_name 
            FROM contracts c 
            JOIN dormitory_registry dr ON c.dorm_id = dr.id 
            WHERE c.tenant_id = ${user.id}
            LIMIT 1
          `;
          if (contractRows.length > 0) {
            detectedDormId = contractRows[0].dorm_id;
            detectedOwnerId = contractRows[0].owner_id;
            detectedDormName = contractRows[0].dorm_name;
          }
        }

        if (detectedDormId && detectedOwnerId) {
          const insertRes = await sql`
            INSERT INTO conversations (guest_id, owner_id, dorm_id, last_message, updated_at)
            VALUES (${user.id}, ${detectedOwnerId}, ${detectedDormId}, 'เริ่มการสนทนาใหม่', CURRENT_TIMESTAMP)
          `;
          const newId = (insertRes as any)?.insertId;

          const ownerUser = await sql`SELECT name FROM users WHERE id = ${detectedOwnerId} LIMIT 1`;
          const ownerDisplayName = ownerUser[0]?.name || 'เจ้าของหอพัก';

          conversations = [{
            id: newId,
            guest_id: user.id,
            owner_id: detectedOwnerId,
            dorm_id: detectedDormId,
            last_message: 'เริ่มการสนทนาใหม่',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            owner_name: ownerDisplayName,
            dorm_name: detectedDormName
          }];
        }
      }
    }

    return NextResponse.json({ success: true, data: conversations });
  } catch (error: any) {
    console.error('[GET /api/chat/conversations] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { dormId } = await request.json();
    if (!dormId) {
      return NextResponse.json({ success: false, message: 'dormId is required' }, { status: 400 });
    }

    const sql = getDormDbFromSession(session);
    
    // Get initiating user
    const userResult = await sql`
      SELECT id, role 
      FROM users 
      WHERE email = ${session.user.email} 
      LIMIT 1
    `;
    if (userResult.length === 0) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    const guestId = userResult[0].id;

    // Get owner_id from dormitory_registry
    const dormResult = await sql`
      SELECT id, owner_id, dorm_name 
      FROM dormitory_registry 
      WHERE id = ${dormId} 
      LIMIT 1
    `;
    if (dormResult.length === 0) {
      return NextResponse.json({ success: false, message: 'Dorm not found' }, { status: 404 });
    }
    const ownerId = dormResult[0].owner_id;

    // Check if conversation already exists
    const existing = await sql`
      SELECT id, guest_id, owner_id, dorm_id 
      FROM conversations 
      WHERE guest_id = ${guestId} AND dorm_id = ${dormId}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json({ success: true, data: existing[0] });
    }

    // Create new conversation (MySQL syntax)
    const insertRes = await sql`
      INSERT INTO conversations (guest_id, owner_id, dorm_id, last_message, updated_at)
      VALUES (${guestId}, ${ownerId}, ${dormId}, 'เริ่มการสนทนาใหม่', CURRENT_TIMESTAMP)
    `;

    const newId = (insertRes as any)?.insertId;
    return NextResponse.json({ 
      success: true, 
      data: { 
        id: newId, 
        guest_id: guestId, 
        owner_id: ownerId, 
        dorm_id: Number(dormId) 
      } 
    });
  } catch (error: any) {
    console.error('[POST /api/chat/conversations] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
