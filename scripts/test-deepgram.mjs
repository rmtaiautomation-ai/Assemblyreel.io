import { createClient } from "@deepgram/sdk";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  
  // Find an audio file in public/audio
  const audioDir = "./public/audio";
  const files = fs.readdirSync(audioDir);
  if (files.length === 0) {
    console.log("No audio files to test.");
    return;
  }
  
  const filePath = `${audioDir}/${files[0]}`;
  const audioBuffer = fs.readFileSync(filePath);
  
  try {
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      { model: "nova-2", smart_format: true }
    );
    if (error) throw error;
    console.log("Deepgram success! First word:", result.results.channels[0].alternatives[0].words[0].word);
  } catch (err) {
    console.error("Deepgram error:", err);
  }
}

test();
