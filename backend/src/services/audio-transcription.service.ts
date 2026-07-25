import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

export type AudioTranscriptionLanguage = 'th' | 'lo';

export type AudioTranscriptionErrorCode =
  | 'not_configured'
  | 'file_not_found'
  | 'invalid_file'
  | 'unsupported_format'
  | 'file_too_large'
  | 'duration_too_long'
  | 'empty_transcript'
  | 'authentication_failed'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'transcription_failed';

const SAFE_ERROR_MESSAGES: Record<AudioTranscriptionErrorCode, string> = {
  not_configured: 'Audio transcription is not configured.',
  file_not_found: 'The audio file could not be found.',
  invalid_file: 'The audio file is invalid.',
  unsupported_format: 'The audio format is not supported.',
  file_too_large: 'The audio file is too large.',
  duration_too_long: 'The audio recording is too long.',
  empty_transcript: 'No speech could be transcribed from the audio.',
  authentication_failed: 'The transcription service is not available.',
  rate_limited: 'The transcription service is temporarily busy.',
  upstream_unavailable: 'The transcription service is temporarily unavailable.',
  transcription_failed: 'The audio could not be transcribed.',
};

export class AudioTranscriptionError extends Error {
  readonly code: AudioTranscriptionErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    code: AudioTranscriptionErrorCode,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = 'AudioTranscriptionError';
    this.code = code;
    this.retryable = options.retryable === true;
    this.status = options.status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type TranscribeAudioFileInput = {
  filePath: string;
  mimetype?: string | null;
  language?: AudioTranscriptionLanguage;
  durationSeconds?: number | string | null;
  maxFileSizeBytes?: number;
  maxDurationSeconds?: number;
};

export type AudioTranscriptionResult = {
  text: string;
  model: string;
  language?: AudioTranscriptionLanguage;
};

const MEBIBYTE = 1024 * 1024;
const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * MEBIBYTE;
const HARD_MAX_FILE_SIZE_BYTES = 25 * MEBIBYTE;
const DEFAULT_MAX_DURATION_SECONDS = 5 * 60;
const DEFAULT_TIMEOUT_MS = 60_000;

const MIME_TYPES_BY_EXTENSION: Record<string, ReadonlySet<string>> = {
  flac: new Set(['audio/flac', 'audio/x-flac']),
  mp3: new Set(['audio/mp3', 'audio/mpeg']),
  mp4: new Set(['audio/mp4', 'video/mp4', 'application/mp4']),
  mpeg: new Set(['audio/mpeg', 'video/mpeg']),
  mpga: new Set(['audio/mpeg']),
  m4a: new Set(['audio/aac', 'audio/m4a', 'audio/mp4', 'audio/x-m4a']),
  aac: new Set(['audio/aac', 'audio/x-aac']),
  ogg: new Set(['audio/ogg', 'application/ogg', 'audio/opus']),
  oga: new Set(['audio/ogg', 'application/ogg', 'audio/opus']),
  opus: new Set(['audio/opus', 'audio/ogg', 'application/ogg']),
  wav: new Set(['audio/wav', 'audio/wave', 'audio/x-wav']),
  webm: new Set(['audio/webm', 'video/webm']),
  '3gp': new Set(['audio/3gpp', 'video/3gpp']),
};

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function configuredMaxFileSize(override?: number): number {
  const requested = positiveNumber(
    override ?? process.env.COMETAPI_AUDIO_MAX_BYTES,
    DEFAULT_MAX_FILE_SIZE_BYTES,
  );
  return Math.min(Math.floor(requested), HARD_MAX_FILE_SIZE_BYTES);
}

function configuredMaxDuration(override?: number): number {
  return positiveNumber(
    override ?? process.env.COMETAPI_AUDIO_MAX_DURATION_SECONDS,
    DEFAULT_MAX_DURATION_SECONDS,
  );
}

function configuredModel(value: string | undefined, fallback: string): string {
  const model = (value || '').trim();
  return model && model.length <= 100 && /^[a-zA-Z0-9._:-]+$/.test(model)
    ? model
    : fallback;
}

function transcriptionModels(): string[] {
  return Array.from(new Set([
    configuredModel(process.env.COMETAPI_TRANSCRIPTION_MODEL, 'gpt-4o-transcribe'),
    configuredModel(process.env.COMETAPI_TRANSCRIPTION_FALLBACK_MODEL, 'whisper-1'),
  ]));
}

function normalizeMimetype(value?: string | null): string {
  return (value || '').split(';', 1)[0].trim().toLowerCase();
}

function validateAudioFile(input: TranscribeAudioFileInput): string {
  if (!input.filePath || typeof input.filePath !== 'string') {
    throw new AudioTranscriptionError('invalid_file');
  }

  let realFile: string;
  let stat: fs.Stats;
  try {
    const resolved = path.resolve(input.filePath);
    realFile = fs.realpathSync(resolved);
    stat = fs.statSync(realFile);
  } catch {
    throw new AudioTranscriptionError('file_not_found');
  }

  if (!stat.isFile() || stat.size <= 0) {
    throw new AudioTranscriptionError('invalid_file');
  }

  const extension = path.extname(realFile).slice(1).toLowerCase();
  const allowedMimetypes = MIME_TYPES_BY_EXTENSION[extension];
  if (!allowedMimetypes) {
    throw new AudioTranscriptionError('unsupported_format');
  }

  const mimetype = normalizeMimetype(input.mimetype);
  if (mimetype && !allowedMimetypes.has(mimetype)) {
    throw new AudioTranscriptionError('unsupported_format');
  }

  if (stat.size > configuredMaxFileSize(input.maxFileSizeBytes)) {
    throw new AudioTranscriptionError('file_too_large');
  }

  if (input.durationSeconds !== undefined && input.durationSeconds !== null) {
    const duration = Number(input.durationSeconds);
    if (!Number.isFinite(duration) || duration < 0) {
      throw new AudioTranscriptionError('invalid_file');
    }
    if (duration > configuredMaxDuration(input.maxDurationSeconds)) {
      throw new AudioTranscriptionError('duration_too_long');
    }
  }

  return realFile;
}

function createAudioClient(): OpenAI {
  const apiKey = process.env.COMETAPI_AUDIO_KEY
    || process.env.COMETAPI_KEY
    || process.env.COMETAPI_GEMINI_KEY
    || '';
  if (!apiKey) throw new AudioTranscriptionError('not_configured');

  return new OpenAI({
    apiKey,
    baseURL: process.env.COMETAPI_BASE_URL || 'https://api.cometapi.com/v1',
    timeout: positiveNumber(process.env.COMETAPI_AUDIO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: 1,
  });
}

function upstreamStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = Number((error as { status?: unknown }).status);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

function canTryFallback(status: number | undefined): boolean {
  if (status === 401 || status === 403 || status === 413) return false;
  return status === undefined
    || status === 400
    || status === 404
    || status === 408
    || status === 409
    || status === 429
    || status >= 500;
}

function safeUpstreamError(error: unknown): AudioTranscriptionError {
  const status = upstreamStatus(error);
  if (status === 401 || status === 403) {
    return new AudioTranscriptionError('authentication_failed', { status });
  }
  if (status === 413) {
    return new AudioTranscriptionError('file_too_large', { status });
  }
  if (status === 429) {
    return new AudioTranscriptionError('rate_limited', { retryable: true, status });
  }
  if (status === 408 || status === 409 || (status !== undefined && status >= 500)) {
    return new AudioTranscriptionError('upstream_unavailable', { retryable: true, status });
  }
  if (status === undefined) {
    return new AudioTranscriptionError('upstream_unavailable', { retryable: true });
  }
  return new AudioTranscriptionError('transcription_failed', { status });
}

/**
 * Transcribe one trusted local audio file through CometAPI's
 * OpenAI-compatible `/v1/audio/transcriptions` endpoint.
 *
 * The returned text is intentionally never logged here. Callers should also
 * avoid placing transcripts or upstream error bodies in application logs.
 */
export async function transcribeAudioFile(
  input: TranscribeAudioFileInput,
): Promise<AudioTranscriptionResult> {
  const filePath = validateAudioFile(input);
  const client = createAudioClient();
  const models = transcriptionModels();
  let finalError: AudioTranscriptionError | undefined;

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    try {
      const response = await client.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model,
        ...(input.language ? { language: input.language } : {}),
        response_format: 'json',
      });
      const text = response.text?.trim() || '';
      if (!text) {
        finalError = new AudioTranscriptionError('empty_transcript');
        continue;
      }
      return {
        text,
        model,
        ...(input.language ? { language: input.language } : {}),
      };
    } catch (error) {
      finalError = error instanceof AudioTranscriptionError
        ? error
        : safeUpstreamError(error);
      const hasFallback = index < models.length - 1;
      if (!hasFallback || !canTryFallback(finalError.status)) break;
    }
  }

  throw finalError || new AudioTranscriptionError('transcription_failed');
}
