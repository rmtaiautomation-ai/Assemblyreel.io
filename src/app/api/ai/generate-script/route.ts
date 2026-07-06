import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { topic, format, tone } = await req.json();

    console.log(`Generating script for: ${topic} (${format}, ${tone})`);

    // TODO: In production, this will call Google Gemini 2.5 Flash
    // We will pass a strict JSON Schema instruction so Gemini returns exactly this format.

    // Mock response simulating Gemini's output
    const mockTimeline = [
      {
        id: 'scene-1',
        text: `The history of artificial intelligence didn't start with ChatGPT. It started decades ago.`,
        bRollKeyword: 'vintage computer lab 1960s',
        durationInFrames: 150 // 5 seconds at 30fps
      },
      {
        id: 'scene-2',
        text: `In 1956, a group of scientists gathered at Dartmouth College, coining the term 'Artificial Intelligence'.`,
        bRollKeyword: 'dartmouth college old photo',
        durationInFrames: 210 // 7 seconds
      },
      {
        id: 'scene-3',
        text: `But they hit a wall. Computers were too weak, and data was too scarce. This was the first AI winter.`,
        bRollKeyword: 'frozen computer server room cinematic',
        durationInFrames: 180 // 6 seconds
      },
      {
        id: 'scene-4',
        text: `Everything changed with Neural Networks, inspired by the human brain itself.`,
        bRollKeyword: 'glowing neural network brain 3d animation',
        durationInFrames: 150 // 5 seconds
      }
    ];

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2500));

    return NextResponse.json({ 
      success: true, 
      data: {
        title: topic,
        scenes: mockTimeline
      }
    });

  } catch (error) {
    console.error('Failed to generate script:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate script' }, { status: 500 });
  }
}
