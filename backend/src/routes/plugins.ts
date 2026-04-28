import { Router } from 'express';
import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, readlinkSync, statSync } from 'fs';
import { join } from 'path';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { pluginVerifier } from '../services/pluginVerifier.js';
import { pluginUpdateService } from '../services/pluginUpdateService.js';
import { pluginRuntimeService } from '../services/pluginRuntimeService.js';
import { pluginLicenseService } from '../services/pluginLicenseService.js';
import { protect, admin, requirePermission } from '../middleware/authMiddleware.js';
import { pluginRouteRegistry } from '../plugins/runtime/routeRegistry.js';

const router = Router();

// Mount dynamic plugin-registered routes under /p/:pluginName/*
router.use('/p', pluginRouteRegistry.router);

// Introspection: list all plugin-registered routes
router.get('/p', protect, admin, (_req, res) => {
  res.json({ routes: pluginRouteRegistry.listRoutes() });
});

// Note: Plugin activation/lifecycle is now handled globally by PluginRuntimeService at startup.

const PLUGIN_REGISTRY_URL = process.env.PLUGIN_REGISTRY_URL || 'https://cdn.shakes.es';
const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || join(process.cwd(), 'data', 'plugins');

const CONFIG_FILE = join(process.cwd(), 'data', 'plugins', 'config.json');
const LICENSE_FILE = join(process.cwd(), '.license-key');

interface PluginConfig {
  licenseKey: string;
  publicKey: string;
  configuredAt?: number;
}

