import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Missing 'path' parameter" }, { status: 400 });
  }

  // Security: only allow serving files from the OS temp directory
  const tmpDir = os.tmpdir();
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(tmpDir)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const fileBuffer = await fs.readFile(resolved);
    const fileName = path.basename(resolved);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "File not found or already cleaned up." },
      { status: 404 }
    );
  }
}
