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
    const { conversationId, message } = await request.json();
    if (!conversationId || !message) {
      return NextResponse.json({ success: false, message: 'conversationId and message are required' }, { status: 400 });
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

    // Insert message (MySQL syntax)
    const insertRes = await sql`
      INSERT INTO chat_messages (conversation_id, sender_id, message)
      VALUES (${conversationId}, ${userId}, ${message})
    `;
    const messageId = (insertRes as any)?.insertId;

    // Update last_message and updated_at in conversations
    await sql`
      UPDATE conversations 
      SET last_message = ${message}, updated_at = CURRENT_TIMESTAMP
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
            ${'คุณได้รับข้อความใหม่: ' + (message.length > 50 ? message.slice(0, 47) + '...' : message)},
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
        message, 
        created_at: new Date().toISOString() 
      } 
    });
  } catch (error: any) {
    console.error('[POST /api/chat/messages] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