function getPluginConfig(): PluginConfig {
  let fileConfig: PluginConfig = { licenseKey: '', publicKey: '' };
  try {
    if (existsSync(CONFIG_FILE)) {
      fileConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}

  const envLicense = process.env.PLUGIN_LICENSE_KEY || '';
  const envPublicKey = process.env.PLUGIN_PUBLIC_KEY || '';

  let licenseFromFile = '';
  try {
    if (existsSync(LICENSE_FILE)) {
      licenseFromFile = readFileSync(LICENSE_FILE, 'utf-8').trim();
    }
  } catch {}

  return {
    licenseKey: fileConfig.licenseKey || envLicense || licenseFromFile,
    publicKey: fileConfig.publicKey || envPublicKey,
    configuredAt: fileConfig.configuredAt
  };
}

async function getEffectiveLicenseKey(): Promise<string> {
  const fromDb = await pluginLicenseService.getLicenseKey();
  if (fromDb) {
    return fromDb;
  }
  const config = getPluginConfig();
  return config.licenseKey || '';
}

function savePluginConfig(config: PluginConfig): void {
  const dir = join(process.cwd(), 'data', 'plugins');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const installSchema = z.object({
  pluginName: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must use semver format (x.y.z)'),
  capabilities: z.array(z.string()).default([]),
  config: z.record(z.any()).default({})
});

const runSchema = z.object({
  pluginName: z.string().min(1),
  input: z.any().optional(),
});

router.get('/config', protect, async (req: any, res) => {
  const config = getPluginConfig();
  const licenseKey = await getEffectiveLicenseKey();
  res.json({
    configured: !!licenseKey,
    hasPublicKey: !!config.publicKey,
    configuredAt: config.configuredAt
  });
});

router.post('/config', protect, admin, async (req: any, res) => {
  try {
    const { licenseKey, publicKey } = req.body;
    
    if (!licenseKey) {
      return res.status(400).json({ error: 'License key is required' });
    }

    const config: PluginConfig = {
      licenseKey,
      publicKey: publicKey || '',
      configuredAt: Date.now()
    };

    savePluginConfig(config);
    writeFileSync(LICENSE_FILE, licenseKey);
    await pluginLicenseService.setLicenseKey(licenseKey);

    if (publicKey) {
      process.env.PLUGIN_PUBLIC_KEY = publicKey;
    }
    process.env.PLUGIN_LICENSE_KEY = licenseKey;

    res.json({ success: true, message: 'Plugin system configured' });
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

router.get('/status', protect, async (req, res) => {
  try {
    const config = getPluginConfig();
    const licenseKey = await getEffectiveLicenseKey();
    
    if (!licenseKey) {
      return res.json({
        configured: false,
        message: 'License key not configured. Go to Settings → Plugins to configure.'
      });
    }

    let publicKeyAvailable = !!config.publicKey;
    try {
      // Fast timeout to avoid freezing UI for offline instances
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/signing/public-key`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const publicKeyData = await response.json();
        publicKeyAvailable = !!publicKeyData.publicKey;
      }
    } catch (networkError) {
      console.warn('[Offline Mode] Could not connect to registry, using localized fallback state.');
    }

    res.json({
      configured: true,
      lastUpdateCheck: pluginUpdateService.getLastCheckTime(),
      publicKeyAvailable,
      cacheDir: PLUGIN_CACHE_DIR
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.post('/register', protect, admin, async (req, res) => {
  try {
    const { cloudName, cloudUrl, adminEmail, adminName } = req.body;

    const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/licensing/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloudName,
        cloudUrl,
        adminEmail,
        adminName,
        termsAccepted: true
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register cloud' });
  }
});

router.post('/activate', protect, admin, async (req, res) => {
  try {
    const { registrationToken, instanceId } = req.body;

    const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/licensing/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationToken, instanceId })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    writeFileSync(
      LICENSE_FILE,
      data.licenseKey
    );

    const current = getPluginConfig();
    savePluginConfig({
      licenseKey: data.licenseKey,
      publicKey: current.publicKey || '',
      configuredAt: Date.now()
    });

    res.json(data);
  } catch (error) {
    console.error('Activate error:', error);
    res.status(500).json({ error: 'Failed to activate cloud' });
  }
});

router.get('/available', protect, async (req, res) => {
  try {
    const licenseKey = await getEffectiveLicenseKey();
    if (!licenseKey) {
      return res.status(401).json({ error: 'License not configured' });
    }

    const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/instances/plugins`, {
      headers: { 'X-License-Key': licenseKey }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch plugins' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Available plugins error:', error);
    res.status(500).json({ error: 'Failed to get available plugins' });
  }
});

router.get('/installed', protect, async (req, res) => {
  try {
    if (!existsSync(PLUGIN_CACHE_DIR)) {
      return res.json({ plugins: [] });
    }

    const plugins: any[] = [];
    const entries = readdirSync(PLUGIN_CACHE_DIR);

    for (const entry of entries) {
      const pluginDir = join(PLUGIN_CACHE_DIR, entry);
      if (!statSync(pluginDir).isDirectory()) continue;
      
      const activeLink = join(pluginDir, 'active');
      const isActive = existsSync(activeLink);

      const versions = readdirSync(pluginDir)
        .filter(v => {
          if (v === 'active' || v === 'cache-meta.json' || v === 'manifest.json') return false;
          try { return statSync(join(pluginDir, v)).isDirectory(); } catch { return false; }
        })
        .sort()
        .reverse();
      
      if (versions.length === 0 && !isActive) continue;

      const latestVersion = isActive ? 'active' : versions[0];
      const targetDir = join(pluginDir, latestVersion);
      const manifestPath = join(targetDir, 'manifest.json');
      const runtimeManifestPath = join(targetDir, 'plugin.json');

      if (!existsSync(manifestPath)) continue;

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      let runtimeManifest: any = null;
      try {
        if (existsSync(runtimeManifestPath)) {
          runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf-8'));
        }
      } catch {
        runtimeManifest = null;
      }

      plugins.push({
        name: manifest.name || entry,
        displayName: manifest.displayName || manifest.name || entry,
        currentVersion: isActive ? manifest.version : null,
        versions,
        isActive,
        capabilities: manifest.capabilities || [],
        slots: runtimeManifest?.slots || [],
        downloadedAt: manifest.downloadedAt
      });
    }

    res.json({ plugins });
  } catch (error) {
    console.error('Installed plugins error:', error);
    res.status(500).json({ error: 'Failed to get installed plugins' });
  }
});

router.get('/logs', protect, async (req, res) => {
  try {
    res.json({ logs: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to empty logs' });
  }
});

router.get('/sidebar', protect, async (_req: any, res) => {
  try {
    if (!existsSync(PLUGIN_CACHE_DIR)) {
      return res.json({ widgets: [] });
    }

    const widgets: Array<{ pluginName: string; html: string; styles?: string }> = [];
    const entries = readdirSync(PLUGIN_CACHE_DIR);

    for (const entry of entries) {
      const pluginDir = join(PLUGIN_CACHE_DIR, entry);
      const activeLink = join(pluginDir, 'active');
      if (!existsSync(activeLink)) continue;

      let activeVersion = '';
      try {
        activeVersion = readlinkSync(activeLink).replace(/\\/g, '/').split('/').pop() || '';
      } catch {
        continue;
      }
      if (!activeVersion) continue;

      const runtimeManifestPath = join(pluginDir, activeVersion, 'plugin.json');
      let runtimeEntryPoint = 'index.js';
      try {
        if (existsSync(runtimeManifestPath)) {
          const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf-8'));
          if (runtimeManifest?.entryPoint && typeof runtimeManifest.entryPoint === 'string') {
            runtimeEntryPoint = runtimeManifest.entryPoint;
          }
        }
      } catch {
        runtimeEntryPoint = 'index.js';
      }

      const entryPoint = join(pluginDir, activeVersion, runtimeEntryPoint);
      if (!existsSync(entryPoint)) continue;

      try {
        const mod = require(entryPoint);
        let runtimeExport = mod?.default || mod;

        // Support for Class-based SDK (both Class and Instance)
        if (runtimeExport && runtimeExport.isShakesPlugin) {
          if (typeof runtimeExport === 'function') {
            const instance = new runtimeExport(entry);
            runtimeExport = instance.export();
          } else {
            runtimeExport = runtimeExport.export();
          }
        }

        // Note: Activation (onActivate) is now handled globally by PluginRuntimeService
        // at startup or installation. We only render slots here.

        const sidebarHandler = runtimeExport?.slots?.sidebar;
        if (typeof sidebarHandler !== 'function') continue;

        const result = await Promise.resolve(sidebarHandler());
        if (!result || typeof result.html !== 'string') continue;

        widgets.push({
          pluginName: entry,
          html: result.html,
          styles: typeof result.styles === 'string' ? result.styles : undefined,
        });
      } catch (error) {
        console.warn(`[Plugins] Failed to render sidebar slot for ${entry}:`, error);
      }
    }

    res.json({ widgets });
  } catch (error) {
    console.error('Sidebar widgets error:', error);
    res.status(500).json({ error: 'Failed to load sidebar widgets' });
  }
});

router.get('/page/:pluginName', protect, async (req: any, res) => {
  try {
    const { pluginName } = req.params;
    const pluginDir = join(PLUGIN_CACHE_DIR, pluginName);
    const activeLink = join(pluginDir, 'active');
    
    if (!existsSync(activeLink)) {
       return res.status(404).json({ error: 'Plugin not active' });
    }

    let activeVersion = '';
    try {
      activeVersion = readlinkSync(activeLink).replace(/\\/g, '/').split('/').pop() || '';
    } catch {
      return res.status(404).json({ error: 'Plugin active version not found' });
    }
    if (!activeVersion) return res.status(404).json({ error: 'Plugin active version invalid' });

    const runtimeManifestPath = join(pluginDir, activeVersion, 'plugin.json');
    let runtimeEntryPoint = 'index.js';
    try {
      if (existsSync(runtimeManifestPath)) {
        const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf-8'));
        if (runtimeManifest?.entryPoint && typeof runtimeManifest.entryPoint === 'string') {
          runtimeEntryPoint = runtimeManifest.entryPoint;
        }
      }
    } catch {
      runtimeEntryPoint = 'index.js';
    }

    const entryPoint = join(pluginDir, activeVersion, runtimeEntryPoint);
    if (!existsSync(entryPoint)) return res.status(404).json({ error: 'Entry point not found' });

    try {
      const mod = require(entryPoint);
      let runtimeExport = mod?.default || mod;

      // Support for Class-based SDK (both Class and Instance)
      if (runtimeExport && runtimeExport.isShakesPlugin) {
        if (typeof runtimeExport === 'function') {
          const instance = new runtimeExport(pluginName);
          runtimeExport = instance.export();
        } else {
          runtimeExport = runtimeExport.export();
        }
      }

      const pageHandler = runtimeExport?.slots?.page;
      
      if (typeof pageHandler !== 'function') {
        return res.status(404).json({ error: 'Plugin does not export a page slot' });
      }

      const result = await Promise.resolve(pageHandler());
      if (!result || typeof result.html !== 'string') {
         return res.status(500).json({ error: 'Page handler did not return valid html string' });
      }

      // Return the page html
      return res.json({
        html: result.html,
        styles: typeof result.styles === 'string' ? result.styles : undefined,
      });

    } catch (error) {
      console.warn(`[Plugins] Failed to render page slot for ${pluginName}:`, error);
      return res.status(500).json({ error: 'Failed to execute page slot handler' });
    }
  } catch (error) {
    console.error(`Page slot error for ${req.params.pluginName}:`, error);
    res.status(500).json({ error: 'Failed to load page slot' });
  }
});

router.post('/install', protect, requirePermission('manage_plugins'), async (req, res) => {
  try {
    const data = installSchema.parse(req.body);
    const licenseKey = await getEffectiveLicenseKey();

    // Prefer licensed endpoint, but allow public marketplace metadata fallback
    // so local runtime activation still works after CDN instance install flow.
    let response: Response | null = null;

    if (licenseKey) {
      response = await fetch(
        `${PLUGIN_REGISTRY_URL}/api/instances/plugins/${data.pluginName}/${data.version}`,
        { headers: { 'X-License-Key': licenseKey } }
      );
    }

    // Fallback when license is missing/invalid or the instance endpoint is unavailable.
    if (!response || !response.ok) {
      if (!response || [401, 403, 404].includes(response.status)) {
        response = await fetch(
          `${PLUGIN_REGISTRY_URL}/api/plugins/${data.pluginName}/${data.version}`
        );
      }
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: response.status === 404 ? 'Plugin not found' : 'Failed to fetch plugin metadata',
      });
    }

    const rawInfo = await response.json();
    const pluginInfo = {
      name: rawInfo.name || rawInfo.pluginName || data.pluginName,
      displayName: rawInfo.displayName || rawInfo.pluginName || data.pluginName,
      version: rawInfo.version || data.version,
      downloadUrl: rawInfo.downloadUrl,
      checksum: rawInfo.checksum,
      signature: rawInfo.signature,
      licenseJwt: rawInfo.licenseJwt, // Extract for offline use
      capabilities: rawInfo.capabilities || [],
      runtime: rawInfo.runtime || 'js',
      entryPoint: rawInfo.entryPoint || 'index.js',
      memoryLimit: rawInfo.memoryLimit || '128Mi',
      timeout: rawInfo.timeout || 5,
      ioTimeout: rawInfo.ioTimeout || 30,
    };
    const fallbackDownloadUrls = [
      `${PLUGIN_REGISTRY_URL}/api/plugins/${data.pluginName}/download/${data.version}`,
      `${PLUGIN_REGISTRY_URL}/plugins/${data.pluginName}/${data.version}.zip`,
    ];

    if (pluginInfo?.name !== data.pluginName) {
      return res.status(409).json({ error: 'Registry returned mismatched plugin name' });
    }
    if (pluginInfo?.version !== data.version) {
      return res.status(409).json({ error: `Registry returned version ${pluginInfo?.version || 'unknown'} instead of requested ${data.version}` });
    }
    if (!pluginInfo?.checksum || !pluginInfo?.signature || !pluginInfo?.downloadUrl) {
      return res.status(422).json({ error: 'Registry response missing integrity metadata (checksum/signature/downloadUrl)' });
    }

    if (pluginUpdateService.isPluginRevoked(pluginInfo.name, data.version)) {
      return res.status(403).json({ error: 'Plugin version has been revoked' });
    }

    const localPath = await pluginVerifier.installPlugin({
      name: pluginInfo.name,
      displayName: pluginInfo.displayName,
      version: pluginInfo.version,
      downloadUrl: pluginInfo.downloadUrl,
      checksum: pluginInfo.checksum,
      signature: pluginInfo.signature,
      licenseJwt: pluginInfo.licenseJwt,
      capabilities: pluginInfo.capabilities,
      runtime: pluginInfo.runtime,
      entryPoint: pluginInfo.entryPoint,
      memoryLimit: pluginInfo.memoryLimit,
      timeout: pluginInfo.timeout,
      ioTimeout: pluginInfo.ioTimeout,
      downloadUrls: fallbackDownloadUrls,
    });

    pluginVerifier.cleanupOldVersions(data.pluginName);
    await pluginRuntimeService.activatePlugin(pluginInfo.name, pluginInfo.version);

    res.json({
      success: true,
      message: 'Plugin installed and activated successfully',
      path: localPath
    });
  } catch (error: any) {
    console.error('Install error:', error);
    const message = error.message || 'Failed to install plugin';
    if (typeof message === 'string' && message.toLowerCase().includes('failed to download plugin')) {
      return res.status(502).json({
        error: message,
        code: 'ARTIFACT_UNAVAILABLE',
        hint: 'Plugin is installed in marketplace but artifact is missing in CDN. Republish plugin version in registry.',
      });
    }
    res.status(500).json({ error: message });
  }
});

router.post('/uninstall', protect, requirePermission('manage_plugins'), async (req, res) => {
  try {
    const { pluginName } = req.body;

    const pluginDir = join(PLUGIN_CACHE_DIR, pluginName);
    const activeLink = join(pluginDir, 'active');

    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }
    await pluginRuntimeService.deactivatePlugin(pluginName);

    res.json({ success: true, message: 'Plugin uninstalled' });
  } catch (error) {
    console.error('Uninstall error:', error);
    res.status(500).json({ error: 'Failed to uninstall plugin' });
  }
});

router.post('/enable', protect, requirePermission('manage_plugins'), async (req, res) => {
  try {
    const { pluginName, version } = req.body;

    const pluginDir = join(PLUGIN_CACHE_DIR, pluginName);
    const versionDir = join(pluginDir, version);
    const activeLink = join(pluginDir, 'active');

    if (!existsSync(versionDir)) {
      return res.status(404).json({ error: 'Plugin version not installed' });
    }

    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }

    const targetPath = version;
    require('fs').symlinkSync(targetPath, activeLink);
    await pluginRuntimeService.activatePlugin(pluginName, version);

    res.json({ success: true, message: 'Plugin enabled' });
  } catch (error) {
    console.error('Enable error:', error);
    res.status(500).json({ error: 'Failed to enable plugin' });
  }
});

router.post('/disable', protect, requirePermission('manage_plugins'), async (req, res) => {
  try {
    const { pluginName } = req.body;

    const activeLink = join(PLUGIN_CACHE_DIR, pluginName, 'active');

    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }
    await pluginRuntimeService.deactivatePlugin(pluginName);

    res.json({ success: true, message: 'Plugin disabled' });
  } catch (error) {
    console.error('Disable error:', error);
    res.status(500).json({ error: 'Failed to disable plugin' });
  }
});

router.post('/check-updates', protect, requirePermission('manage_plugins'), async (req, res) => {
  try {
    await pluginUpdateService.checkForUpdates();
    res.json({ success: true, lastCheck: pluginUpdateService.getLastCheckTime() });
  } catch (error) {
    console.error('Check updates error:', error);
    res.status(500).json({ error: 'Failed to check updates' });
  }
});

router.post('/run', protect, async (req: any, res) => {
  try {
    const { pluginName, input } = runSchema.parse(req.body);
    const result = await pluginRuntimeService.executePlugin(pluginName, input ?? {});
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Plugin execution failed',
        logs: result.logs || [],
      });
    }

    res.json({
      success: true,
      result: result.result,
      logs: result.logs,
      duration: result.duration,
      memoryUsed: result.memoryUsed,
    });
  } catch (error: any) {
    console.error('Run plugin error:', error);
    res.status(500).json({ error: error.message || 'Failed to run plugin' });
  }
});

