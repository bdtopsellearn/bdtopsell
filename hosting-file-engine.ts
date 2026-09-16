import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';

// ════════════════════════════════════════════════════════════════════════
//  BD HOSTING - SECURE WEBSITE FILE MANAGEMENT & DEPLOYMENT ENGINE
// ════════════════════════════════════════════════════════════════════════

export interface HostingFileItem {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  sizeFormatted: string;
  updatedAt: string;
  updatedAtFormatted: string;
  extension: string;
  permissions: string;
  mimeType: string;
  isEditable: boolean;
}

export interface HostingDeploymentRecord {
  id: string;
  subscriptionId: string;
  version: string;
  note: string;
  status: 'pending' | 'uploading' | 'extracting' | 'deploying' | 'live' | 'failed' | 'rolled_back';
  timestamp: string;
  fileName: string;
  fileSize: number;
  fileSizeFormatted: string;
  backupFile?: string;
  backupSizeFormatted?: string;
  durationMs: number;
  logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error' | 'success'; message: string }>;
  isCurrent: boolean;
}

export interface HostingSiteMetadata {
  subscriptionId: string;
  projectName?: string;
  subdomain?: string;
  customDomain?: string;
  currentVersion: string;
  activeDeploymentId: string;
  lastDeployedAt: string;
  fileCount: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  indexFileFound: boolean;
  deployments: HostingDeploymentRecord[];
}

const BASE_STORAGE = path.join(process.cwd(), 'storage');
const SITES_ROOT = path.join(BASE_STORAGE, 'hosting_sites');
const BACKUPS_ROOT = path.join(BASE_STORAGE, 'hosting_backups');
const META_ROOT = path.join(BASE_STORAGE, 'hosting_meta');

