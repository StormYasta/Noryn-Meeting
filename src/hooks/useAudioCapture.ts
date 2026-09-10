import { useState, useEffect, useRef, useCallback } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export function useAudioCapture() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [captureSystemAudio, setCaptureSystemAudio] = useState<boolean>(true); // default true for Google Meet
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<'Cliente' | 'Eu'>('Cliente');

  // Diagnostic VU Meters (0 to 100)
  const [micVolumeLevel, setMicVolumeLevel] = useState<number>(0);
  const [systemVolumeLevel, setSystemVolumeLevel] = useState<number>(0);

  // Status & Warning flags
  const [isSystemAudioActive, setIsSystemAudioActive] = useState<boolean>(false);
  const [hasSystemAudioWarning, setHasSystemAudioWarning] = useState<boolean>(false);

  // Testing states for Pre-meeting Screen
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [isTestingSystem, setIsTestingSystem] = useState<boolean>(false);

  // Gain adjustments (default 1.0)
  const [micGain, setMicGain] = useState<number>(1.0);
  const [systemGain, setSystemGain] = useState<number>(1.0);

  // Web Audio Nodes & Streams
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const systemSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainNodeRef = useRef<GainNode | null>(null);
  const systemGainNodeRef = useRef<GainNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);

  const activeMeetingIdRef = useRef<string>('');
  const consecutiveSilentSystemChunks = useRef<number>(0);

  // Enumerate input devices
  const refreshDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microfone ${d.deviceId.slice(0, 5)}...`,
        }));
      setDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('[mic] Erro ao listar microfones:', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Update gains if changed by user
  useEffect(() => {
    if (micGainNodeRef.current) {
      micGainNodeRef.current.gain.value = micGain;
    }
  }, [micGain]);

  useEffect(() => {
    if (systemGainNodeRef.current) {
      systemGainNodeRef.current.gain.value = systemGain;
    }
  }, [systemGain]);

  // Helper to acquire microphone stream
  const acquireMicrophoneStream = async (deviceId?: string): Promise<MediaStream> => {
    console.log('[mic] requesting microphone stream...');
    const targetId = deviceId || selectedDeviceId;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: targetId ? { exact: targetId } : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    console.log('[mic] stream acquired, audio tracks:', stream.getAudioTracks().length);
    return stream;
  };

  // Helper to acquire system loopback audio stream
  const acquireSystemAudioStream = async (): Promise<MediaStream> => {
    console.log('[system] requesting loopback via getDisplayMedia...');
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Chromium requires video constraint to trigger getDisplayMedia
      audio: true, // Electron setDisplayMediaRequestHandler supplies 'loopback'
    });

    // Discard video track immediately - DO NOT process or record video
    const videoTracks = displayStream.getVideoTracks();
    videoTracks.forEach((vt) => {
      vt.stop();
      displayStream.removeTrack(vt);
    });

    const audioTracks = displayStream.getAudioTracks();
    console.log('[system] stream acquired, audio tracks:', audioTracks.length);

    if (audioTracks.length === 0) {
      console.error('[system] Nenhuma faixa de áudio retornada no loopback!');
      throw new Error('Nenhuma faixa de áudio do sistema encontrada.');
    }

    return displayStream;
  };

  // Start Meeting Audio Capture (Dual Source Mixer)
  const startCapture = async (
    meetingId: string,
    deviceId?: string,
    withSystemAudio: boolean = captureSystemAudio
  ) => {
    activeMeetingIdRef.current = meetingId;
    consecutiveSilentSystemChunks.current = 0;
    setHasSystemAudioWarning(false);
    setIsSystemAudioActive(false);

    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // 1. Source A: Microphone
      let micStream: MediaStream | null = null;
      try {
        micStream = await acquireMicrophoneStream(deviceId);
        micStreamRef.current = micStream;
      } catch (micErr) {
        console.error('[mic] Erro ao obter microfone:', micErr);
        throw micErr;
      }

      // 2. Source B: System Audio Loopback (if enabled)
      let sysStream: MediaStream | null = null;
      if (withSystemAudio) {
        try {
          sysStream = await acquireSystemAudioStream();
          systemStreamRef.current = sysStream;
        } catch (sysErr) {
          console.warn('[system] Não foi possível obter loopback:', sysErr);
          setHasSystemAudioWarning(true);
        }
      }

      // 3. Create Web Audio Mixer Graph
      // Merger with 2 inputs (Channel 0: Mic, Channel 1: System Audio)
      const merger = audioContext.createChannelMerger(2);

      // Mic branch
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSourceNodeRef.current = micSource;
      const micGainNode = audioContext.createGain();
      micGainNode.gain.value = micGain;
      micGainNodeRef.current = micGainNode;
      micSource.connect(micGainNode);
      micGainNode.connect(merger, 0, 0); // connect to channel 0

      // System branch
      if (sysStream) {
        const sysSource = audioContext.createMediaStreamSource(sysStream);
        systemSourceNodeRef.current = sysSource;
        const sysGainNode = audioContext.createGain();
        sysGainNode.gain.value = systemGain;
        systemGainNodeRef.current = sysGainNode;
        sysSource.connect(sysGainNode);
        sysGainNode.connect(merger, 0, 1); // connect to channel 1
      }

      console.log(`[mixer] sources connected: mic${sysStream ? ' + system' : ''}`);

      // 4. ScriptProcessorNode for processing and mixing
      // 4096 samples buffer gives ~85ms at 48kHz
      const processor = audioContext.createScriptProcessor(4096, 2, 1);
      processorNodeRef.current = processor;

      merger.connect(processor);

      // Connect processor to destination so processing loop runs,
      // but zero out output so user's speakers don't echo!
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const micData = e.inputBuffer.getChannelData(0);
        const sysData = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : new Float32Array(micData.length);

        // Calculate Mic RMS & VU meter
        let sumMic = 0;
        for (let i = 0; i < micData.length; i++) {
          sumMic += micData[i] * micData[i];
        }
        const micRms = Math.sqrt(sumMic / micData.length);
        const micLevel = Math.min(100, Math.round(micRms * 280));
        setMicVolumeLevel(micLevel);

        // Calculate System Audio RMS & VU meter
        let sumSys = 0;
        for (let i = 0; i < sysData.length; i++) {
          sumSys += sysData[i] * sysData[i];
        }
        const sysRms = Math.sqrt(sumSys / sysData.length);
        const sysLevel = Math.min(100, Math.round(sysRms * 280));
        setSystemVolumeLevel(sysLevel);

        // System audio activity tracking
        if (withSystemAudio && sysStream) {
          if (sysLevel > 2) {
            consecutiveSilentSystemChunks.current = 0;
            setIsSystemAudioActive(true);
            setHasSystemAudioWarning(false);
          } else {
            consecutiveSilentSystemChunks.current++;
            // If silent for ~10 seconds (~115 chunks at 85ms)
            if (consecutiveSilentSystemChunks.current > 115) {
              setHasSystemAudioWarning(true);
            }
          }
        }

        // 5. Mix both sources into a single mono stream
        const mixed = new Float32Array(micData.length);
        for (let i = 0; i < micData.length; i++) {
          // Weighted sum of both channels
          mixed[i] = micData[i] * micGain + sysData[i] * systemGain;
        }

        // Prevent echo out of local speaker: zero the speaker output buffer
        const output = e.outputBuffer.getChannelData(0);
        output.fill(0);

        // 6. Dynamic speaker tag identification
        // If mic is dominant -> 'Eu'
        // If system audio (Google Meet remote participant or YouTube) is dominant -> 'Cliente'
        let dynamicSpeaker: 'Cliente' | 'Eu' = currentSpeaker;
        if (micRms > 0.012 && micRms > sysRms * 1.3) {
          dynamicSpeaker = 'Eu';
        } else if (sysRms > 0.012 && sysRms > micRms * 1.3) {
          dynamicSpeaker = 'Cliente';
        }

        // 7. Downsample mixed audio to 16000Hz Float32 mono
        const downsampled = downsampleBuffer(mixed, audioContext.sampleRate, 16000);

        if (downsampled.length > 0 && window.electronAPI && activeMeetingIdRef.current) {
          // Convert Float32Array to base64
          const buffer = new Uint8Array(downsampled.buffer);
          let binary = '';
          const len = buffer.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(buffer[i]);
          }
          const base64 = btoa(binary);

          window.electronAPI.sendAudioChunk({
            meetingId: activeMeetingIdRef.current,
            pcmBase64: base64,
            sampleRate: 16000,
            speakerTag: dynamicSpeaker,
          });
        }
      };

      console.log('[mixer] output active, feeding pipeline');
      setIsCapturing(true);
    } catch (err) {
      console.error('Falha ao iniciar captura de áudio mista:', err);
      stopCapture();
      throw err;
    }
  };

  // Stop active capture
  const stopCapture = () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (micSourceNodeRef.current) {
      micSourceNodeRef.current.disconnect();
      micSourceNodeRef.current = null;
    }
    if (systemSourceNodeRef.current) {
      systemSourceNodeRef.current.disconnect();
      systemSourceNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((t) => t.stop());
      systemStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsCapturing(false);
    setMicVolumeLevel(0);
    setSystemVolumeLevel(0);
    setIsSystemAudioActive(false);
  };

  // ----------------------------------------------------------------
  // Test Functions for Pre-Meeting Setup Screen
  // ----------------------------------------------------------------
  const startTestMicrophone = async () => {
    stopTests();
    setIsTestingMic(true);
    try {
      const stream = await acquireMicrophoneStream();
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!micStreamRef.current) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        setMicVolumeLevel(Math.min(100, Math.round((avg / 128) * 100)));
        requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (err) {
      console.error('Erro ao testar microfone:', err);
      setIsTestingMic(false);
    }
  };

  const startTestSystemAudio = async () => {
    stopTests();
    setIsTestingSystem(true);
    setHasSystemAudioWarning(false);
    try {
      const stream = await acquireSystemAudioStream();
      systemStreamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!systemStreamRef.current) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const level = Math.min(100, Math.round((avg / 128) * 100));
        setSystemVolumeLevel(level);
        if (level > 2) {
          setIsSystemAudioActive(true);
        }
        requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (err) {
      console.error('Erro ao testar áudio do sistema:', err);
      setIsTestingSystem(false);
      setHasSystemAudioWarning(true);
    }
  };

  const stopTests = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((t) => t.stop());
      systemStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setIsTestingSystem(false);
    setMicVolumeLevel(0);
    setSystemVolumeLevel(0);
  };

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    captureSystemAudio,
    setCaptureSystemAudio,
    isCapturing,
    micVolumeLevel,
    systemVolumeLevel,
    isSystemAudioActive,
    hasSystemAudioWarning,
    currentSpeaker,
    setCurrentSpeaker,
    micGain,
    setMicGain,
    systemGain,
    setSystemGain,
    startCapture,
    stopCapture,
    refreshDevices,
    startTestMicrophone,
    startTestSystemAudio,
    stopTests,
    isTestingMic,
    isTestingSystem,
  };
}

// Downsampling buffer linear interpolation
function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, targetSampleRate: number): Float32Array {
  if (inputSampleRate === targetSampleRate) return buffer;
  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const origIndex = i * ratio;
    const indexLow = Math.floor(origIndex);
    const indexHigh = Math.min(indexLow + 1, buffer.length - 1);
    const fraction = origIndex - indexLow;
    result[i] = buffer[indexLow] * (1 - fraction) + buffer[indexHigh] * fraction;
  }
  return result;
}
