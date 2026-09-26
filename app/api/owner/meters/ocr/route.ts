import { NextResponse } from 'next/server';
import { auth } from '@/auth';

// Global singleton worker to avoid 10-15s re-initialization on every request
const globalForOcr = globalThis as unknown as {
  _ocrWorkerPromise?: Promise<any>;
  _ocrWorker?: any;
};

async function getSharedOcrWorker() {
  if (globalForOcr._ocrWorker) {
    return globalForOcr._ocrWorker;
  }
  if (!globalForOcr._ocrWorkerPromise) {
    globalForOcr._ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const path = await import('path');
      const localDir = path.resolve(process.cwd());
      
      // Load local eng.traineddata directly to ensure instant offline recognition and avoid CDN timeout
      const worker = await createWorker('eng', 1, {
        langPath: localDir,
        cachePath: localDir,
        gzip: false,
      });
      // PSM 6 (single uniform block) handles multi-element dials, labels, and text reliably
      await worker.setParameters({
        tessedit_pageseg_mode: '6' as any,
      });
      globalForOcr._ocrWorker = worker;
      return worker;
    })();
  }
  return globalForOcr._ocrWorkerPromise;
}

// Known constant metadata on Thai meters to ignore (voltage, frequency, amp ratings, meter constants, years)
const METER_NOISE_CONSTANTS = new Set([
  220, 230, 240, 380, 50, 60, 100, 1200, 1600, 2400, 3200, 4064, 
  2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027
]);

/**
 * Robust parser for utility meters:
 * 1. Handles mechanical rotating wheels with dividers e.g. "0 | 0 | 1 | 8 | 4" -> 184
 * 2. Normalizes bracketed odometer windows "[00184]"
 * 3. Does NOT corrupt brand words (Sanwa, Mitsubishi) into numbers
 * 4. Filters out electrical ratings (220V, 50Hz, 1200r/kWh) and dates
 * 5. Scores candidates based on closeness to previous reading
 */
