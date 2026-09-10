import { app, BrowserWindow, ipcMain, globalShortcut, desktopCapturer, session } from 'electron';
import path from 'path';
import dotenv from 'dotenv';
import { SessionStorage } from './services/session-storage';
import { MeetingManager } from './services/meeting-manager';
import { detectHardware } from './services/hardware-detector';
import { OllamaProvider } from './services/ai-provider';
import { RemoteMeetingTransport, RemoteMeetingTransportConfig } from './services/meeting-server-transport';

dotenv.config();

let mainWindow: BrowserWindow | null = null;
let meetingManager: MeetingManager | null = null;
let storage: SessionStorage | null = null;
let remoteMeetingTransport: RemoteMeetingTransport | null = null;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

function setupDisplayMediaCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      console.log('[system] setDisplayMediaRequestHandler interceptado...');
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      if (sources && sources.length > 0) {
        console.log(`[system] Captura de loopback autorizada para a tela: ${sources[0].name} (audio: 'loopback')`);
        callback({
          video: sources[0],
          audio: 'loopback',
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

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') return callback(true);
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
  remoteMeetingTransport = new RemoteMeetingTransport((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('meeting-server:event', event);
  });

  setupIpc();
  setupHotkeys();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    remoteMeetingTransport?.disconnect();
    mainWindow = null;
  });
}

function setupIpc() {
  if (!meetingManager || !storage) return;

  ipcMain.handle('hardware:get-info', async () => await detectHardware());

  ipcMain.handle('ollama:get-models', async () => {
    const ollama = new OllamaProvider();
    const available = await ollama.isAvailable();
    if (available) return { available: true, models: await ollama.getAvailableModels() };
    return { available: false, models: [] };
  });

  ipcMain.handle('meeting-server:configure', async (_event, config: RemoteMeetingTransportConfig) => {
    remoteMeetingTransport?.configure(config);
    return { success: true };
  });

  ipcMain.handle('meeting-server:disconnect', async () => {
    remoteMeetingTransport?.disconnect();
    return { success: true };
  });

  ipcMain.handle('meeting:start', async (_event, config) => await meetingManager!.startMeeting(config));
  ipcMain.handle('meeting:pause', async () => meetingManager!.pauseMeeting());
  ipcMain.handle('meeting:resume', async () => meetingManager!.pauseMeeting());
  ipcMain.handle('meeting:finish', async () => await meetingManager!.finishMeeting());

  ipcMain.handle('meeting:send-audio', async (_event, chunk: { meetingId: string; pcmBase64: string; sampleRate: number; speakerTag?: string }) => {
    try {
      const rawBuffer = Buffer.from(chunk.pcmBase64, 'base64');
      const float32 = new Float32Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength / 4);

      if (remoteMeetingTransport?.isConfiguredFor(chunk.meetingId)) {
        const sent = remoteMeetingTransport.sendFloat32(float32, chunk.speakerTag || 'Participante');
        return { received: true, remote: true, sent };
      }

      meetingManager!.handleAudioChunk(float32, chunk.speakerTag || 'Cliente');
      return { received: true, remote: false, sent: true };
    } catch (error) {
      console.error('[audio] Falha ao encaminhar chunk:', error);
      return { received: false, remote: false, sent: false };
    }
  });

  ipcMain.handle('copilot:ask', async (_event, query: string) => await meetingManager!.askCopilot(query));
  ipcMain.handle('copilot:help-objection', async () => await meetingManager!.helpWithObjection());
  ipcMain.handle('copilot:what-should-i-ask', async () => await meetingManager!.whatShouldIAskNow());
  ipcMain.handle('copilot:trigger-analysis', async () => await meetingManager!.runIncrementalAnalysis());
  ipcMain.handle('copilot:bookmark-moment', async (_event, note?: string) => meetingManager!.bookmarkCurrentMoment(note));

  ipcMain.handle('meeting:open-folder', async (_event, meetingId: string) => {
    meetingManager!.openMeetingFolder(meetingId);
    return { success: true };
  });
  ipcMain.handle('meeting:list-past', async () => meetingManager!.listPastMeetings());
}

function setupHotkeys() {
  globalShortcut.register('CommandOrControl+Space', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('hotkey:triggered', 'ask_now');
  });
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('hotkey:triggered', 'help_objection');
  });
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('hotkey:triggered', 'bookmark_moment');
  });
}

app.whenReady().then(() => {
  setupDisplayMediaCapture();
  createWindow();
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  remoteMeetingTransport?.disconnect();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  remoteMeetingTransport?.disconnect();
});
