import path from 'path';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import readXlsxFile from 'read-excel-file/node';
import { parse as parseCsv } from 'csv-parse/sync';

export type ParsedKnowledgeEntry = {
  question: string;
  answer: string;
  category?: string;
};

export type ParsedKnowledgeFile = {
  fileName: string;
  entries: ParsedKnowledgeEntry[];
  truncated: boolean;
};

const MAX_EXTRACTED_CHARS = 300_000;
const MAX_ENTRIES_PER_FILE = 200;
const CHUNK_SIZE = 4_500;
const CHUNK_OVERLAP = 250;

const QUESTION_HEADERS = new Set(['question', 'questions', 'q', 'prompt', 'คำถาม', 'คําถาม']);
const ANSWER_HEADERS = new Set(['answer', 'answers', 'a', 'response', 'reply', 'คำตอบ', 'คําตอบ']);
const CATEGORY_HEADERS = new Set(['category', 'หมวดหมู่', 'หมวด', 'ประเภท', 'topic']);

export const KNOWLEDGE_FILE_EXTENSIONS = new Set([
  '.csv',
  '.xlsx',
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.pdf',
  '.docx',
  '.log',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
]);

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, '');
}

function headerIndex(row: string[], accepted: Set<string>): number {
  return row.findIndex(value => accepted.has(normalizeHeader(value)));
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function cleanExtractedText(value: string): { text: string; truncated: boolean } {
  const cleaned = value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return {
    text: cleaned.slice(0, MAX_EXTRACTED_CHARS),
    truncated: cleaned.length > MAX_EXTRACTED_CHARS,
  };
}

function tableEntries(rows: string[][], fallbackCategory: string): ParsedKnowledgeEntry[] | null {
  const headerRowIndex = rows.findIndex(row =>
    headerIndex(row, QUESTION_HEADERS) >= 0 && headerIndex(row, ANSWER_HEADERS) >= 0,
  );
  if (headerRowIndex < 0) return null;

  const header = rows[headerRowIndex];
  const questionIndex = headerIndex(header, QUESTION_HEADERS);
  const answerIndex = headerIndex(header, ANSWER_HEADERS);
  const categoryIndex = headerIndex(header, CATEGORY_HEADERS);
  const entries: ParsedKnowledgeEntry[] = [];

  for (const row of rows.slice(headerRowIndex + 1)) {
    const question = (row[questionIndex] || '').trim();
    const answer = (row[answerIndex] || '').trim();
    if (!question || !answer) continue;
    entries.push({
      question: question.slice(0, 1_000),
      answer: answer.slice(0, 20_000),
      category: (categoryIndex >= 0 ? row[categoryIndex] : '').trim().slice(0, 100) || fallbackCategory,
    });
    if (entries.length >= MAX_ENTRIES_PER_FILE) break;
  }
  return entries.length ? entries : null;
}

function rowsToText(rows: string[][]): string {
  return rows
    .map(row => row.map(value => value.trim()).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

function chunkText(fileName: string, source: string, category: string): ParsedKnowledgeEntry[] {
  const { text } = cleanExtractedText(source);
  if (!text) return [];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length && chunks.length < MAX_ENTRIES_PER_FILE) {
    let end = Math.min(text.length, cursor + CHUNK_SIZE);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const lineBreak = text.lastIndexOf('\n', end);
      const sentenceBreak = Math.max(
        text.lastIndexOf('. ', end),
        text.lastIndexOf('。', end),
        text.lastIndexOf('?', end),
        text.lastIndexOf('!', end),
      );
      const bestBreak = Math.max(paragraphBreak, lineBreak, sentenceBreak);
      if (bestBreak > cursor + Math.floor(CHUNK_SIZE * 0.55)) end = bestBreak + 1;
    }
    const chunk = text.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - CHUNK_OVERLAP);
  }

  return chunks.map((chunk, index) => ({
    question: chunks.length === 1 ? fileName : `${fileName} — ส่วน ${index + 1}/${chunks.length}`,
    answer: `แหล่งข้อมูล: ${fileName}\n\n${chunk}`,
    category,
  }));
}

async function readWorkbook(buffer: Buffer): Promise<Array<{ name: string; rows: string[][] }>> {
  const workbook = await readXlsxFile(buffer);
  return workbook.map(sheet => ({
    name: sheet.sheet,
    rows: sheet.data.map(row => row.map(cellToText)),
  }));
}

function parseCsvRows(buffer: Buffer): string[][] {
  return parseCsv(decodeText(buffer), {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }).map((row: unknown[]) => row.map(value => value === null || value === undefined ? '' : String(value)));
}

export async function parseKnowledgeFile(
  file: Express.Multer.File,
  fallbackCategory = 'เอกสาร',
): Promise<ParsedKnowledgeFile> {
  const fileName = path.basename(file.originalname || 'document');
  const extension = path.extname(fileName).toLocaleLowerCase();
  if (!KNOWLEDGE_FILE_EXTENSIONS.has(extension)) {
    throw new Error(`ไม่รองรับไฟล์ ${extension || file.mimetype}`);
  }

  let entries: ParsedKnowledgeEntry[] = [];
  let extractedText = '';
  let wasTruncated = false;

  if (extension === '.csv') {
    const rows = parseCsvRows(file.buffer);
    entries = tableEntries(rows, fallbackCategory) || [];
    if (!entries.length) extractedText = rowsToText(rows);
  } else if (extension === '.xlsx') {
    const sheets = await readWorkbook(file.buffer);
    const textSheets: string[] = [];
    for (const sheet of sheets) {
      const sheetEntries = tableEntries(sheet.rows, fallbackCategory);
      if (sheetEntries) entries.push(...sheetEntries);
      else {
        const text = rowsToText(sheet.rows);
        if (text) textSheets.push(`ชีต: ${sheet.name}\n${text}`);
      }
    }
    if (textSheets.length) {
      entries.push(...chunkText(fileName, textSheets.join('\n\n'), fallbackCategory));
    }
  } else if (extension === '.pdf') {
    const result = await pdf(file.buffer);
    extractedText = result.text || '';
  } else if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    extractedText = result.value || '';
  } else if (extension === '.json') {
    const raw = decodeText(file.buffer);
    try {
      extractedText = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      extractedText = raw;
    }
  } else {
    extractedText = decodeText(file.buffer);
    if (extension === '.html' || extension === '.htm' || extension === '.xml') {
      extractedText = extractedText
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
    }
  }

  if (!entries.length) {
    const cleaned = cleanExtractedText(extractedText);
    wasTruncated = cleaned.truncated;
    entries = chunkText(fileName, cleaned.text, fallbackCategory);
  }

  if (!entries.length) throw new Error('ไม่พบข้อความที่นำมาใช้เป็นความรู้ได้');
  return {
    fileName,
    entries: entries.slice(0, MAX_ENTRIES_PER_FILE),
    truncated: wasTruncated || entries.length > MAX_ENTRIES_PER_FILE,
  };
}
