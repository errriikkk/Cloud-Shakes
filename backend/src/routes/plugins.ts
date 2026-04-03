import { Router } from 'express';
import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { pluginVerifier } from '../services/pluginVerifier.js';
import { pluginUpdateService } from '../services/pluginUpdateService.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = Router();

const PLUGIN_REGISTRY_URL = process.env.PLUGIN_REGISTRY_URL || 'https://cdn.shakes.es';
const PLUGIN_CACHE_DIR = process.env.PLUGIN_CACHE_DIR || join(process.cwd(), 'data', 'plugins');

const CONFIG_FILE = join(process.cwd(), 'data', 'plugins', 'config.json');

interface PluginConfig {
  licenseKey: string;
  publicKey: string;
  configuredAt?: number;
}

function getPluginConfig(): PluginConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return { licenseKey: '', publicKey: '' };
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

router.get('/config', protect, async (req: any, res) => {
  const config = getPluginConfig();
  res.json({
    configured: !!config.licenseKey,
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

router.get('/status', async (req, res) => {
  try {
    const config = getPluginConfig();
    
    if (!config.licenseKey) {
      return res.json({
        configured: false,
        message: 'License key not configured. Go to Settings → Plugins to configure.'
      });
    }

    const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/signing/public-key`);
    const publicKeyData = await response.json();

    res.json({
      configured: true,
      lastUpdateCheck: pluginUpdateService.getLastCheckTime(),
      publicKeyAvailable: !!publicKeyData.publicKey,
      cacheDir: PLUGIN_CACHE_DIR
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.post('/register', async (req, res) => {
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

router.post('/activate', async (req, res) => {
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
      join(process.cwd(), '.license-key'),
      data.licenseKey
    );

    res.json(data);
  } catch (error) {
    console.error('Activate error:', error);
    res.status(500).json({ error: 'Failed to activate cloud' });
  }
});

router.get('/available', async (req, res) => {
  try {
    if (!getPluginConfig().licenseKey) {
      return res.status(401).json({ error: 'License not configured' });
    }

    const response = await fetch(`${PLUGIN_REGISTRY_URL}/api/instances/plugins`, {
      headers: { 'X-License-Key': getPluginConfig().licenseKey }
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

router.get('/installed', async (req, res) => {
  try {
    if (!existsSync(PLUGIN_CACHE_DIR)) {
      return res.json({ plugins: [] });
    }

    const plugins: any[] = [];
    const entries = readdirSync(PLUGIN_CACHE_DIR);

    for (const entry of entries) {
      const pluginDir = join(PLUGIN_CACHE_DIR, entry);
      const manifestPath = join(pluginDir, 'manifest.json');
      const activeLink = join(pluginDir, 'active');

      if (!existsSync(manifestPath)) continue;

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const isActive = existsSync(activeLink);

      const versions = readdirSync(pluginDir)
        .filter(v => v !== 'active' && v !== 'cache-meta.json' && v !== 'manifest.json')
        .sort()
        .reverse();

      plugins.push({
        name: manifest.name,
        displayName: manifest.displayName,
        currentVersion: isActive ? manifest.version : null,
        versions,
        isActive,
        capabilities: manifest.capabilities,
        downloadedAt: manifest.downloadedAt
      });
    }

    res.json({ plugins });
  } catch (error) {
    console.error('Installed plugins error:', error);
    res.status(500).json({ error: 'Failed to get installed plugins' });
  }
});

router.post('/install', async (req, res) => {
  try {
    const data = installSchema.parse(req.body);

    if (!getPluginConfig().licenseKey) {
      return res.status(401).json({ error: 'License not configured' });
    }

    const response = await fetch(
      `${PLUGIN_REGISTRY_URL}/api/instances/plugins/${data.pluginName}/${data.version}`,
      { headers: { 'X-License-Key': getPluginConfig().licenseKey } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Plugin not found' });
    }

    const pluginInfo = await response.json();

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
      capabilities: pluginInfo.capabilities,
      runtime: pluginInfo.runtime,
      entryPoint: pluginInfo.entryPoint,
      memoryLimit: pluginInfo.memoryLimit,
      timeout: pluginInfo.timeout,
      ioTimeout: pluginInfo.ioTimeout
    });

    pluginVerifier.cleanupOldVersions(data.pluginName);

    res.json({
      success: true,
      message: 'Plugin installed successfully',
      path: localPath
    });
  } catch (error: any) {
    console.error('Install error:', error);
    res.status(500).json({ error: error.message || 'Failed to install plugin' });
  }
});

router.post('/uninstall', async (req, res) => {
  try {
    const { pluginName } = req.body;

    const pluginDir = join(PLUGIN_CACHE_DIR, pluginName);
    const activeLink = join(pluginDir, 'active');

    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }

    res.json({ success: true, message: 'Plugin uninstalled' });
  } catch (error) {
    console.error('Uninstall error:', error);
    res.status(500).json({ error: 'Failed to uninstall plugin' });
  }
});

router.post('/enable', async (req, res) => {
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

    const targetPath = join('..', version);
    require('fs').symlinkSync(targetPath, activeLink);

    res.json({ success: true, message: 'Plugin enabled' });
  } catch (error) {
    console.error('Enable error:', error);
    res.status(500).json({ error: 'Failed to enable plugin' });
  }
});

router.post('/disable', async (req, res) => {
  try {
    const { pluginName } = req.body;

    const activeLink = join(PLUGIN_CACHE_DIR, pluginName, 'active');

    if (existsSync(activeLink)) {
      unlinkSync(activeLink);
    }

    res.json({ success: true, message: 'Plugin disabled' });
  } catch (error) {
    console.error('Disable error:', error);
    res.status(500).json({ error: 'Failed to disable plugin' });
  }
});

router.post('/check-updates', async (req, res) => {
  try {
    await pluginUpdateService.checkForUpdates();
    res.json({ success: true, lastCheck: pluginUpdateService.getLastCheckTime() });
  } catch (error) {
    console.error('Check updates error:', error);
    res.status(500).json({ error: 'Failed to check updates' });
  }
});

router.get('/revocations', async (req, res) => {
  try {
    const revocations = pluginUpdateService.getRevocationList();
    res.json({ revocations });
  } catch (error) {
    console.error('Revocations error:', error);
    res.status(500).json({ error: 'Failed to get revocations' });
  }
});

export default router;