// Ensure base directories exist
[BASE_STORAGE, SITES_ROOT, BACKUPS_ROOT, META_ROOT].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Helper: Format bytes to human readable format
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper: Check if file is editable as text/code
const EDITABLE_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.json', '.xml', '.svg', '.txt', '.md', '.markdown',
  '.php', '.phtml', '.py', '.rb', '.java', '.c', '.cpp', '.cs', '.go', '.rs',
  '.env', '.htaccess', '.yaml', '.yml', '.ini', '.conf', '.config', '.sh', '.bash', '.sql', '.toml'
]);

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.php': 'text/html; charset=utf-8'
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ──────────────────────────────────────────────────────────────────────────
//  SECURITY: STRICT DIRECTORY RESOLVER WITH PATH TRAVERSAL DEFENSE
// ──────────────────────────────────────────────────────────────────────────
export function getSubscriptionSiteRoot(subscriptionId: string): string {
  const cleanId = String(subscriptionId).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleanId) throw new Error('Invalid subscription ID');
  const siteDir = path.join(SITES_ROOT, cleanId);
  if (!fs.existsSync(siteDir)) {
    fs.mkdirSync(siteDir, { recursive: true });
    // Seed standard starter index.html if empty
    const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Your Website</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #111827; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 540px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    h1 { color: #38bdf8; margin-top: 0; font-size: 24px; }
    p { color: #94a3b8; line-height: 1.6; font-size: 14px; }
    .badge { display: inline-block; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-bottom: 16px; }
    .footer { margin-top: 24px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🚀 BD TOPSELL CLOUD HOSTING ACTIVE</div>
    <h1>Website Ready for Deployment!</h1>
    <p>Your subscription is online. Upload your website ZIP file or use the built-in File Manager to replace this page with your HTML/PHP/JS application.</p>
    <div class="footer">Hosted on BD TopSell High-Speed NVMe Cloud Infrastructure</div>
  </div>
</body>
</html>`;
    fs.writeFileSync(path.join(siteDir, 'index.html'), defaultHtml, 'utf-8');
  }
  return siteDir;
}

export function getSubscriptionBackupsRoot(subscriptionId: string): string {
  const cleanId = String(subscriptionId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(BACKUPS_ROOT, cleanId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSubscriptionMetaFile(subscriptionId: string): string {
  const cleanId = String(subscriptionId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(META_ROOT, `${cleanId}_meta.json`);
}

export function resolveSafePath(subscriptionId: string, relativePath: string = ''): string {
  const root = path.resolve(getSubscriptionSiteRoot(subscriptionId));
  // Normalize and prevent null bytes or sneaky escapes
  const sanitizedRel = (relativePath || '').replace(/\0/g, '').replace(/\\/g, '/');
  const target = path.resolve(root, sanitizedRel.startsWith('/') ? sanitizedRel.slice(1) : sanitizedRel);

  if (!target.startsWith(root)) {
    throw new Error('Security Error: Path traversal detected outside website root.');
  }
  return target;
}

// ──────────────────────────────────────────────────────────────────────────
//  METADATA & DEPLOYMENT PERSISTENCE
// ──────────────────────────────────────────────────────────────────────────
export function loadSiteMetadata(subscriptionId: string, projectName?: string): HostingSiteMetadata {
  const metaPath = getSubscriptionMetaFile(subscriptionId);
  const root = getSubscriptionSiteRoot(subscriptionId);

  let meta: HostingSiteMetadata;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch (_) {
      meta = createInitialMetadata(subscriptionId, projectName);
    }
  } else {
    meta = createInitialMetadata(subscriptionId, projectName);
  }

  // Recalculate live file stats
  const stats = calculateDirectoryStats(root);
  meta.fileCount = stats.count;
  meta.totalSizeBytes = stats.size;
  meta.totalSizeFormatted = formatBytes(stats.size);
  meta.indexFileFound = fs.existsSync(path.join(root, 'index.html')) || fs.existsSync(path.join(root, 'index.php')) || fs.existsSync(path.join(root, 'index.htm'));
  if (projectName) meta.projectName = projectName;

  saveSiteMetadata(meta);
  return meta;
}

function createInitialMetadata(subscriptionId: string, projectName?: string): HostingSiteMetadata {
  return {
    subscriptionId,
    projectName: projectName || `Hosting-${subscriptionId.slice(0, 6)}`,
    subdomain: `site-${subscriptionId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}.bdtopsell.cloud`,
    currentVersion: 'v1.0.0',
    activeDeploymentId: 'dep-init',
    lastDeployedAt: new Date().toISOString(),
    fileCount: 1,
    totalSizeBytes: 1024,
    totalSizeFormatted: '1 KB',
    indexFileFound: true,
    deployments: [
      {
        id: 'dep-init',
        subscriptionId,
        version: 'v1.0.0',
        note: 'Initial Default Webpage',
        status: 'live',
        timestamp: new Date().toISOString(),
        fileName: 'starter_index.html',
        fileSize: 1024,
        fileSizeFormatted: '1 KB',
        durationMs: 120,
        logs: [
          { timestamp: new Date().toLocaleTimeString(), level: 'info', message: 'Website root workspace initialized.' },
          { timestamp: new Date().toLocaleTimeString(), level: 'success', message: 'Initial welcome page online.' }
        ],
        isCurrent: true
      }
    ]
  };
}

export function saveSiteMetadata(meta: HostingSiteMetadata): void {
  try {
    const metaPath = getSubscriptionMetaFile(meta.subscriptionId);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save site metadata:', err);
  }
}

function calculateDirectoryStats(dirPath: string): { count: number; size: number } {
  let count = 0;
  let size = 0;
  if (!fs.existsSync(dirPath)) return { count, size };

  function traverse(current: string) {
    try {
      const items = fs.readdirSync(current, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(current, item.name);
        if (item.isDirectory()) {
          traverse(full);
        } else {
          count++;
          try {
            const stat = fs.statSync(full);
            size += stat.size;
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
  traverse(dirPath);
  return { count, size };
}

// ──────────────────────────────────────────────────────────────────────────
//  FILE MANAGER CRUD OPERATIONS
// ──────────────────────────────────────────────────────────────────────────

export function listDirectoryFiles(subscriptionId: string, relativeDir: string = ''): {
  currentPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  items: HostingFileItem[];
  stats: { totalFiles: number; totalFolders: number; totalSize: string };
} {
  const root = getSubscriptionSiteRoot(subscriptionId);
  const targetDir = resolveSafePath(subscriptionId, relativeDir);

  if (!fs.existsSync(targetDir)) {
    throw new Error(`Directory not found: ${relativeDir}`);
  }
  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    throw new Error('Requested path is not a directory');
  }

  const rawRel = path.relative(root, targetDir).replace(/\\/g, '/');
  const cleanRel = rawRel === '.' ? '' : rawRel;

  // Build breadcrumbs
  const breadcrumbs: Array<{ name: string; path: string }> = [
    { name: 'root (public_html)', path: '' }
  ];
  if (cleanRel) {
    const segments = cleanRel.split('/');
    let accum = '';
    for (const seg of segments) {
      accum = accum ? `${accum}/${seg}` : seg;
      breadcrumbs.push({ name: seg, path: accum });
    }
  }

  const dirents = fs.readdirSync(targetDir, { withFileTypes: true });
  const items: HostingFileItem[] = [];
  let totalFiles = 0;
  let totalFolders = 0;
  let totalSizeBytes = 0;

  for (const dirent of dirents) {
    const fullPath = path.join(targetDir, dirent.name);
    const itemRel = cleanRel ? `${cleanRel}/${dirent.name}` : dirent.name;

    try {
      const itemStat = fs.statSync(fullPath);
      const isDir = dirent.isDirectory();
      const ext = isDir ? '' : path.extname(dirent.name).toLowerCase();
      const size = isDir ? 0 : itemStat.size;
      const permNum = (itemStat.mode & parseInt('777', 8)).toString(8).padStart(4, '0');

      if (isDir) totalFolders++;
      else {
        totalFiles++;
        totalSizeBytes += size;
      }

      items.push({
        name: dirent.name,
        relativePath: itemRel,
        isDirectory: isDir,
        size,
        sizeFormatted: isDir ? '-' : formatBytes(size),
        updatedAt: itemStat.mtime.toISOString(),
        updatedAtFormatted: itemStat.mtime.toLocaleString(),
        extension: ext,
        permissions: permNum,
        mimeType: isDir ? 'directory' : getMimeType(dirent.name),
        isEditable: !isDir && EDITABLE_EXTENSIONS.has(ext)
      });
    } catch (_) {}
  }

  // Sort: Directories first, then alphabetically
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return {
    currentPath: cleanRel,
    breadcrumbs,
    items,
    stats: {
      totalFiles,
      totalFolders,
      totalSize: formatBytes(totalSizeBytes)
    }
  };
}

export function readTextFileContent(subscriptionId: string, relativeFilePath: string): {
  relativePath: string;
  name: string;
  content: string;
  size: number;
  sizeFormatted: string;
  extension: string;
  mimeType: string;
} {
  const fullPath = resolveSafePath(subscriptionId, relativeFilePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relativeFilePath}`);
  }
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error('Cannot read directory as text file');
  }

  const ext = path.extname(fullPath).toLowerCase();
  const content = fs.readFileSync(fullPath, 'utf-8');

  return {
    relativePath: relativeFilePath,
    name: path.basename(fullPath),
    content,
    size: stat.size,
    sizeFormatted: formatBytes(stat.size),
    extension: ext,
    mimeType: getMimeType(fullPath)
  };
}

