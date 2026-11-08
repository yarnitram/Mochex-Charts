import { NextRequest, NextResponse } from "next/server";
import { verifyToken, UserPayload } from "@/lib/auth/jwt";
import {
  getServerCustomSounds,
  saveServerCustomSound,
  deleteServerCustomSound,
} from "@/lib/audio/server-custom-audio-store";
import {
  CustomSoundAsset,
  validateAudioFile,
} from "@/lib/audio/custom-audio-store";

export const dynamic = "force-dynamic";

async function getAuthUser(request: NextRequest): Promise<UserPayload | null> {
  const token =
    request.cookies.get("mochex_token")?.value ||
    request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    const devUserId = request.headers.get("X-User-Id");
    if (devUserId) {
      return {
        userId: devUserId,
        username: devUserId,
        email: `${devUserId}@local`,
        role: "TRADER",
      };
    }
    // Return a default local identity so audio persistence operates smoothly
    return {
      userId: "default",
      username: "trader",
      email: "trader@mochex.local",
      role: "TRADER",
    };
  }
  const verified = verifyToken(token);
  return (
    verified || {
      userId: "default",
      username: "trader",
      email: "trader@mochex.local",
      role: "TRADER",
    }
  );
}

/**
 * GET /api/audio/custom - Returns all saved custom audio assets for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const userId = user ? user.userId : "default";
    const sounds = await getServerCustomSounds(userId);
    return NextResponse.json({ sounds });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to retrieve custom audio sounds" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audio/custom - Persists a custom audio asset in cloud storage
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const userId = user ? user.userId : "default";

    const body = await request.json();
    const { name, dataUrl, fileType, fileSize, id, createdAt } = body;

    if (!name || !dataUrl) {
      return NextResponse.json(
        { error: "Missing required audio fields (name, dataUrl)" },
        { status: 400 }
      );
    }

    const validation = validateAudioFile({
      name,
      size: fileSize || dataUrl.length,
      type: fileType,
    });

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const asset: CustomSoundAsset = {
      id: id || `custom-sound-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(name).slice(0, 80),
      dataUrl: String(dataUrl),
      fileType: fileType || "audio/mpeg",
      fileSize: typeof fileSize === "number" ? fileSize : dataUrl.length,
      createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
    };

    const saved = await saveServerCustomSound(userId, asset);
    return NextResponse.json({ success: true, asset: saved });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to save custom audio sound" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/audio/custom?id=<soundId> - Deletes a custom audio asset
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const userId = user ? user.userId : "default";

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing sound id parameter" }, { status: 400 });
    }

    await deleteServerCustomAudio(userId, id);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete custom audio sound" },
      { status: 500 }
    );
  }
}

async function deleteServerCustomAudio(userId: string, id: string) {
  await deleteServerCustomSound(userId, id);
}
