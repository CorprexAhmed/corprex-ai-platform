import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Simple text extraction (enhance with pdf-parse for better results)
    const text = buffer.toString('utf-8').substring(0, 5000);
    
    return NextResponse.json({ 
      text: text,
      filename: file.name,
      size: file.size 
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process PDF' },
      { status: 500 }
    );
  }
}