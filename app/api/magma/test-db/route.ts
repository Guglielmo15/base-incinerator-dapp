import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface CountRow extends RowDataPacket {
  count: number;
}

export async function GET() {
  try {
    const [rows] = await db.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM magma_users"
    );

    const count = rows[0]?.count ?? 0;

    return NextResponse.json({
      ok: true,
      usersCount: count,
    });
  } catch (err) {
    console.error("test-db error", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Database connection failed",
      },
      { status: 500 }
    );
  }
}
