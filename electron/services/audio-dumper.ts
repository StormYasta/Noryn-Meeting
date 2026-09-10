import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { AudioPipelineConfig } from './audio-config';

export class AudioDumper {
  private static dumpCount = 0;

  /**
   * Salva um chunk Float32Array em formato WAV para inspeção e diagnóstico em DEV.
   */
  public static dumpWavChunk(
    meetingId: string,
    sequence: number,
    samples: Float32Array,
    sampleRate: number = 16000,
    status: string = 'stt'
  ): string | null {
    if (!AudioPipelineConfig.DEBUG_AUDIO_DUMP) return null;
    if (this.dumpCount >= AudioPipelineConfig.DEBUG_AUDIO_MAX_FILES) return null;

    try {
      const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : path.join(process.env.HOME || '', '.config'));
      const defaultUserData = path.join(appData, 'noryn-meeting-copilot');
      const baseDir = typeof app?.getPath === 'function'
        ? path.join(app.getPath('userData'), 'debug-audio', meetingId)
        : path.join(defaultUserData, 'debug-audio', meetingId);

      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      const fileName = `chunk-${sequence.toString().padStart(3, '0')}-${status}.wav`;
      const filePath = path.join(baseDir, fileName);

      const wavBuffer = this.encodeWav(samples, sampleRate);
      fs.writeFileSync(filePath, wavBuffer);
      this.dumpCount++;

      return filePath;
    } catch (err) {
      console.warn('[AudioDumper] Falha ao salvar chunk de debug:', err);
      return null;
    }
  }

  /**
   * Codifica um Float32Array mono para Buffer WAV (PCM 16-bit LE).
   */
  public static encodeWav(samples: Float32Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF identifier
    buffer.write('RIFF', 0);
    // File length minus RIFF identifier and length bytes
    buffer.writeUInt32LE(36 + dataSize, 4);
    // RIFF type
    buffer.write('WAVE', 8);
    // Format chunk identifier
    buffer.write('fmt ', 12);
    // Format chunk length
    buffer.writeUInt32LE(16, 16);
    // Sample format (1 = PCM)
    buffer.writeUInt16LE(1, 20);
    // Channel count
    buffer.writeUInt16LE(numChannels, 22);
    // Sample rate
    buffer.writeUInt32LE(sampleRate, 24);
    // Byte rate
    buffer.writeUInt32LE(byteRate, 28);
    // Block align
    buffer.writeUInt16LE(blockAlign, 32);
    // Bits per sample
    buffer.writeUInt16LE(16, 34);
    // Data chunk identifier
    buffer.write('data', 36);
    // Data chunk length
    buffer.writeUInt32LE(dataSize, 40);

    // Write PCM 16-bit samples with clamping
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const val = s < 0 ? s * 0x8000 : s * 0x7fff;
      buffer.writeInt16LE(Math.round(val), offset);
      offset += 2;
    }

    return buffer;
  }
}