function parseMeterDigits(rawText: string, previousReading?: number | string | null): {
  reading: number | null;
  candidates: number[];
} {
  if (!rawText || typeof rawText !== 'string') {
    return { reading: null, candidates: [] };
  }

  const prev = (previousReading !== undefined && previousReading !== null && previousReading !== '') 
    ? Number(previousReading) 
    : 0;

  // 1. Remove brackets around counter windows
  let processed = rawText.replace(/\[\s*([0-9\s|:,\._\/-]+)\s*\]/g, '$1')
                         .replace(/\(\s*([0-9\s|:,\._\/-]+)\s*\)/g, '$1');

  // 2. Collapse single digits separated by typical mechanical wheel dividers (| : - . / space)
  processed = processed.replace(/\b([0-9])(?:[\s|:,\._\/-]+([0-9])){2,6}\b/g, (match) => {
    return match.replace(/[^0-9.]/g, '');
  });

  // 3. Find standard sequences of spaced odometer digits: e.g. "0 0 1 8 4" or "0 1 2 4 5 . 8"
  processed = processed.replace(/\b([0-9])\s+([0-9])(?:\s+([0-9]))*(?:\s*\.\s*([0-9]))?\b/g, (match) => {
    return match.replace(/\s+/g, '');
  });

  // 4. Handle letter O / I / l when inside or adjacent to digit sequences
  processed = processed.replace(/(?<=\d)[Oo](?=\d)/g, '0')
                       .replace(/(?<=\d)[Il|](?=\d)/g, '1')
                       .replace(/\b[Oo]\b/g, '0');

  // Extract all numeric tokens (integers and decimals)
  const tokens = processed.match(/\d+(?:\.\d+)?/g) || [];
  
  // Convert to numbers and remove noise
  const candidates: number[] = [];
  for (const t of tokens) {
    const num = parseFloat(t);
    if (isNaN(num)) continue;
    if (METER_NOISE_CONSTANTS.has(num)) continue;
    candidates.push(num);
  }

  const unique = Array.from(new Set(candidates));

  if (unique.length === 0) {
    return { reading: null, candidates: [] };
  }

  // Score candidates based on closeness to previous reading
  const scored = unique.map(c => {
    let score = 0;
    const diff = c - prev;
    if (diff >= 0 && diff <= 500) {
      score += 100 - (diff / 10); // close positive delta is top priority
    } else if (diff > 500 && diff <= 2500) {
      score += 50 - (diff / 100);
    } else if (diff < 0 && Math.abs(diff) < 50) {
      score += 20; // slight OCR under-read
    } else {
      score += 5;
    }
    // Boost 3-6 digit numbers which are standard meter odometer lengths
    const digitCount = Math.floor(c).toString().length;
    if (digitCount >= 3 && digitCount <= 6) {
      score += 20;
    }
    return { candidate: c, score, diff };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    reading: scored[0].candidate,
    candidates: scored.map(s => s.candidate),
  };
}

export async function POST(req: Request) {
  try {
    // Permissive session check (never return 401 for OCR utility)
    try {
      await auth();
    } catch {
      // ignore
    }

    const { image, cropImage, previous_reading, type, apiKey } = await req.json();

    if (!image && !cropImage) {
      return NextResponse.json({ success: false, message: 'Image data is required' }, { status: 400 });
    }

    let detectedNumber: number | null = null;
    let rawText = '';
    let confidence = 0;
    let engineUsed = 'tesseract-smart';
    let allCandidates: number[] = [];

    // 1. Try Gemini Vision using Owner's custom key or system fallback
    let ownerOcrKey: string | null = null;
    try {
      const { getDb } = await import('@/lib/db');
      const sql = getDb();
      const dormProfile = await sql`SELECT ocr_api_key, ocr_provider FROM dormitory_profile LIMIT 1`;
      if (dormProfile.length > 0 && dormProfile[0].ocr_api_key) {
        ownerOcrKey = String(dormProfile[0].ocr_api_key).trim();
      }
    } catch (e) {
      console.warn('Could not fetch custom ocr_api_key:', e);
    }

    const geminiKey = (apiKey ? String(apiKey).trim() : null) || ownerOcrKey || process.env.GEMINI_API_KEY;
    const isCustomKey = Boolean(apiKey || ownerOcrKey);
    const targetImageForVision = image || cropImage;

    if (geminiKey && targetImageForVision) {
      try {
        let mimeType = 'image/jpeg';
        if (targetImageForVision.startsWith('data:image/png')) {
          mimeType = 'image/png';
        } else if (targetImageForVision.startsWith('data:image/webp')) {
          mimeType = 'image/webp';
        }

        const base64Data = targetImageForVision.replace(/^data:image\/\w+;base64,/, '');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        // Try gemini-2.0-flash / gemini-3.6-flash (multimodal dial reader)
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Read the utility meter dial counter display (${type || 'utility'} meter, e.g. Mitsubishi / Sanwa).
Look closely at the rotating number wheels (including black wheels with white digits, and any rightmost decimal wheel).
Return ONLY valid JSON:
{ "reading": 2419, "digits": "2419.0", "confidence": 0.99 }
without markdown formatting. Previous reading was ${previous_reading || 0}. If completely unreadable, return { "reading": null, "confidence": 0 }`,
                    },
                    {
                      inline_data: {
                        mime_type: mimeType,
                        data: base64Data,
                      },
                    },
                  ],
                },
              ],
            }),
          }
        );
        clearTimeout(timeoutId);

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (parsed && typeof parsed.reading === 'number') {
            detectedNumber = parsed.reading;
            confidence = parsed.confidence || 0.99;
            engineUsed = isCustomKey ? 'gemini-custom-key' : 'gemini-system-key';
            if (parsed.digits) {
              rawText = String(parsed.digits);
            }
          }
        }
      } catch (geminiErr: any) {
        console.warn('Gemini Vision OCR error, falling back to local OCR:', geminiErr);
      }
    }

    // 2. Dual-Pass Local Tesseract OCR:
    // Pass A: Run on zoomed, high-contrast center dial crop (fast & most accurate on mechanical odometers)
    if (detectedNumber === null && cropImage) {
      try {
        const cropBuffer = Buffer.from(
          cropImage.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
        const worker = await getSharedOcrWorker();
        const ret = await worker.recognize(cropBuffer);
        const text = ret.data.text ? ret.data.text.trim() : '';
        if (text) {
          rawText = text;
          confidence = ret.data.confidence;
          const parsed = parseMeterDigits(text, previous_reading);
          if (parsed.reading !== null) {
            detectedNumber = parsed.reading;
            allCandidates = parsed.candidates;
            engineUsed = 'tesseract-dial-crop';
          }
        }
      } catch (cropErr: any) {
        console.warn('Tesseract dial crop OCR error:', cropErr);
      }
    }

    // Pass B: Fallback to full image if crop didn't catch reading
    if (detectedNumber === null && image) {
      try {
        const base64Buffer = Buffer.from(
          image.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );

        const worker = await getSharedOcrWorker();
        const ret = await worker.recognize(base64Buffer);

        const text = ret.data.text ? ret.data.text.trim() : '';
        if (text) {
          rawText = (rawText ? rawText + ' | ' : '') + text;
          confidence = Math.max(confidence, ret.data.confidence);
          const parsed = parseMeterDigits(text, previous_reading);
          if (parsed.reading !== null) {
            detectedNumber = parsed.reading;
            allCandidates = Array.from(new Set([...allCandidates, ...parsed.candidates]));
            engineUsed = 'tesseract-full-frame';
          }
        }
      } catch (tessErr: any) {
        console.warn('Tesseract full image OCR error:', tessErr);
      }
    }

    // Sanity checks and warnings
    let warning: string | null = null;
    if (detectedNumber !== null && previous_reading !== undefined && previous_reading !== null && previous_reading !== '') {
      const prev = Number(previous_reading);
      if (detectedNumber < prev) {
        warning = `ตัวเลขที่ตรวจพบ (${detectedNumber}) น้อยกว่างวดก่อน (${prev}) กรุณาตรวจสอบหรือแตะแก้ไขตัวเลข`;
      } else if (detectedNumber - prev > 800) {
        warning = `หน่วยที่ใช้ (${(detectedNumber - prev).toFixed(1)} หน่วย) สูงกว่าปกติ กรุณายืนยันความถูกต้อง`;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        reading: detectedNumber,
        rawText,
        confidence,
        warning,
        candidates: allCandidates,
        engine: engineUsed,
        hasCustomKey: Boolean(ownerOcrKey),
      },
    });
  } catch (err: any) {
    console.error('API OCR error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