router.get('/revocations', protect, requirePermission('manage_plugins'), async (req, res) => {
  try {
    const revocations = pluginUpdateService.getRevocationList();
    res.json({ revocations });
  } catch (error) {
    console.error('Revocations error:', error);
    res.status(500).json({ error: 'Failed to get revocations' });
  }
});

router.get('/modal/:pluginName', protect, async (req: any, res) => {
  try {
    const { pluginName } = req.params;
    const pluginDir = join(PLUGIN_CACHE_DIR, pluginName);
    const activeLink = join(pluginDir, 'active');
    
    if (!existsSync(activeLink)) {
       return res.status(404).json({ error: 'Plugin not active' });
    }

    let activeVersion = '';
    try {
      activeVersion = readlinkSync(activeLink).replace(/\\/g, '/').split('/').pop() || '';
    } catch {
      return res.status(404).json({ error: 'Plugin active version not found' });
    }
    if (!activeVersion) return res.status(404).json({ error: 'Plugin active version invalid' });

    const runtimeManifestPath = join(pluginDir, activeVersion, 'plugin.json');
    let runtimeEntryPoint = 'index.js';
    try {
      if (existsSync(runtimeManifestPath)) {
        const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf-8'));
        if (runtimeManifest?.entryPoint && typeof runtimeManifest.entryPoint === 'string') {
          runtimeEntryPoint = runtimeManifest.entryPoint;
        }
      }
    } catch {
      runtimeEntryPoint = 'index.js';
    }

    const entryPoint = join(pluginDir, activeVersion, runtimeEntryPoint);
    if (!existsSync(entryPoint)) return res.status(404).json({ error: 'Entry point not found' });

    try {
      const mod = require(entryPoint);
      let runtimeExport = mod?.default || mod;

      // Support for Class-based SDK (both Class and Instance)
      if (runtimeExport && runtimeExport.isShakesPlugin) {
        if (typeof runtimeExport === 'function') {
          const instance = new runtimeExport(pluginName);
          runtimeExport = instance.export();
        } else {
          runtimeExport = runtimeExport.export();
        }
      }

      // Note: Activation (onActivate) is now handled by PluginRuntimeService
      
      // Try 'modal' slot first, fallback to 'page' if requested for generic modal use
      const modalHandler = runtimeExport?.slots?.modal || runtimeExport?.slots?.page;
      
      if (typeof modalHandler !== 'function') {
        return res.status(404).json({ error: 'Plugin does not export a modal or page slot' });
      }

      const result = await Promise.resolve(modalHandler());
      if (!result || typeof result.html !== 'string') {
         return res.status(500).json({ error: 'Modal handler did not return valid html string' });
      }

      return res.json({
        html: result.html,
        styles: typeof result.styles === 'string' ? result.styles : undefined,
      });

    } catch (error) {
      console.warn(`[Plugins] Failed to render modal slot for ${pluginName}:`, error);
      return res.status(500).json({ error: 'Failed to execute modal slot handler' });
    }
  } catch (error) {
    console.error(`Modal slot error for ${req.params.pluginName}:`, error);
    res.status(500).json({ error: 'Failed to load modal slot' });
  }
});

