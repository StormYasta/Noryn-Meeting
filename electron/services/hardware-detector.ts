import { exec } from 'child_process';
import os from 'os';
import { HardwareInfo, HardwareProfile } from '../../src/types/meeting';

export async function detectHardware(): Promise<HardwareInfo> {
  const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const cpus = os.cpus();
  const cpuName = cpus[0]?.model || 'CPU padrão';
  const cores = cpus.length;

  let gpuName = 'Integrada / CPU';
  let vramGB = 0;
  let hasCuda = false;

  if (process.platform === 'win32') {
    try {
      const gpuData = await new Promise<string>((resolve) => {
        exec(
          'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json"',
          { timeout: 4000 },
          (err, stdout) => {
            if (err || !stdout) return resolve('');
            resolve(stdout.trim());
          }
        );
      });

      if (gpuData) {
        try {
          const parsed = JSON.parse(gpuData);
          const controllers = Array.isArray(parsed) ? parsed : [parsed];
          for (const c of controllers) {
            const name = c.Name || '';
            const ramBytes = Number(c.AdapterRAM) || 0;
            const currentVram = Math.round(ramBytes / (1024 * 1024 * 1024));
            
            if (name.toLowerCase().includes('nvidia') || name.toLowerCase().includes('geforce') || name.toLowerCase().includes('rtx') || name.toLowerCase().includes('gtx')) {
              gpuName = name;
              vramGB = Math.max(vramGB, currentVram || 2);
              hasCuda = true;
              break;
            } else if (name.toLowerCase().includes('radeon') || name.toLowerCase().includes('amd')) {
              gpuName = name;
              vramGB = Math.max(vramGB, currentVram);
            } else if (!gpuName || gpuName.includes('Integrada')) {
              gpuName = name;
              vramGB = Math.max(vramGB, currentVram);
            }
          }
        } catch {
          // Ignore JSON parse error
        }
      }
    } catch {
      // Fallback
    }
  }

  // Profile selection logic
  let suggestedProfile: HardwareProfile = 'light';
  if (vramGB >= 6 || (hasCuda && vramGB >= 4)) {
    suggestedProfile = 'quality';
  } else if (vramGB >= 2 || totalRamGB >= 12) {
    suggestedProfile = 'balanced';
  } else {
    suggestedProfile = 'light';
  }

  return {
    gpuName,
    vramGB,
    cpuName,
    cores,
    ramGB: totalRamGB,
    suggestedProfile,
    hasCuda,
  };
}