export function writeTextFileContent(subscriptionId: string, relativeFilePath: string, content: string): {
  success: boolean;
  size: number;
  sizeFormatted: string;
  updatedAt: string;
} {
  const fullPath = resolveSafePath(subscriptionId, relativeFilePath);
  const parent = path.dirname(fullPath);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

  fs.writeFileSync(fullPath, content, 'utf-8');
  const stat = fs.statSync(fullPath);

  // Update site metadata
  loadSiteMetadata(subscriptionId);

  return {
    success: true,
    size: stat.size,
    sizeFormatted: formatBytes(stat.size),
    updatedAt: stat.mtime.toISOString()
  };
}

export function createNewItem(subscriptionId: string, targetDir: string, name: string, type: 'file' | 'folder'): {
  success: boolean;
  relativePath: string;
  type: 'file' | 'folder';
} {
  const cleanName = name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  if (!cleanName) throw new Error('Invalid file or folder name');

  const parentDir = resolveSafePath(subscriptionId, targetDir);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

  const targetPath = path.join(parentDir, cleanName);
  const root = getSubscriptionSiteRoot(subscriptionId);
  const relPath = path.relative(root, targetPath).replace(/\\/g, '/');

  if (fs.existsSync(targetPath)) {
    throw new Error(`An item named "${cleanName}" already exists in this folder.`);
  }

  if (type === 'folder') {
    fs.mkdirSync(targetPath, { recursive: true });
  } else {
    fs.writeFileSync(targetPath, '', 'utf-8');
  }

  loadSiteMetadata(subscriptionId);
  return { success: true, relativePath: relPath, type };
}