// (createPluginApi moved to PluginRuntimeService for unified activation)

// ─── Sideload: Local ZIP Upload ────────────────────────────────────────────────
// POST /api/plugins/upload-zip
// Accepts a multipart ZIP file, validates the manifest inside, and installs
// the plugin locally — bypasses CDN signature verification since the user is
// intentionally uploading their own ZIP directly from their machine.
//
// Expected ZIP structure:
//   my-plugin-1.0.0.zip
//     ├── plugin.json  or  shakes.json   ← required manifest
//     └── index.js                        ← required entry point


const multerMemoryStorage = multer.memoryStorage();
const zipUpload = multer({
  storage: multerMemoryStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB hard limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/zip' && !file.originalname.endsWith('.zip')) {
      return cb(new Error('Only .zip files are accepted'));
    }
    cb(null, true);
  }
});

router.post('/upload-zip', protect, requirePermission('manage_plugins'), zipUpload.single('plugin'), async (req: any, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Please attach a .zip file with the field name "plugin".' });
  }

  try {
    const zip = new AdmZip(req.file.buffer);
    const entries = zip.getEntries().map(e => e.entryName);

    // ── Locate manifest (plugin.json or shakes.json) ──
    const manifestEntry =
      zip.getEntry('plugin.json') ||
      zip.getEntry('shakes.json') ||
      zip.getEntries().find(e => e.entryName.endsWith('/plugin.json') || e.entryName.endsWith('/shakes.json'));

    if (!manifestEntry) {
      return res.status(400).json({
        error: 'Invalid plugin ZIP: missing manifest file. The ZIP must contain a "plugin.json" or "shakes.json" at the root or in a single subdirectory.',
        foundFiles: entries.slice(0, 20),
      });
    }

    let manifest: any;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
    } catch {
      return res.status(400).json({ error: 'Manifest file is not valid JSON.' });
    }

    // ── Validate required manifest fields ──
    if (!manifest.name || typeof manifest.name !== 'string') {
      return res.status(400).json({ error: 'Manifest is missing required field "name".' });
    }
    if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      return res.status(400).json({ error: 'Manifest has an invalid or missing "version" field. Use semver (e.g. 1.0.0).' });
    }

    // Sanitize plugin name to prevent directory traversal
    const pluginName = manifest.name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    const pluginVersion = manifest.version;
    const pluginDir = join(PLUGIN_CACHE_DIR, pluginName, pluginVersion);

    // Prevent double-installation
    const alreadyInstalled = existsSync(pluginDir);
    if (alreadyInstalled) {
      return res.status(409).json({
        error: `Plugin "${pluginName}@${pluginVersion}" is already installed locally. Uninstall it first to reinstall.`,
        installed: true,
      });
    }

    // ── Extract ZIP to plugin cache directory ──
    mkdirSync(pluginDir, { recursive: true });

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;

      // Strip leading subdir if ZIP was packed with a wrapper folder (common pattern)
      let relativePath = entry.entryName;
      const parts = relativePath.split('/');
      if (parts.length > 1) {
        // Detect single-folder wrapper: all entries share the same root folder
        const rootFolder = zip.getEntries().find(e => e.isDirectory && e.entryName.split('/').length === 2);
        if (rootFolder && relativePath.startsWith(rootFolder.entryName)) {
          relativePath = relativePath.slice(rootFolder.entryName.length);
        }
      }

      // Security: prevent path traversal inside ZIP
      const targetPath = join(pluginDir, relativePath);
      if (!targetPath.startsWith(pluginDir)) {
        console.warn(`[sideload] Skipping suspicious path: ${entry.entryName}`);
        continue;
      }

      const dir = join(targetPath, '..');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(targetPath, entry.getData());
    }

    // ── Write a local sideload marker so the runtime knows this was installed manually ──
    writeFileSync(join(pluginDir, '.sideloaded'), JSON.stringify({
      sideloadedAt: new Date().toISOString(),
      sideloadedBy: req.user?.id || 'unknown',
      originalFilename: req.file.originalname,
      bypassedSignatureVerification: true,
    }));

    // ── Write manifest.json to the plugin dir for runtime discovery ──
    writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
      ...manifest,
      name: pluginName,
      version: pluginVersion,
      sideloaded: true,
      installedAt: new Date().toISOString(),
    }, null, 2));

    // ── Attempt to activate plugin via runtime service ──
    let activationError: string | null = null;
    try {
      const entryPoint = manifest.entryPoint || 'index.js';
      const entryFile = join(pluginDir, entryPoint);

      if (existsSync(entryFile)) {
        // Use the sideload-specific activator that bypasses CDN verification
        await pluginRuntimeService.activateSideloadedPlugin(pluginName, pluginVersion);
      } else {
        activationError = `Entry point "${entryPoint}" not found in the extracted ZIP. Plugin installed but not activated.`;
      }
    } catch (err: any) {
      activationError = `Plugin installed but could not be activated: ${err?.message || 'Unknown runtime error'}`;
      console.warn(`[sideload] Activation failed for ${pluginName}:`, err);
    }

    return res.status(201).json({
      success: true,
      sideloaded: true,
      pluginName,
      version: pluginVersion,
      displayName: manifest.displayName || pluginName,
      description: manifest.description || '',
      installedAt: new Date().toISOString(),
      activationWarning: activationError,
      message: activationError
        ? `Plugin "${manifest.displayName || pluginName}" installed with a warning. ${activationError}`
        : `Plugin "${manifest.displayName || pluginName}" v${pluginVersion} installed and activated successfully.`,
    });
  } catch (err: any) {
    console.error('[sideload] Unexpected error:', err);
    return res.status(500).json({ error: `Failed to process plugin ZIP: ${err?.message || 'Internal error'}` });
  }
});

export default router;
