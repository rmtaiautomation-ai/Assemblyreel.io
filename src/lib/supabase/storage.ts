import { createClient } from "@supabase/supabase-js";

export const getStorageClient = () => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase URL or Service Role Key");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

export async function uploadBufferToSupabase(
  buffer: Buffer | ArrayBuffer,
  bucket: string,
  path: string,
  contentType: string
): Promise<{ url: string; error: string | null }> {
  try {
    const supabase = getStorageClient();

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error("[Supabase Storage] Upload error:", error);
      return { url: "", error: error.message };
    }

    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: publicData.publicUrl, error: null };
  } catch (error: any) {
    console.error("[Supabase Storage] Exception:", error);
    return { url: "", error: error.message || "Unknown error" };
  }
}