export function deleteFileOrFolder(subscriptionId: string, relativePath: string): {
  success: boolean;
  deletedPath: string;
} {
  if (!relativePath || relativePath === '.' || relativePath === '/') {
    throw new Error('Cannot delete website root directory. Use Replace Website instead.');
  }

  const targetPath = resolveSafePath(subscriptionId, relativePath);
  if (!fs.existsSync(targetPath)) {
    throw new Error('Target file or folder does not exist');
  }

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(targetPath);
  }

  loadSiteMetadata(subscriptionId);
  return { success: true, deletedPath: relativePath };
}

export function renameFileOrFolder(subscriptionId: string, oldRelativePath: string, newName: string): {
  success: boolean;
  newRelativePath: string;
} {
  const cleanNewName = newName.trim().replace(/[/\\?%*:|"<>]/g, '_');
  if (!cleanNewName) throw new Error('Invalid new name provided');

  const oldFullPath = resolveSafePath(subscriptionId, oldRelativePath);
  if (!fs.existsSync(oldFullPath)) throw new Error('Target item does not exist');

  const parentDir = path.dirname(oldFullPath);
  const newFullPath = path.join(parentDir, cleanNewName);

  if (fs.existsSync(newFullPath) && oldFullPath !== newFullPath) {
    throw new Error(`An item with name "${cleanNewName}" already exists.`);
  }

  fs.renameSync(oldFullPath, newFullPath);
  const root = getSubscriptionSiteRoot(subscriptionId);
  const newRel = path.relative(root, newFullPath).replace(/\\/g, '/');

  loadSiteMetadata(subscriptionId);
  return { success: true, newRelativePath: newRel };
}

export function moveOrCopyItem(
  subscriptionId: string,
  sourceRelativePath: string,
  destDirectory: string,
  mode: 'move' | 'copy'
): { success: boolean; targetRelativePath: string } {
  const sourceFullPath = resolveSafePath(subscriptionId, sourceRelativePath);
  if (!fs.existsSync(sourceFullPath)) throw new Error('Source item does not exist');

  const destParentPath = resolveSafePath(subscriptionId, destDirectory);
  if (!fs.existsSync(destParentPath)) fs.mkdirSync(destParentPath, { recursive: true });

  const itemName = path.basename(sourceFullPath);
  const targetFullPath = path.join(destParentPath, itemName);

  if (sourceFullPath === targetFullPath) {
    throw new Error('Source and destination paths are identical');
  }

  const stat = fs.statSync(sourceFullPath);
  if (mode === 'move') {
    fs.renameSync(sourceFullPath, targetFullPath);
  } else {
    if (stat.isDirectory()) {
      fs.cpSync(sourceFullPath, targetFullPath, { recursive: true });
    } else {
      fs.copyFileSync(sourceFullPath, targetFullPath);
    }
  }

  const root = getSubscriptionSiteRoot(subscriptionId);
  const rel = path.relative(root, targetFullPath).replace(/\\/g, '/');
  loadSiteMetadata(subscriptionId);

  return { success: true, targetRelativePath: rel };
}

export function updateFilePermissions(subscriptionId: string, relativePath: string, modeOctal: string): {
  success: boolean;
  permissions: string;
} {
  const fullPath = resolveSafePath(subscriptionId, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error('Item does not exist');

  const cleanOctal = modeOctal.replace(/[^0-7]/g, '');
  if (!cleanOctal || cleanOctal.length < 3) throw new Error('Invalid octal permission (e.g. 0644, 0755)');

  const mode = parseInt(cleanOctal, 8);
  fs.chmodSync(fullPath, mode);

  const updatedStat = fs.statSync(fullPath);
  const permNum = (updatedStat.mode & parseInt('777', 8)).toString(8).padStart(4, '0');

  return { success: true, permissions: permNum };
}

export function extractZipInManager(subscriptionId: string, relativeZipPath: string, targetRelativeDir: string = ''): {
  success: boolean;
  extractedCount: number;
} {
  const zipFullPath = resolveSafePath(subscriptionId, relativeZipPath);
  if (!fs.existsSync(zipFullPath)) throw new Error('ZIP file not found');

  const targetDir = resolveSafePath(subscriptionId, targetRelativeDir);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const zip = new AdmZip(zipFullPath);
  const entries = zip.getEntries();
  let extractedCount = 0;

  for (const entry of entries) {
    const entryName = entry.entryName.replace(/\0/g, '').replace(/\\/g, '/');
    const safeTarget = resolveSafePath(subscriptionId, path.join(targetRelativeDir, entryName));

    if (entry.isDirectory) {
      if (!fs.existsSync(safeTarget)) fs.mkdirSync(safeTarget, { recursive: true });
    } else {
      const parent = path.dirname(safeTarget);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      fs.writeFileSync(safeTarget, entry.getData());
      extractedCount++;
    }
  }

  loadSiteMetadata(subscriptionId);
  return { success: true, extractedCount };
}

export function uploadFileDirect(
  subscriptionId: string,
  targetDirectory: string,
  fileName: string,
  fileDataBuffer: Buffer
): { success: boolean; relativePath: string; size: number; sizeFormatted: string } {
  const cleanName = fileName.replace(/[/\\?%*:|"<>]/g, '_');
  const parent = resolveSafePath(subscriptionId, targetDirectory);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

  const targetFullPath = path.join(parent, cleanName);
  fs.writeFileSync(targetFullPath, fileDataBuffer);

  const stat = fs.statSync(targetFullPath);
  const root = getSubscriptionSiteRoot(subscriptionId);
  const rel = path.relative(root, targetFullPath).replace(/\\/g, '/');

  loadSiteMetadata(subscriptionId);
  return {
    success: true,
    relativePath: rel,
    size: stat.size,
    sizeFormatted: formatBytes(stat.size)
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  WEBSITE DEPLOYMENT & REPLACE PIPELINE WITH AUTOMATIC BACKUPS
// ──────────────────────────────────────────────────────────────────────────

export async function deployOrReplaceWebsite(params: {
  subscriptionId: string;
  zipBuffer: Buffer;
  fileName: string;
  projectName?: string;
  note?: string;
  isReplace?: boolean;
}): Promise<{
  success: boolean;
  deployment: HostingDeploymentRecord;
  siteMeta: HostingSiteMetadata;
}> {
  const { subscriptionId, zipBuffer, fileName, projectName, note, isReplace = true } = params;
  const startTime = Date.now();
  const depId = 'dep-' + crypto.randomBytes(4).toString('hex');
  const siteRoot = getSubscriptionSiteRoot(subscriptionId);
  const backupsRoot = getSubscriptionBackupsRoot(subscriptionId);

  const logs: HostingDeploymentRecord['logs'] = [];
  const addLog = (level: 'info' | 'warn' | 'error' | 'success', message: string) => {
    logs.push({ timestamp: new Date().toLocaleTimeString(), level, message });
  };

  addLog('info', `Starting deployment pipeline for subscription: ${subscriptionId}`);
  addLog('info', `Uploaded package: ${fileName} (${formatBytes(zipBuffer.length)})`);

  let backupFileName = '';
  let backupSizeFormatted = '';

  try {
    // STEP 1: If current site exists, create automatic pre-deployment backup
    const existingFiles = fs.readdirSync(siteRoot);
    if (existingFiles.length > 0) {
      addLog('info', '📦 Creating automatic full backup of current website...');
      const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
      backupFileName = `backup-${subscriptionId.slice(0, 8)}-${timestampStr}.zip`;
      const backupFilePath = path.join(backupsRoot, backupFileName);

      try {
        const backupZip = new AdmZip();
        backupZip.addLocalFolder(siteRoot);
        backupZip.writeZip(backupFilePath);
        const bStat = fs.statSync(backupFilePath);
        backupSizeFormatted = formatBytes(bStat.size);
        addLog('success', `Automatic backup created: ${backupFileName} (${backupSizeFormatted})`);
      } catch (bkErr: any) {
        addLog('warn', `Backup warning: ${bkErr.message}. Continuing with deployment.`);
      }
    }

    // STEP 2: Validate ZIP Archive integrity & inspect contents
    addLog('info', '🔍 Validating ZIP structure & checking path security...');
    const incomingZip = new AdmZip(zipBuffer);
    const entries = incomingZip.getEntries();
    if (entries.length === 0) {
      throw new Error('Uploaded ZIP file is empty or corrupted.');
    }
    addLog('info', `ZIP archive valid. Found ${entries.length} file entries.`);

    // STEP 3: Clear existing website root safely if replacing
    if (isReplace) {
      addLog('info', '🧹 Cleaning previous root files for atomic replacement...');
      for (const item of existingFiles) {
        const full = path.join(siteRoot, item);
        try {
          if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
          else fs.unlinkSync(full);
        } catch (_) {}
      }
    }

    // STEP 4: Safe Extraction to Website Root with Path Traversal Protection
    addLog('info', '🚀 Extracting and deploying files into Website Root...');
    let extractedCount = 0;

    // Detect if entire zip is wrapped in a single top-level folder (e.g. "dist/" or "my-site/")
    let commonPrefix = '';
    const topDirs = new Set<string>();
    entries.forEach(e => {
      const parts = e.entryName.split(/[\/\\]/).filter(Boolean);
      if (parts.length > 0) topDirs.add(parts[0]);
    });
    if (topDirs.size === 1 && entries.some(e => e.entryName.includes('/') || e.entryName.includes('\\'))) {
      const first = Array.from(topDirs)[0];
      // If no root index.html and top dir exists, strip the prefix
      if (!entries.some(e => e.entryName === 'index.html' || e.entryName === 'index.php')) {
        commonPrefix = first + '/';
        addLog('info', `Detected root subfolder "${first}". Stripping container directory to deploy directly to root.`);
      }
    }

    for (const entry of entries) {
      let cleanEntryName = entry.entryName.replace(/\0/g, '').replace(/\\/g, '/');
      if (commonPrefix && cleanEntryName.startsWith(commonPrefix)) {
        cleanEntryName = cleanEntryName.slice(commonPrefix.length);
      }
      if (!cleanEntryName || cleanEntryName === '/') continue;

      const safeTarget = resolveSafePath(subscriptionId, cleanEntryName);

      if (entry.isDirectory) {
        if (!fs.existsSync(safeTarget)) fs.mkdirSync(safeTarget, { recursive: true });
      } else {
        const parent = path.dirname(safeTarget);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(safeTarget, entry.getData());
        extractedCount++;
      }
    }

    addLog('success', `Extracted ${extractedCount} files into website root successfully.`);

    // STEP 5: Verify Index Entry Point & Assets
    const hasIndexHtml = fs.existsSync(path.join(siteRoot, 'index.html'));
    const hasIndexPhp = fs.existsSync(path.join(siteRoot, 'index.php'));
    const hasIndexHtm = fs.existsSync(path.join(siteRoot, 'index.htm'));

    if (hasIndexHtml) addLog('success', '✅ Found index.html entry point.');
    else if (hasIndexPhp) addLog('success', '✅ Found index.php entry point.');
    else if (hasIndexHtm) addLog('success', '✅ Found index.htm entry point.');
    else {
      addLog('warn', '⚠️ No root index.html or index.php detected. Files will be served via index directory listings.');
    }

    // STEP 6: Update Metadata & Deployment History
    const meta = loadSiteMetadata(subscriptionId, projectName);
    const versionNum = `v1.${meta.deployments.length + 1}`;

    // Mark previous deployments as not current
    meta.deployments.forEach(d => { d.isCurrent = false; });

    const deployment: HostingDeploymentRecord = {
      id: depId,
      subscriptionId,
      version: versionNum,
      note: note || (isReplace ? 'Website Replaced & Redeployed' : 'Website Initial Deployment'),
      status: 'live',
      timestamp: new Date().toISOString(),
      fileName,
      fileSize: zipBuffer.length,
      fileSizeFormatted: formatBytes(zipBuffer.length),
      backupFile: backupFileName || undefined,
      backupSizeFormatted: backupSizeFormatted || undefined,
      durationMs: Date.now() - startTime,
      logs,
      isCurrent: true
    };

    meta.deployments.unshift(deployment);
    meta.currentVersion = versionNum;
    meta.activeDeploymentId = depId;
    meta.lastDeployedAt = new Date().toISOString();

    addLog('success', `🎉 Deployment Complete! Live Version: ${versionNum} (Duration: ${Date.now() - startTime}ms)`);
    saveSiteMetadata(meta);

    return {
      success: true,
      deployment,
      siteMeta: meta
    };
  } catch (err: any) {
    addLog('error', `Deployment Failed: ${err.message}`);
    const meta = loadSiteMetadata(subscriptionId, projectName);

    const failedDep: HostingDeploymentRecord = {
      id: depId,
      subscriptionId,
      version: `v-fail-${Date.now().toString().slice(-4)}`,
      note: note ? `[FAILED] ${note}` : `[FAILED] ${err.message}`,
      status: 'failed',
      timestamp: new Date().toISOString(),
      fileName,
      fileSize: zipBuffer.length,
      fileSizeFormatted: formatBytes(zipBuffer.length),
      backupFile: backupFileName || undefined,
      backupSizeFormatted: backupSizeFormatted || undefined,
      durationMs: Date.now() - startTime,
      logs,
      isCurrent: false
    };

    meta.deployments.unshift(failedDep);
    saveSiteMetadata(meta);

    throw new Error(`Deployment failed: ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  1-CLICK ROLLBACK ENGINE
// ──────────────────────────────────────────────────────────────────────────

export async function rollbackWebsiteDeployment(params: {
  subscriptionId: string;
  targetDeploymentId: string;
}): Promise<{
  success: boolean;
  restoredVersion: string;
  deployment: HostingDeploymentRecord;
  siteMeta: HostingSiteMetadata;
}> {
  const { subscriptionId, targetDeploymentId } = params;
  const meta = loadSiteMetadata(subscriptionId);
  const targetDep = meta.deployments.find(d => d.id === targetDeploymentId);

  if (!targetDep) {
    throw new Error(`Deployment record "${targetDeploymentId}" not found.`);
  }
  if (!targetDep.backupFile) {
    throw new Error(`No backup snapshot archive was found for version ${targetDep.version}.`);
  }

  const backupsRoot = getSubscriptionBackupsRoot(subscriptionId);
  const backupFilePath = path.join(backupsRoot, targetDep.backupFile);

  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file "${targetDep.backupFile}" is missing from server storage.`);
  }

  const siteRoot = getSubscriptionSiteRoot(subscriptionId);
  const startTime = Date.now();
  const rollbackDepId = 'dep-rb-' + crypto.randomBytes(3).toString('hex');
  const logs: HostingDeploymentRecord['logs'] = [];
  const addLog = (level: 'info' | 'warn' | 'error' | 'success', message: string) => {
    logs.push({ timestamp: new Date().toLocaleTimeString(), level, message });
  };

  addLog('info', `Initiating 1-Click Rollback to version ${targetDep.version} (${targetDep.id})...`);
  addLog('info', `Restoring from backup snapshot: ${targetDep.backupFile}`);

  // 1. Create emergency safety snapshot of current state before rollback
  const safetyBackupName = `pre-rollback-safety-${Date.now()}.zip`;
  try {
    const safetyZip = new AdmZip();
    safetyZip.addLocalFolder(siteRoot);
    safetyZip.writeZip(path.join(backupsRoot, safetyBackupName));
    addLog('info', 'Created pre-rollback emergency snapshot.');
  } catch (_) {}

  // 2. Clear current site
  const existingFiles = fs.readdirSync(siteRoot);
  for (const item of existingFiles) {
    const full = path.join(siteRoot, item);
    try {
      if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
      else fs.unlinkSync(full);
    } catch (_) {}
  }

  // 3. Extract backup ZIP
  const backupZip = new AdmZip(backupFilePath);
  backupZip.extractAllTo(siteRoot, true);
  addLog('success', `Restored all files from backup archive into website root.`);

  // 4. Update deployment state
  meta.deployments.forEach(d => { d.isCurrent = false; });
  const rbVersion = `${targetDep.version}-restored`;

  const rollbackRecord: HostingDeploymentRecord = {
    id: rollbackDepId,
    subscriptionId,
    version: rbVersion,
    note: `Rolled back to ${targetDep.version} (${targetDep.note || 'Snapshot'})`,
    status: 'live',
    timestamp: new Date().toISOString(),
    fileName: targetDep.backupFile,
    fileSize: fs.statSync(backupFilePath).size,
    fileSizeFormatted: formatBytes(fs.statSync(backupFilePath).size),
    backupFile: safetyBackupName,
    durationMs: Date.now() - startTime,
    logs,
    isCurrent: true
  };

  meta.deployments.unshift(rollbackRecord);
  meta.currentVersion = rbVersion;
  meta.activeDeploymentId = rollbackDepId;
  meta.lastDeployedAt = new Date().toISOString();

  addLog('success', `🎉 Rollback Complete! Live site restored immediately to ${targetDep.version}.`);
  saveSiteMetadata(meta);

  return {
    success: true,
    restoredVersion: targetDep.version,
    deployment: rollbackRecord,
    siteMeta: meta
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  DOWNLOAD FILE OR ENTIRE FOLDER AS ZIP
// ──────────────────────────────────────────────────────────────────────────

export function bundleFolderOrFileForDownload(subscriptionId: string, relativePath: string = ''): {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
} {
  const fullPath = resolveSafePath(subscriptionId, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error('Requested item not found');

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    const zip = new AdmZip();
    zip.addLocalFolder(fullPath);
    const buffer = zip.toBuffer();
    const folderName = relativePath ? path.basename(fullPath) : `website-${subscriptionId.slice(0, 8)}`;
    return {
      buffer,
      fileName: `${folderName}.zip`,
      mimeType: 'application/zip'
    };
  } else {
    const buffer = fs.readFileSync(fullPath);
    const fileName = path.basename(fullPath);
    return {
      buffer,
      fileName,
      mimeType: getMimeType(fullPath)
    };
  }
}
