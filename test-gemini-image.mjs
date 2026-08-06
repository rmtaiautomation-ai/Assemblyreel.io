import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;

async function testGenerateContent() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "A cute baby yoda" }] }]
    })
  });
  console.log("generateContent Status:", res.status);
  console.log("generateContent Body:", await res.text());
}

async function testPredict() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: "A cute baby yoda" }],
      parameters: { sampleCount: 1 }
    })
  });
  console.log("predict Status:", res.status);
  console.log("predict Body:", (await res.text()).substring(0, 500));
}

testGenerateContent().then(() => testPredict());
