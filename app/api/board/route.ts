import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, invitationBoard } from '@/lib/db'

const BOARD_ID = 'shared-wedding-board'

export async function GET() {
  const rows = await db.select().from(invitationBoard).where(eq(invitationBoard.id, BOARD_ID)).limit(1)
  if (rows[0]) return NextResponse.json(rows[0])
  const board = {
    id: BOARD_ID,
    families: [
      { id: 'patel', name: 'Patel Family', location: 'Ahmedabad', color: 'gold', people: ['Rajesh', 'Sunita', 'Aarav', 'Meera', 'Ishaan'] },
      { id: 'sharma', name: 'Sharma Family', location: 'Delhi', color: 'blue', people: ['Vikram', 'Priya', 'Rohan', 'Anika'] },
      { id: 'iyer', name: 'Iyer Family', location: 'Chennai', color: 'coral', people: ['Suresh', 'Lakshmi', 'Kavya'] },
      { id: 'kapoor', name: 'Kapoor Family', location: 'Mumbai', color: 'purple', people: ['Amit', 'Neha', 'Kabir', 'Tara'] },
    ],
    positions: {},
    updatedAt: new Date(),
  }
  await db.insert(invitationBoard).values(board)
  return NextResponse.json(board)
}

export async function PUT(request: Request) {
  const body = await request.json()
  if (!Array.isArray(body.families) || typeof body.positions !== 'object' || body.positions === null) {
    return NextResponse.json({ error: 'Invalid board data' }, { status: 400 })
  }
  const [board] = await db
    .insert(invitationBoard)
    .values({ id: BOARD_ID, families: body.families, positions: body.positions, updatedAt: new Date() })
    .onConflictDoUpdate({ target: invitationBoard.id, set: { families: body.families, positions: body.positions, updatedAt: new Date() } })
    .returning()
  return NextResponse.json(board)
}
