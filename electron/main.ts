import { app, BrowserWindow, ipcMain, globalShortcut, desktopCapturer, session } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { SessionStorage } from './services/session-storage';
import { MeetingManager } from './services/meeting-manager';
import { detectHardware } from './services/hardware-detector';
import { OllamaProvider } from './services/ai-provider';

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let meetingManager: MeetingManager | null = null;
let storage: SessionStorage | null = null;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

function setupDisplayMediaCapture() {
  // Handler oficial do Electron para captura de loopback de áudio do sistema (Windows)
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      console.log('[system] setDisplayMediaRequestHandler interceptado...');
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (sources && sources.length > 0) {
        console.log(`[system] Captura de loopback autorizada para a tela: ${sources[0].name} (audio: 'loopback')`);
        callback({
          video: sources[0],
          audio: 'loopback', // Captura o som dos speakers sem mutar a reprodução do usuário
        });
      } else {
        console.warn('[system] Nenhuma fonte de tela encontrada para loopback.');
        callback({});
      }
    } catch (err) {
      console.error('[system] Erro em setDisplayMediaRequestHandler:', err);
      callback({});
    }
  });

  // Conceder permissões para mídia e captura de tela/sistema sem popups
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
      return callback(true);
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler(() => true);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 700,
    title: 'Noryn Meeting Copilot',
    backgroundColor: '#0b111e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  storage = new SessionStorage();
  meetingManager = new MeetingManager(mainWindow, storage);
  meetingManager.initialize();

  // Setup IPC Handlers
  setupIpc();

  // Setup Hotkeys
  setupHotkeys();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpc() {
  if (!meetingManager || !storage) return;

  // Hardware & Diagnostic
  ipcMain.handle('hardware:get-info', async () => {
    return await detectHardware();
  });

  ipcMain.handle('ollama:get-models', async () => {
    const ollama = new OllamaProvider();
    const available = await ollama.isAvailable();
    if (available) {
      const models = await ollama.getAvailableModels();
      return { available: true, models };
    }
    return { available: false, models: [] };
  });

  // Meeting Lifecycle
  ipcMain.handle('meeting:start', async (_, config) => {
    return await meetingManager!.startMeeting(config);
  });

  ipcMain.handle('meeting:pause', async () => {
    return meetingManager!.pauseMeeting();
  });

  ipcMain.handle('meeting:resume', async () => {
    return meetingManager!.pauseMeeting();
  });

  ipcMain.handle('meeting:finish', async () => {
    return await meetingManager!.finishMeeting();
  });

  // Audio Pipeline: converts base64 Float32 / PCM chunk
  ipcMain.handle('meeting:send-audio', async (_, chunk: { meetingId: string; pcmBase64: string; sampleRate: number; speakerTag?: string }) => {
    try {
      const rawBuffer = Buffer.from(chunk.pcmBase64, 'base64');
      const float32 = new Float32Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength / 4);
      meetingManager!.handleAudioChunk(float32, chunk.speakerTag || 'Cliente');
      return { received: true };
    } catch {
      return { received: false };
    }
  });

  // Copilot Interactions
  ipcMain.handle('copilot:ask', async (_, query: string) => {
    return await meetingManager!.askCopilot(query);
  });

  ipcMain.handle('copilot:help-objection', async () => {
    return await meetingManager!.helpWithObjection();
  });

  ipcMain.handle('copilot:what-should-i-ask', async () => {
    return await meetingManager!.whatShouldIAskNow();
  });

  ipcMain.handle('copilot:trigger-analysis', async () => {
    return await meetingManager!.runIncrementalAnalysis();
  });

  ipcMain.handle('copilot:bookmark-moment', async (_, note?: string) => {
    return meetingManager!.bookmarkCurrentMoment(note);
  });

  // Explorer / Storage
  ipcMain.handle('meeting:open-folder', async (_, meetingId: string) => {
    meetingManager!.openMeetingFolder(meetingId);
    return { success: true };
  });

  ipcMain.handle('meeting:list-past', async () => {
    return meetingManager!.listPastMeetings();
  });
}

function setupHotkeys() {
  // Global shortcut registrations
  globalShortcut.register('CommandOrControl+Space', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey:triggered', 'ask_now');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey:triggered', 'help_objection');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hotkey:triggered', 'bookmark_moment');
    }
  });
}

app.whenReady().then(() => {
  setupDisplayMediaCapture();
  createWindow();
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
