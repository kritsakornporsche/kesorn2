import { NextResponse } from 'next/server';
import { getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const convId = searchParams.get('convId');

  if (!convId) {
    return NextResponse.json({ success: false, message: 'Conversation ID required' }, { status: 400 });
  }

  try {
    const sql = getDormDbFromSession(session);
    
    // Security: Check if user belongs to this conversation or is owner of the dorm
    const userResult = await sql`SELECT id FROM users WHERE email = ${session.user.email} LIMIT 1`;
    if (userResult.length === 0) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    const userId = userResult[0].id;

    const convCheck = await sql`
      SELECT id FROM conversations 
      WHERE id = ${convId} AND (
        guest_id = ${userId} 
        OR owner_id = ${userId}
        OR dorm_id IN (SELECT id FROM dormitory_registry WHERE owner_id = ${userId})
      )
      LIMIT 1
    `;

    if (convCheck.length === 0) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    // Automatically mark all unread messages from the other party as read
    await sql`
      UPDATE chat_messages 
      SET is_read = 1 
      WHERE conversation_id = ${convId} 
        AND sender_id != ${userId} 
        AND is_read = 0
    `;

    const messages = await sql`
      SELECT * FROM chat_messages 
      WHERE conversation_id = ${convId} 
      ORDER BY created_at ASC
    `;

    return NextResponse.json({ success: true, data: messages });
  } catch (error: any) {
    console.error('[GET /api/chat/messages] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { conversationId } = await request.json();
    if (!conversationId) {
      return NextResponse.json({ success: false, message: 'conversationId is required' }, { status: 400 });
    }

    const sql = getDormDbFromSession(session);
    const userResult = await sql`SELECT id FROM users WHERE email = ${session.user.email} LIMIT 1`;
    if (userResult.length === 0) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    const userId = userResult[0].id;

    // Mark all unread messages from other senders as read
    await sql`
      UPDATE chat_messages 
      SET is_read = 1 
      WHERE conversation_id = ${conversationId} 
        AND sender_id != ${userId} 
        AND is_read = 0
    `;

    return NextResponse.json({ success: true, message: 'Marked as read' });
  } catch (error: any) {
    console.error('[PATCH /api/chat/messages] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { conversationId, message, image } = body;
    if (!conversationId || (!message && !image)) {
      return NextResponse.json({ success: false, message: 'conversationId and message or image are required' }, { status: 400 });
    }

    const sql = getDormDbFromSession(session);

    const userResult = await sql`SELECT id FROM users WHERE email = ${session.user.email} LIMIT 1`;
    if (userResult.length === 0) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    const userId = userResult[0].id;

    // Security check: user is participant or owner of dorm
    const convCheck = await sql`
      SELECT id, guest_id, owner_id FROM conversations 
      WHERE id = ${conversationId} AND (
        guest_id = ${userId} 
        OR owner_id = ${userId}
        OR dorm_id IN (SELECT id FROM dormitory_registry WHERE owner_id = ${userId})
      )
      LIMIT 1
    `;

    if (convCheck.length === 0) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    let savedImageUrl: string | null = null;
    if (image && typeof image === 'string') {
      if (image.startsWith('data:image/')) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'chat');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const matches = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const base64Data = matches[2];
            const filename = `chat_${conversationId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
            savedImageUrl = `/uploads/chat/${filename}`;
          }
        } catch (imgErr) {
          console.error('[POST /api/chat/messages] Failed to save chat image:', imgErr);
        }
      } else if (image.startsWith('/') || image.startsWith('http')) {
        savedImageUrl = image;
      }
    }

    const textMessage = message || (savedImageUrl ? '📷 รูปภาพ' : '');

    // Insert message (MySQL syntax)
    const insertRes = await sql`
      INSERT INTO chat_messages (conversation_id, sender_id, message, image_url)
      VALUES (${conversationId}, ${userId}, ${textMessage}, ${savedImageUrl})
    `;
    const messageId = (insertRes as any)?.insertId;

    // Update last_message and updated_at in conversations
    const displayLastMessage = savedImageUrl && !message ? '📷 รูปภาพ' : textMessage;
    await sql`
      UPDATE conversations 
      SET last_message = ${displayLastMessage}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId}
    `;

    // Notify recipient
    try {
      const conv = convCheck[0];
      const recipientId = userId === conv.guest_id ? conv.owner_id : conv.guest_id;
      if (recipientId) {
        const isRecipientOwner = recipientId === conv.owner_id;
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${recipientId},
            'ข้อความใหม่ในแชท',
            ${'คุณได้รับข้อความใหม่: ' + (displayLastMessage.length > 50 ? displayLastMessage.slice(0, 47) + '...' : displayLastMessage)},
            'chat',
            0,
            ${isRecipientOwner ? '/owner/chat' : '/tenant/chat'},
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Chat notification warn:', ne);
    }

    const messageRows = await sql`
      SELECT * FROM chat_messages WHERE id = ${messageId} LIMIT 1
    `;

    return NextResponse.json({ 
      success: true, 
      data: messageRows[0] || { 
        id: messageId, 
        conversation_id: conversationId, 
        sender_id: userId, 
        message: textMessage,
        image_url: savedImageUrl, 
        created_at: new Date().toISOString() 
      } 
    });
  } catch (error: any) {
    console.error('[POST /api/chat/messages] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
