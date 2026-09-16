// ════════════════════════════════════════════════════════════════════════
//  BD HOSTING - WEBSITE FILE MANAGEMENT, DEPLOYMENT & ROLLBACK UI
// ════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // Global State
  window.hfmState = {
    activeSubscriptionId: '',
    activeProjectName: '',
    currentDir: '',
    searchQuery: '',
    files: [],
    breadcrumbs: [],
    stats: { totalFiles: 0, totalFolders: 0, totalSize: '0 Bytes' },
    siteMeta: null,
    editingFilePath: '',
    deployingZipFile: null,
    isDeploying: false
  };

  // Helper: Toast notification
  function showHfmToast(message, isError = false) {
    if (typeof window.toast === 'function') {
      window.toast(message);
      return;
    }
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:999999;background:${isError ? '#ef4444' : '#10b981'};color:#fff;padding:12px 20px;border-radius:10px;font-family:sans-serif;font-size:13px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,0.5);display:flex;align-items:center;gap:8px;animation:hfmFadeIn 0.2s ease-out;`;
    t.innerHTML = `${isError ? '⚠️' : '✅'} ${message}`;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s ease';
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }

  // Inject UI Modals & CSS into DOM
  function injectHfmComponents() {
    if (document.getElementById('hostingFileManagerModalContainer')) return;

    const container = document.createElement('div');
    container.id = 'hostingFileManagerModalContainer';
    container.innerHTML = `
      <style>
        .hfm-modal-backdrop {
          position: fixed; inset: 0; background: rgba(3, 7, 18, 0.88);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          z-index: 100000; display: none; align-items: center; justify-content: center;
          padding: 16px; opacity: 0; transition: opacity 0.2s ease;
        }
        .hfm-modal-backdrop.active { display: flex; opacity: 1; }
        .hfm-modal-window {
          background: #0f172a; border: 1.5px solid rgba(56, 189, 248, 0.3);
          border-radius: 20px; width: 100%; max-width: 1080px; max-height: 92vh;
          display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px rgba(56, 189, 248, 0.15);
          color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .hfm-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 700;
          cursor: pointer; transition: all 0.15s ease; border: 1px solid transparent;
          text-decoration: none; white-space: nowrap; user-select: none;
        }
        .hfm-btn-primary {
          background: linear-gradient(135deg, #0284c7, #0369a1); color: #fff;
          border-color: #38bdf8; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
        }
        .hfm-btn-primary:hover { background: linear-gradient(135deg, #0369a1, #075985); transform: translateY(-1px); }
        .hfm-btn-success {
          background: linear-gradient(135deg, #059669, #047857); color: #fff;
          border-color: #34d399; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);
        }
        .hfm-btn-success:hover { background: linear-gradient(135deg, #047857, #065f46); transform: translateY(-1px); }
        .hfm-btn-outline {
          background: rgba(15, 23, 42, 0.6); color: #94a3b8;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .hfm-btn-outline:hover { background: rgba(30, 41, 59, 0.9); color: #f8fafc; border-color: rgba(56, 189, 248, 0.4); }
        .hfm-btn-danger {
          background: rgba(239, 68, 68, 0.15); color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .hfm-btn-danger:hover { background: #ef4444; color: #fff; }
        .hfm-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
        .hfm-table th {
          background: #090d16; padding: 12px 14px; font-weight: 700; color: #94a3b8;
          font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08); position: sticky; top: 0; z-index: 10;
        }
        .hfm-table td {
          padding: 10px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          vertical-align: middle; color: #cbd5e1;
        }
        .hfm-table tr:hover td { background: rgba(30, 41, 59, 0.5); }
        .hfm-file-icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; margin-right: 8px; vertical-align: middle; }
        .hfm-breadcrumb-item { color: #38bdf8; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
        .hfm-breadcrumb-item:hover { text-decoration: underline; color: #7dd3fc; }
        .hfm-line-numbers {
          user-select: none; font-family: monospace; font-size: 12.5px; line-height: 1.6;
          color: #64748b; background: #090d16; padding: 14px 10px; text-align: right;
          border-right: 1px solid rgba(255,255,255,0.08); min-width: 48px;
        }
        .hfm-code-textarea {
          flex: 1; background: #030712; color: #e2e8f0; font-family: 'Fira Code', Consolas, Monaco, monospace;
          font-size: 13px; line-height: 1.6; padding: 14px 16px; border: none; outline: none;
          resize: none; white-space: pre; tab-size: 2; overflow-x: auto;
        }
        .hfm-dropzone {
          border: 2px dashed rgba(56, 189, 248, 0.4); border-radius: 16px;
          background: rgba(2, 6, 23, 0.6); padding: 32px 20px; text-align: center;
          cursor: pointer; transition: all 0.2s ease;
        }
        .hfm-dropzone:hover, .hfm-dropzone.dragover {
          border-color: #38bdf8; background: rgba(56, 189, 248, 0.08); transform: scale(1.01);
        }
      </style>

      <!-- 1. MAIN FILE MANAGER MODAL -->
      <div id="hfmMainModal" class="hfm-modal-backdrop">
        <div class="hfm-modal-window" style="height: 88vh;">
          <!-- Header -->
          <div style="padding: 16px 20px; background: #090d16; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 22px; width: 38px; height: 38px; border-radius: 10px; background: rgba(56,189,248,0.15); display: inline-flex; align-items: center; justify-content: center; color: #38bdf8; border: 1px solid rgba(56,189,248,0.3);">📁</span>
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <strong style="font-size: 16px; color: #f8fafc;" id="hfmTitleProject">Website File Manager</strong>
                  <span id="hfmLiveBadge" style="background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.4); padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 800;">● LIVE ACTIVE</span>
                </div>
                <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px; display: flex; align-items: center; gap: 6px;">
                  <span>Root: <code id="hfmSubIdPill" style="color: #38bdf8; font-family: monospace;">-</code></span>
                  <span>•</span>
                  <span id="hfmTotalSizePill" style="color: #cbd5e1;">0 Files</span>
                </div>
              </div>
            </div>
            <!-- Quick Header Actions -->
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button type="button" class="hfm-btn hfm-btn-success" onclick="window.hfmOpenLivePreview()">
                🌐 লাইভ ওয়েবসাইট ভিউ
              </button>
              <button type="button" class="hfm-btn hfm-btn-primary" onclick="window.hfmOpenDeployModal()">
                🚀 নতুন ওয়েবসাইট ডিপ্লয় / রিপ্লেস
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmOpenHistoryModal()">
                📜 হিস্ট্রি ও রোলব্যাক
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmCloseModal('hfmMainModal')" style="padding: 6px 10px; font-size: 15px;">
                ✕
              </button>
            </div>
          </div>

          <!-- Action Toolbar & Breadcrumb Bar -->
          <div style="padding: 12px 20px; background: rgba(2,6,23,0.7); border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
            <!-- Actions -->
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmPromptCreateItem('folder')" title="নতুন ফোল্ডার">
                📁 + ফোল্ডার
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmPromptCreateItem('file')" title="নতুন ফাইল">
                📄 + ফাইল
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="document.getElementById('hfmDirectUploadInput').click()" title="ফাইল আপলোড">
                ⬆️ ফাইল আপলোড
              </button>
              <input type="file" id="hfmDirectUploadInput" multiple style="display:none;" onchange="window.hfmHandleDirectFileInput(this.files)">
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmDownloadCurrentFolder()" title="বর্তমান ফোল্ডার জিপ ডাউনলোড">
                📥 ফোল্ডার ZIP
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmRefreshCurrentDir()" title="রিফ্রেশ">
                🔄 রিফ্রেশ
              </button>
            </div>
            <!-- Search Filter -->
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="text" id="hfmSearchInput" placeholder="🔍 সার্চ ফাইল/ফোল্ডার..." oninput="window.hfmOnSearch(this.value)" style="background:#090d16;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px 12px;font-size:12px;color:#f8fafc;outline:none;width:180px;">
            </div>
          </div>

          <!-- Breadcrumb & Path Location -->
          <div style="padding: 8px 20px; background: #090d16; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <div id="hfmBreadcrumbContainer" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-family: monospace;">
              <span>📁 /</span>
            </div>
            <div id="hfmCountSummary" style="color: #64748b; font-size: 11px;">
              লোড হচ্ছে...
            </div>
          </div>

          <!-- File Explorer Table Body -->
          <div style="flex: 1; overflow-y: auto; background: #030712; position: relative;" id="hfmTableContainer">
            <table class="hfm-table">
              <thead>
                <tr>
                  <th style="width: 42%;">নাম</th>
                  <th style="width: 12%;">সাইজ</th>
                  <th style="width: 14%;">পারমিশন</th>
                  <th style="width: 18%;">সর্বশেষ পরিবর্তন</th>
                  <th style="width: 14%; text-align: right;">একশন</th>
                </tr>
              </thead>
              <tbody id="hfmTableBody">
                <tr>
                  <td colspan="5" style="text-align: center; padding: 40px; color: #94a3b8;">
                    ⏳ ফাইল লিস্ট লোড হচ্ছে...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Footer Status Bar -->
          <div style="padding: 8px 20px; background: #090d16; border-top: 1px solid rgba(255,255,255,0.08); font-size: 11.5px; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display:flex;align-items:center;gap:12px">
              <span>💡 <strong style="color:#38bdf8">টিপস:</strong> কোড বা টেক্সট ফাইল ক্লিক করে সরাসরি ব্রাউজারে এডিট ও সেভ করতে পারেন।</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span id="hfmLiveUrlText" style="color:#34d399;font-family:monospace">/sites/mysite/</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. CODE EDITOR MODAL -->
      <div id="hfmEditorModal" class="hfm-modal-backdrop">
        <div class="hfm-modal-window" style="height: 90vh; max-width: 1150px;">
          <!-- Editor Header -->
          <div style="padding: 14px 20px; background: #090d16; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">📝</span>
              <div>
                <strong style="font-size: 15px; color: #f8fafc;" id="hfmEditorFileName">index.html</strong>
                <div style="font-size: 11px; color: #94a3b8; font-family: monospace;" id="hfmEditorFilePath">/public_html/index.html</div>
              </div>
              <span id="hfmEditorMimeBadge" style="background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; font-family: monospace;">HTML</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="hfmEditorSaveStatus" style="font-size: 12px; color: #94a3b8; margin-right: 6px;"></span>
              <button type="button" class="hfm-btn hfm-btn-success" onclick="window.hfmSaveCurrentFile()">
                💾 সেভ করুন (Ctrl+S)
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmReloadCurrentFile()">
                🔄 রিলোড
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmCloseModal('hfmEditorModal')">
                ✕ বন্ধ
              </button>
            </div>
          </div>
          <!-- Editor Main Area -->
          <div style="flex: 1; display: flex; overflow: hidden; background: #030712;">
            <div id="hfmEditorLineNumbers" class="hfm-line-numbers">1</div>
            <textarea id="hfmEditorContent" class="hfm-code-textarea" spellcheck="false" placeholder="// কোড এখানে লিখুন..."></textarea>
          </div>
          <!-- Editor Footer -->
          <div style="padding: 6px 18px; background: #090d16; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: #64748b; display: flex; justify-content: space-between;">
            <span id="hfmEditorCharCount">0 characters | 0 lines</span>
            <span>UTF-8 • Tab Size: 2 • Auto-indent</span>
          </div>
        </div>
      </div>

      <!-- 3. DEPLOY & REPLACE WEBSITE MODAL -->
      <div id="hfmDeployModal" class="hfm-modal-backdrop">
        <div class="hfm-modal-window" style="max-width: 680px;">
          <!-- Header -->
          <div style="padding: 16px 20px; background: #090d16; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 22px;">🚀</span>
              <div>
                <strong style="font-size: 16px; color: #f8fafc;">ওয়েবসাইট আপলোড ও রিপ্লেস সিস্টেম</strong>
                <div style="font-size: 11.5px; color: #94a3b8;">Upload ZIP • Automatic Backup • Instant Live Redeploy</div>
              </div>
            </div>
            <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmCloseModal('hfmDeployModal')">✕</button>
          </div>

          <!-- Body -->
          <div style="padding: 20px; overflow-y: auto; max-height: 75vh;">
            <!-- Instructions Box -->
            <div style="background: rgba(2,132,199,0.1); border: 1px solid rgba(56,189,248,0.25); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
              <strong style="color: #38bdf8; display: block; margin-bottom: 4px;">⚡ স্বয়ংক্রিয় ডিপ্লয়মেন্ট গাইড:</strong>
              ১. আপনার ওয়েবসাইটের ফাইলসমূহ (HTML/CSS/JS/PHP) একটি <code>.zip</code> ফাইলে কম্প্রেস করে আপলোড করুন।<br>
              ২. ডিপ্লয়মেন্ট শুরু করার আগে সিস্টেম স্বয়ংক্রিয়ভাবে বর্তমান রানিং সাইটের <strong>নিরাপদ ব্যাকআপ (Snapshot)</strong> তৈরি করবে।<br>
              ৩. ফাইল এক্সট্রাক্ট শেষে লাইভ URL অবিলম্বে নতুন কন্টেন্ট পরিবেশন করবে।
            </div>

            <!-- Drag & Drop Zone -->
            <div id="hfmZipDropzone" class="hfm-dropzone" onclick="document.getElementById('hfmZipFileInput').click()">
              <input type="file" id="hfmZipFileInput" accept=".zip,application/zip" style="display:none;" onchange="window.hfmOnZipFileSelected(this.files[0])">
              <div style="font-size: 38px; margin-bottom: 8px;">📦</div>
              <strong style="font-size: 14px; color: #38bdf8; display: block; margin-bottom: 4px;" id="hfmDropzoneLabel">ওয়েবসাইট ZIP ফাইল এখানে ড্রপ করুন অথবা ব্রাউজ করুন</strong>
              <span style="font-size: 12px; color: #64748b;" id="hfmDropzoneSub">সমর্থিত ফরম্যাট: .ZIP (Max: 200MB)</span>
            </div>

            <!-- File Selected Summary Card -->
            <div id="hfmZipInfoCard" style="display: none; margin-top: 14px; background: #090d16; border: 1px solid rgba(52,211,153,0.3); border-radius: 12px; padding: 12px 16px;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 20px;">📄</span>
                  <div>
                    <strong style="font-size: 13px; color: #f8fafc;" id="hfmSelectedZipName">website.zip</strong>
                    <div style="font-size: 11px; color: #34d399;" id="hfmSelectedZipSize">2.4 MB</div>
                  </div>
                </div>
                <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmClearSelectedZip()" style="padding: 4px 8px; font-size: 11px;">রিমুভ</button>
              </div>
            </div>

            <!-- Deployment Options -->
            <div style="margin-top: 16px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #cbd5e1; cursor: pointer; margin-bottom: 12px;">
                <input type="checkbox" id="hfmAutoBackupCheck" checked style="accent-color: #0284c7; width: 16px; height: 16px;">
                <span>বর্তমান সাইটের ফুল ব্যাকআপ আর্কাইভ তৈরি করুন (প্রস্তাবিত)</span>
              </label>

              <label style="display: block; font-size: 12px; color: #94a3b8; margin-bottom: 6px;">ভার্সন / ডিপ্লয়মেন্ট নোট (ঐচ্ছিক):</label>
              <input type="text" id="hfmDeployNoteInput" placeholder="যেমন: Update landing page design & pricing" style="width: 100%; background: #090d16; border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 14px; font-size: 12.5px; color: #f8fafc; outline: none;">
            </div>

            <!-- Live Pipeline Progress & Logs (Shown during/after deploy) -->
            <div id="hfmDeployProgressBox" style="display: none; margin-top: 16px;">
              <div style="font-size: 12px; font-weight: 700; color: #38bdf8; margin-bottom: 8px; display: flex; justify-content: space-between;">
                <span id="hfmDeployStatusText">⏳ ডিপ্লয়মেন্ট চলছে...</span>
                <span id="hfmDeployPercentText">0%</span>
              </div>
              <div style="background: #090d16; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 12px;">
                <div id="hfmDeployProgressBar" style="background: linear-gradient(90deg, #0284c7, #34d399); width: 0%; height: 100%; transition: width 0.3s ease;"></div>
              </div>
              <!-- Log Terminal -->
              <pre id="hfmDeployLogsOutput" style="background: #030712; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; font-family: monospace; font-size: 11px; color: #4ade80; max-height: 140px; overflow-y: auto; margin: 0; line-height: 1.5;">[PIPELINE] Initializing...</pre>
            </div>
          </div>

          <!-- Footer Actions -->
          <div style="padding: 14px 20px; background: #090d16; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
            <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmCloseModal('hfmDeployModal')">বাতিল</button>
            <button type="button" class="hfm-btn hfm-btn-primary" id="hfmStartDeployBtn" onclick="window.hfmExecuteDeployment()">
              🚀 ওয়েবসাইট ডিপ্লয় করুন
            </button>
          </div>
        </div>
      </div>

      <!-- 4. DEPLOYMENT HISTORY & 1-CLICK ROLLBACK MODAL -->
      <div id="hfmHistoryModal" class="hfm-modal-backdrop">
        <div class="hfm-modal-window" style="max-width: 820px; height: 85vh;">
          <!-- Header -->
          <div style="padding: 16px 20px; background: #090d16; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 22px;">📜</span>
              <div>
                <strong style="font-size: 16px; color: #f8fafc;">ডিপ্লয়মেন্ট হিস্ট্রি ও ১-ক্লিক রোলব্যাক</strong>
                <div style="font-size: 11.5px; color: #94a3b8;">Releases History • Snapshots • Instant Zero-Downtime Rollback</div>
              </div>
            </div>
            <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmCloseModal('hfmHistoryModal')">✕</button>
          </div>

          <!-- List of Releases -->
          <div style="flex: 1; overflow-y: auto; padding: 20px; background: #030712;" id="hfmHistoryListContainer">
            <div style="text-align: center; color: #94a3b8; padding: 40px;">⏳ হিস্ট্রি লোড হচ্ছে...</div>
          </div>
        </div>
      </div>

      <!-- 5. LIVE WEBSITE PREVIEW MODAL -->
      <div id="hfmLivePreviewModal" class="hfm-modal-backdrop">
        <div class="hfm-modal-window" style="height: 94vh; max-width: 1200px;">
          <!-- Preview Header -->
          <div style="padding: 12px 20px; background: #090d16; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">🌐</span>
              <div>
                <strong style="font-size: 14px; color: #f8fafc;">লাইভ ওয়েবসাইট প্রিভিউ</strong>
                <div style="font-size: 11px; color: #34d399; font-family: monospace;" id="hfmPreviewUrlText">-</div>
              </div>
            </div>
            <!-- Viewport Switcher & External Controls -->
            <div style="display: flex; align-items: center; gap: 6px;">
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmPreviewSetDevice('desktop')" id="hfmBtnDevDesktop" style="background:#1e293b;color:#38bdf8;">🖥️ Desktop</button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmPreviewSetDevice('tablet')" id="hfmBtnDevTablet">📱 Tablet</button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmPreviewSetDevice('mobile')" id="hfmBtnDevMobile">📲 Mobile</button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmPreviewReload()">🔄 রিফ্রেশ</button>
              <button type="button" class="hfm-btn hfm-btn-primary" onclick="window.hfmPreviewOpenTab()">↗️ নতুন ট্যাবে খুলুন</button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmCloseModal('hfmLivePreviewModal')">✕</button>
            </div>
          </div>
          <!-- Preview Container -->
          <div style="flex: 1; background: #020617; display: flex; align-items: center; justify-content: center; padding: 12px; overflow: hidden;">
            <div id="hfmPreviewIframeWrapper" style="width: 100%; height: 100%; transition: width 0.3s ease; display: flex; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
              <iframe id="hfmLiveIframe" src="about:blank" style="width: 100%; height: 100%; border: none; background: #fff;"></iframe>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Setup Code Editor auto line numbers & tab key handling
    const editorTextarea = document.getElementById('hfmEditorContent');
    const lineNumbersEl = document.getElementById('hfmEditorLineNumbers');

    if (editorTextarea && lineNumbersEl) {
      const updateLines = () => {
        const lines = editorTextarea.value.split('\n').length;
        let lineStr = '';
        for (let i = 1; i <= lines; i++) lineStr += i + '\n';
        lineNumbersEl.textContent = lineStr;

        const charCountEl = document.getElementById('hfmEditorCharCount');
        if (charCountEl) {
          charCountEl.textContent = `${editorTextarea.value.length} characters | ${lines} lines`;
        }
      };

      editorTextarea.addEventListener('input', updateLines);
      editorTextarea.addEventListener('scroll', () => {
        lineNumbersEl.scrollTop = editorTextarea.scrollTop;
      });

      // Handle Tab Indentation and Ctrl+S / Cmd+S
      editorTextarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          window.hfmSaveCurrentFile();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          const start = editorTextarea.selectionStart;
          const end = editorTextarea.selectionEnd;
          editorTextarea.value = editorTextarea.value.substring(0, start) + '  ' + editorTextarea.value.substring(end);
          editorTextarea.selectionStart = editorTextarea.selectionEnd = start + 2;
          updateLines();
        }
      });
    }

    // Drag & drop handlers for ZIP modal
    const dropzone = document.getElementById('hfmZipDropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault(); e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault(); e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });
      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          window.hfmOnZipFileSelected(files[0]);
        }
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  MODAL CONTROLS
  // ──────────────────────────────────────────────────────────────────────────

  window.hfmOpenModal = function(modalId) {
    injectHfmComponents();
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  };

  window.hfmCloseModal = function(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  1. FILE MANAGER EXPLORER LOGIC
  // ──────────────────────────────────────────────────────────────────────────

  window.openHostingFileManager = async function(subscriptionId, projectName = 'Website') {
    injectHfmComponents();
    window.hfmState.activeSubscriptionId = subscriptionId;
    window.hfmState.activeProjectName = projectName;
    window.hfmState.currentDir = '';
    window.hfmState.searchQuery = '';

    document.getElementById('hfmTitleProject').textContent = `${projectName} - ফাইল ম্যানেজার`;
    document.getElementById('hfmSubIdPill').textContent = subscriptionId;
    document.getElementById('hfmLiveUrlText').textContent = `/sites/${encodeURIComponent(subscriptionId)}/`;

    window.hfmOpenModal('hfmMainModal');
    await window.hfmLoadDirectory('');
  };

  window.hfmLoadDirectory = async function(relDir = '') {
    window.hfmState.currentDir = relDir;
    const subId = window.hfmState.activeSubscriptionId;
    const tbody = document.getElementById('hfmTableBody');

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#94a3b8;">⏳ লোড হচ্ছে...</td></tr>`;
    }

    try {
      const res = await fetch(`/api/hosting-files/list?subscriptionId=${encodeURIComponent(subId)}&dir=${encodeURIComponent(relDir)}`);
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load directory');
      }

      window.hfmState.files = data.items || [];
      window.hfmState.breadcrumbs = data.breadcrumbs || [];
      window.hfmState.stats = data.stats || { totalFiles: 0, totalFolders: 0, totalSize: '0 B' };
      window.hfmState.siteMeta = data.siteMeta || null;

      window.hfmRenderBreadcrumbs();
      window.hfmRenderTable();
    } catch (err) {
      showHfmToast(err.message, true);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;color:#f87171;">⚠️ এরর: ${err.message}</td></tr>`;
      }
    }
  };

  window.hfmRefreshCurrentDir = async function() {
    await window.hfmLoadDirectory(window.hfmState.currentDir);
  };

  window.hfmRenderBreadcrumbs = function() {
    const container = document.getElementById('hfmBreadcrumbContainer');
    if (!container) return;

    const bc = window.hfmState.breadcrumbs;
    if (!bc || bc.length === 0) {
      container.innerHTML = `<span>📁 root</span>`;
      return;
    }

    container.innerHTML = bc.map((item, idx) => {
      const isLast = idx === bc.length - 1;
      if (isLast) {
        return `<strong style="color:#f8fafc;">${item.name}</strong>`;
      }
      return `
        <span class="hfm-breadcrumb-item" onclick="window.hfmLoadDirectory('${item.path.replace(/'/g, "\\'")}')">
          ${item.name}
        </span>
        <span style="color:#64748b;">/</span>
      `;
    }).join('');

    const countSummary = document.getElementById('hfmCountSummary');
    if (countSummary) {
      const s = window.hfmState.stats;
      countSummary.textContent = `${s.totalFolders} টি ফোল্ডার • ${s.totalFiles} টি ফাইল (মোট: ${s.totalSize})`;
    }
    const totalSizePill = document.getElementById('hfmTotalSizePill');
    if (totalSizePill) {
      totalSizePill.textContent = `${window.hfmState.stats.totalFiles} Files (${window.hfmState.stats.totalSize})`;
    }
  };

  window.hfmRenderTable = function() {
    const tbody = document.getElementById('hfmTableBody');
    if (!tbody) return;

    let items = window.hfmState.files;
    const q = (window.hfmState.searchQuery || '').toLowerCase().trim();
    if (q) {
      items = items.filter(x => x.name.toLowerCase().includes(q));
    }

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:40px;color:#94a3b8;">
            📭 এই ফোল্ডারে কোনো ফাইল নেই। উপরে '⬆️ ফাইল আপলোড' অথবা '+ ফাইল' ক্লিক করে নতুন ফাইল যোগ করুন।
          </td>
        </tr>
      `;
      return;
    }

    // If inside a subfolder, add '.. (Parent Folder)' row
    let rowsHtml = '';
    if (window.hfmState.currentDir) {
      const parentDir = window.hfmState.currentDir.includes('/')
        ? window.hfmState.currentDir.substring(0, window.hfmState.currentDir.lastIndexOf('/'))
        : '';
      rowsHtml += `
        <tr style="cursor:pointer;" onclick="window.hfmLoadDirectory('${parentDir.replace(/'/g, "\\'")}')">
          <td colspan="5" style="color:#38bdf8;font-weight:700;padding:10px 14px;">
            📁 .. (পূর্ববর্তী ডিরেক্টরি)
          </td>
        </tr>
      `;
    }

    rowsHtml += items.map(item => {
      const icon = item.isDirectory ? '📁' : getFileIcon(item.extension);
      const nameClickAction = item.isDirectory
        ? `window.hfmLoadDirectory('${item.relativePath.replace(/'/g, "\\'")}')`
        : item.isEditable
        ? `window.hfmOpenFileEditor('${item.relativePath.replace(/'/g, "\\'")}')`
        : `window.hfmDownloadItem('${item.relativePath.replace(/'/g, "\\'")}')`;

      const isZip = item.extension === '.zip';

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;cursor:pointer;" onclick="${nameClickAction}">
              <span class="hfm-file-icon">${icon}</span>
              <strong style="color:${item.isDirectory ? '#38bdf8' : '#f8fafc'};font-size:13px;">
                ${item.name}
              </strong>
              ${item.name === 'index.html' || item.name === 'index.php' ? '<span style="background:rgba(52,211,153,0.2);color:#34d399;font-size:9.5px;padding:1px 6px;border-radius:6px;margin-left:6px;font-weight:800">ENTRY</span>' : ''}
            </div>
          </td>
          <td style="font-family:monospace;font-size:12px;color:#cbd5e1;">${item.sizeFormatted}</td>
          <td style="font-family:monospace;font-size:11.5px;color:#a5b4fc;">
            <span onclick="window.hfmPromptChmod('${item.relativePath.replace(/'/g, "\\'")}', '${item.permissions}')" style="cursor:pointer;text-decoration:underline dashed;" title="পারমিশন পরিবর্তন করুন">${item.permissions}</span>
          </td>
          <td style="font-size:12px;color:#94a3b8;">${item.updatedAtFormatted || '-'}</td>
          <td style="text-align:right;">
            <div style="display:inline-flex;gap:4px;align-items:center;">
              ${item.isEditable ? `
                <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmOpenFileEditor('${item.relativePath.replace(/'/g, "\\'")}')" style="padding:3px 7px;font-size:11px;" title="এডিট করুন">
                  ✏️
                </button>
              ` : ''}
              ${isZip ? `
                <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmExtractZip('${item.relativePath.replace(/'/g, "\\'")}')" style="padding:3px 7px;font-size:11px;color:#f59e0b;" title="আনজিপ (Extract) করুন">
                  📦 Extract
                </button>
              ` : ''}
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmDownloadItem('${item.relativePath.replace(/'/g, "\\'")}')" style="padding:3px 7px;font-size:11px;" title="ডাউনলোড">
                📥
              </button>
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmPromptRename('${item.relativePath.replace(/'/g, "\\'")}', '${item.name.replace(/'/g, "\\'")}')" style="padding:3px 7px;font-size:11px;" title="রিনেম">
                🏷️
              </button>
              <button type="button" class="hfm-btn hfm-btn-danger" onclick="window.hfmDeleteItem('${item.relativePath.replace(/'/g, "\\'")}', ${item.isDirectory})" style="padding:3px 7px;font-size:11px;" title="ডিলিট">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml;
  };

  function getFileIcon(ext) {
    switch (ext) {
      case '.html': case '.htm': return '🌐';
      case '.css': case '.scss': return '🎨';
      case '.js': case '.mjs': case '.ts': return '📜';
      case '.json': return '📋';
      case '.php': return '🐘';
      case '.py': return '🐍';
      case '.zip': return '📦';
      case '.png': case '.jpg': case '.jpeg': case '.gif': case '.webp': case '.svg': return '🖼️';
      case '.mp4': case '.webm': return '🎥';
      case '.mp3': case '.wav': return '🎵';
      case '.sql': return '🗄️';
      case '.md': case '.txt': return '📄';
      default: return '📄';
    }
  }

  window.hfmOnSearch = function(val) {
    window.hfmState.searchQuery = val;
    window.hfmRenderTable();
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  CRUD ACTIONS
  // ──────────────────────────────────────────────────────────────────────────

  window.hfmPromptCreateItem = async function(type) {
    const promptMsg = type === 'folder' ? 'নতুন ফোল্ডারের নাম লিখুন:' : 'নতুন ফাইলের নাম লিখুন (যেমন: about.html):';
    const name = prompt(promptMsg);
    if (!name || !name.trim()) return;

    try {
      const res = await fetch('/api/hosting-files/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: window.hfmState.activeSubscriptionId,
          dir: window.hfmState.currentDir,
          name: name.trim(),
          type
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create');

      showHfmToast(`${type === 'folder' ? 'ফোল্ডার' : 'ফাইল'} তৈরি করা হয়েছে!`);
      await window.hfmRefreshCurrentDir();

      if (type === 'file') {
        window.hfmOpenFileEditor(data.relativePath);
      }
    } catch (e) {
      showHfmToast(e.message, true);
    }
  };

  window.hfmDeleteItem = async function(itemPath, isDir) {
    const msg = isDir
      ? `আপনি কি নিশ্চিত যে এই ফোল্ডার এবং এর ভেতরের সকল ফাইল ডিলিট করতে চান?\n${itemPath}`
      : `আপনি কি নিশ্চিত যে '${itemPath}' ফাইলটি ডিলিট করতে চান?`;

    if (!confirm(msg)) return;

    try {
      const res = await fetch('/api/hosting-files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: window.hfmState.activeSubscriptionId,
          path: itemPath
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete');

      showHfmToast('সফলভাবে ডিলিট করা হয়েছে!');
      await window.hfmRefreshCurrentDir();
    } catch (e) {
      showHfmToast(e.message, true);
    }
  };

  window.hfmPromptRename = async function(itemPath, currentName) {
    const newName = prompt('নতুন নাম লিখুন:', currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
      const res = await fetch('/api/hosting-files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: window.hfmState.activeSubscriptionId,
          path: itemPath,
          newName: newName.trim()
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to rename');

      showHfmToast('রিনেম সম্পন্ন হয়েছে!');
      await window.hfmRefreshCurrentDir();
    } catch (e) {
      showHfmToast(e.message, true);
    }
  };

  window.hfmPromptChmod = async function(itemPath, currentPerm) {
    const perm = prompt('নতুন অক্টাল পারমিশন দিন (যেমন: 0644, 0755):', currentPerm);
    if (!perm || perm.trim() === currentPerm) return;

    try {
      const res = await fetch('/api/hosting-files/chmod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: window.hfmState.activeSubscriptionId,
          path: itemPath,
          permissions: perm.trim()
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to chmod');

      showHfmToast(`পারমিশন ${data.permissions} এ আপডেট হয়েছে!`);
      await window.hfmRefreshCurrentDir();
    } catch (e) {
      showHfmToast(e.message, true);
    }
  };

  window.hfmExtractZip = async function(zipPath) {
    if (!confirm(`আপনি কি এই ZIP ফাইলটি বর্তমান ফোল্ডারে এক্সট্রাক্ট (Extract) করতে চান?`)) return;

    showHfmToast('📦 আনজিপ করা হচ্ছে...');
    try {
      const res = await fetch('/api/hosting-files/extract-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: window.hfmState.activeSubscriptionId,
          zipPath: zipPath,
          targetDir: window.hfmState.currentDir
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Extraction failed');

      showHfmToast(`🎉 এক্সট্রাক্ট সম্পন্ন! (${data.extractedCount} টি ফাইল আনপ্যাক হয়েছে)`);
      await window.hfmRefreshCurrentDir();
    } catch (e) {
      showHfmToast(e.message, true);
    }
  };

  window.hfmDownloadItem = function(itemPath) {
    const subId = window.hfmState.activeSubscriptionId;
    const url = `/api/hosting-files/download?subscriptionId=${encodeURIComponent(subId)}&path=${encodeURIComponent(itemPath)}`;
    window.open(url, '_blank');
  };

  window.hfmDownloadCurrentFolder = function() {
    window.hfmDownloadItem(window.hfmState.currentDir || '');
  };

  // Direct multiple file upload
  window.hfmHandleDirectFileInput = async function(fileList) {
    if (!fileList || fileList.length === 0) return;
    showHfmToast(`⬆️ ${fileList.length} টি ফাইল আপলোড হচ্ছে...`);

    const filesData = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const base64 = await readFileAsBase64(file);
      filesData.push({ fileName: file.name, fileBase64: base64 });
    }

    try {
      const res = await fetch('/api/hosting-files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: window.hfmState.activeSubscriptionId,
          dir: window.hfmState.currentDir,
          files: filesData
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Upload failed');

      showHfmToast(`✅ ${data.count} টি ফাইল আপলোড সফল হয়েছে!`);
      await window.hfmRefreshCurrentDir();
    } catch (e) {
      showHfmToast(e.message, true);
    }
  };

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  2. CODE EDITOR LOGIC
  // ──────────────────────────────────────────────────────────────────────────

  window.hfmOpenFileEditor = async function(filePath) {
    injectHfmComponents();
    window.hfmState.editingFilePath = filePath;

    document.getElementById('hfmEditorFileName').textContent = filePath.split('/').pop() || filePath;
    document.getElementById('hfmEditorFilePath').textContent = `/${filePath}`;
    document.getElementById('hfmEditorSaveStatus').textContent = 'লোড হচ্ছে...';

    window.hfmOpenModal('hfmEditorModal');

    try {
      const subId = window.hfmState.activeSubscriptionId;
      const res = await fetch(`/api/hosting-files/read?subscriptionId=${encodeURIComponent(subId)}&filePath=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to read');

      const textarea = document.getElementById('hfmEditorContent');
      textarea.value = data.content || '';
      document.getElementById('hfmEditorMimeBadge').textContent = (data.extension || 'TEXT').replace('.', '').toUpperCase();
      document.getElementById('hfmEditorSaveStatus').textContent = '✅ লোড হয়েছে';

      // Trigger line numbers update
      textarea.dispatchEvent(new Event('input'));
    } catch (e) {
      showHfmToast(e.message, true);
      document.getElementById('hfmEditorSaveStatus').textContent = `❌ ${e.message}`;
    }
  };

  window.hfmReloadCurrentFile = async function() {
    if (window.hfmState.editingFilePath) {
      await window.hfmOpenFileEditor(window.hfmState.editingFilePath);
    }
  };

  window.hfmSaveCurrentFile = async function() {
    const filePath = window.hfmState.editingFilePath;
    const subId = window.hfmState.activeSubscriptionId;
    const content = document.getElementById('hfmEditorContent').value;
    const statusEl = document.getElementById('hfmEditorSaveStatus');

    if (statusEl) statusEl.textContent = '⏳ সেভ হচ্ছে...';

    try {
      const res = await fetch('/api/hosting-files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subId,
          filePath: filePath,
          content: content
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Save failed');

      if (statusEl) statusEl.textContent = '💾 সেভ সম্পন্ন (' + new Date().toLocaleTimeString() + ')';
      showHfmToast('ফাইল সফলভাবে সংরক্ষিত হয়েছে!');
    } catch (e) {
      if (statusEl) statusEl.textContent = `❌ সেভ ব্যর্থ: ${e.message}`;
      showHfmToast(e.message, true);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  3. DEPLOY & REPLACE WEBSITE LOGIC
  // ──────────────────────────────────────────────────────────────────────────

  window.openHostingDeployModal = function(subscriptionId, projectName) {
    injectHfmComponents();
    if (subscriptionId) window.hfmState.activeSubscriptionId = subscriptionId;
    if (projectName) window.hfmState.activeProjectName = projectName;

    window.hfmClearSelectedZip();
    document.getElementById('hfmDeployProgressBox').style.display = 'none';
    document.getElementById('hfmStartDeployBtn').disabled = false;
    document.getElementById('hfmStartDeployBtn').textContent = '🚀 ওয়েবসাইট ডিপ্লয় করুন';

    window.hfmOpenModal('hfmDeployModal');
  };

  window.hfmOpenDeployModal = function() {
    window.openHostingDeployModal(window.hfmState.activeSubscriptionId, window.hfmState.activeProjectName);
  };

  window.hfmOnZipFileSelected = function(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showHfmToast('অনুগ্রহ করে একটি বৈধ .ZIP ফাইল নির্বাচন করুন', true);
      return;
    }

    window.hfmState.deployingZipFile = file;
    document.getElementById('hfmSelectedZipName').textContent = file.name;
    document.getElementById('hfmSelectedZipSize').textContent = formatBytesJs(file.size);
    document.getElementById('hfmZipInfoCard').style.display = 'block';
    document.getElementById('hfmDropzoneLabel').textContent = '✅ ZIP ফাইল সিলেক্ট করা হয়েছে';
  };

  window.hfmClearSelectedZip = function() {
    window.hfmState.deployingZipFile = null;
    const input = document.getElementById('hfmZipFileInput');
    if (input) input.value = '';
    const infoCard = document.getElementById('hfmZipInfoCard');
    if (infoCard) infoCard.style.display = 'none';
    const dropLabel = document.getElementById('hfmDropzoneLabel');
    if (dropLabel) dropLabel.textContent = 'ওয়েবসাইট ZIP ফাইল এখানে ড্রপ করুন অথবা ব্রাউজ করুন';
  };

  window.hfmExecuteDeployment = async function() {
    const file = window.hfmState.deployingZipFile;
    if (!file) {
      showHfmToast('অনুগ্রহ করে প্রথমে ওয়েবসাইটের ZIP ফাইল নির্বাচন করুন!', true);
      return;
    }

    const subId = window.hfmState.activeSubscriptionId;
    const isBackup = document.getElementById('hfmAutoBackupCheck')?.checked ?? true;
    const note = document.getElementById('hfmDeployNoteInput')?.value || 'Website Update';

    const btn = document.getElementById('hfmStartDeployBtn');
    btn.disabled = true;
    btn.textContent = '⏳ ডিপ্লয়মেন্ট চলছে...';

    const progressBox = document.getElementById('hfmDeployProgressBox');
    const progressBar = document.getElementById('hfmDeployProgressBar');
    const statusText = document.getElementById('hfmDeployStatusText');
    const percentText = document.getElementById('hfmDeployPercentText');
    const logsOutput = document.getElementById('hfmDeployLogsOutput');

    progressBox.style.display = 'block';
    logsOutput.textContent = `[${new Date().toLocaleTimeString()}] Starting website deployment pipeline...\n`;

    const setProgress = (percent, msg) => {
      progressBar.style.width = percent + '%';
      percentText.textContent = percent + '%';
      statusText.textContent = msg;
      logsOutput.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      logsOutput.scrollTop = logsOutput.scrollHeight;
    };

    try {
      setProgress(15, '📦 ZIP ফাইল এনকোড ও ভ্যালিডেশন করা হচ্ছে...');
      const base64Data = await readFileAsBase64(file);

      setProgress(40, '🔒 রানিং সাইটের অটোমেটিক ব্যাকআপ ও সেফটি স্ন্যাপশট তৈরি...');
      await new Promise(r => setTimeout(r, 400));

      setProgress(65, '🚀 ফাইল রুট ডিরেক্টরিতে এক্সট্রাকশন ও পারমিশন সেটআপ...');

      const res = await fetch('/api/hosting-deploy/upload-replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: subId,
          fileName: file.name,
          fileBase64: base64Data,
          projectName: window.hfmState.activeProjectName,
          note: note,
          isReplace: true
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Deployment failed');

      setProgress(90, '🌐 DNS ও রিভার্স প্রক্সি লাইভ ট্রাফিকে প্রমোট করা হচ্ছে...');
      await new Promise(r => setTimeout(r, 300));

      setProgress(100, `🎉 ডিপ্লয়মেন্ট সফল! লাইভ ভার্সন: ${data.deployment.version}`);

      // Append backend deployment logs
      if (data.deployment?.logs) {
        data.deployment.logs.forEach(l => {
          logsOutput.textContent += `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}\n`;
        });
        logsOutput.scrollTop = logsOutput.scrollHeight;
      }

      btn.textContent = '✅ ডিপ্লয়মেন্ট সম্পন্ন!';
      showHfmToast(`🎉 আপনার ওয়েবসাইট সফলভাবে লাইভ ডিপ্লয় করা হয়েছে! (${data.deployment.version})`);

      // Refresh file manager view in background
      setTimeout(() => {
        window.hfmRefreshCurrentDir();
      }, 1000);
    } catch (e) {
      setProgress(100, `❌ ডিপ্লয়মেন্ট ব্যর্থ: ${e.message}`);
      btn.disabled = false;
      btn.textContent = '🔄 পুনরায় চেষ্টা করুন';
      showHfmToast(e.message, true);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  4. DEPLOYMENT HISTORY & 1-CLICK ROLLBACK
  // ──────────────────────────────────────────────────────────────────────────

  window.openHostingHistoryModal = async function(subscriptionId, projectName) {
    injectHfmComponents();
    if (subscriptionId) window.hfmState.activeSubscriptionId = subscriptionId;
    if (projectName) window.hfmState.activeProjectName = projectName;

    window.hfmOpenModal('hfmHistoryModal');
    const container = document.getElementById('hfmHistoryListContainer');
    container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px;">⏳ হিস্ট্রি লোড হচ্ছে...</div>';

    try {
      const subId = window.hfmState.activeSubscriptionId;
      const res = await fetch(`/api/hosting-deploy/history?subscriptionId=${encodeURIComponent(subId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch history');

      const deps = data.deployments || [];
      if (deps.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px;">কোনো পূর্ববর্তী ডিপ্লয়মেন্ট পাওয়া যায়নি।</div>';
        return;
      }

      container.innerHTML = deps.map((d, idx) => {
        const isLive = d.isCurrent;
        const dateStr = new Date(d.timestamp).toLocaleString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `
          <div style="background:#090d16;border:1.5px solid ${isLive ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.08)'};border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 8px 20px rgba(0,0,0,0.5);">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:18px;">${isLive ? '🟢' : '📦'}</span>
                <strong style="color:#f8fafc;font-size:14px;">Release ${d.version}</strong>
                <code style="color:#38bdf8;font-size:11px;background:rgba(56,189,248,0.1);padding:1px 6px;border-radius:6px;">${d.id}</code>
              </div>
              <div>
                ${isLive
                  ? '<span style="background:rgba(52,211,153,0.2);color:#34d399;border:1px solid rgba(52,211,153,0.5);padding:3px 10px;border-radius:12px;font-size:10px;font-weight:900;">● CURRENT ACTIVE</span>'
                  : '<span style="background:#1e293b;color:#94a3b8;padding:3px 8px;border-radius:12px;font-size:10px;">Archive</span>'
                }
              </div>
            </div>

            <div style="font-size:12.5px;color:#cbd5e1;margin-bottom:8px;">
              <strong>নোট:</strong> ${d.note || 'Website deployment'}
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;font-size:11px;color:#94a3b8;font-family:monospace;margin-bottom:12px;">
              <div>🕒 <strong>সময়:</strong> ${dateStr}</div>
              <div>📂 <strong>ফাইল:</strong> ${d.fileName || 'bundle.zip'} (${d.fileSizeFormatted || '-'})</div>
              ${d.backupFile ? `<div>🛡️ <strong>ব্যাকআপ:</strong> <span style="color:#34d399">Snapshot Saved</span></div>` : ''}
              <div>⚡ <strong>ডিউরেশন:</strong> ${d.durationMs || 0}ms</div>
            </div>

            <!-- Actions -->
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${!isLive && d.backupFile ? `
                <button type="button" class="hfm-btn hfm-btn-primary" onclick="window.hfmExecuteRollback('${d.id}', '${d.version}')" style="padding:6px 12px;font-size:11.5px;">
                  ⏪ এই ভার্সনে ১-ক্লিক রোলব্যাক করুন
                </button>
              ` : ''}
              <button type="button" class="hfm-btn hfm-btn-outline" onclick="window.hfmToggleHistoryLogs('logs_${d.id}')" style="padding:6px 12px;font-size:11.5px;">
                📜 লগ দেখুন
              </button>
            </div>

            <!-- Expandable Logs -->
            <div id="logs_${d.id}" style="display:none;margin-top:10px;background:#030712;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;font-family:monospace;font-size:11px;color:#4ade80;max-height:140px;overflow-y:auto;white-space:pre-wrap;">${(d.logs || []).map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n') || 'কোনো বিস্তারিত লগ নেই।'}</div>
          </div>
        `;
      }).join('');
    } catch (e) {
      container.innerHTML = `<div style="text-align:center;color:#f87171;padding:40px;">⚠️ এরর: ${e.message}</div>`;
    }
  };

  window.hfmOpenHistoryModal = function() {
    window.openHostingHistoryModal(window.hfmState.activeSubscriptionId, window.hfmState.activeProjectName);
  };

  window.hfmToggleHistoryLogs = function(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.hfmExecuteRollback = async function(deploymentId, version) {
    if (!confirm(`আপনি কি নিশ্চিত যে ওয়েবসাইটটিকে অবিলম্বে '${version}' ভার্সনে রোলব্যাক করতে চান?\nআপনার বর্তমান সাইট ব্যাকআপ থেকে রিস্টোর হবে।`)) return;

    showHfmToast(`⏪ রোলব্যাক হচ্ছে (${version})...`);
    try {
      const res = await fetch('/api/hosting-deploy/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: window.hfmState.activeSubscriptionId,
          deploymentId: deploymentId
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Rollback failed');

      showHfmToast(`🎉 সফলভাবে ${version} ভার্সনে রোলব্যাক সম্পন্ন হয়েছে!`);
      await window.openHostingHistoryModal(window.hfmState.activeSubscriptionId, window.hfmState.activeProjectName);
      await window.hfmRefreshCurrentDir();
    } catch (e) {
      showHfmToast(e.message, true);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  5. LIVE PREVIEW MODAL
  // ──────────────────────────────────────────────────────────────────────────

  window.openHostingLivePreview = function(subscriptionId, projectName) {
    injectHfmComponents();
    if (subscriptionId) window.hfmState.activeSubscriptionId = subscriptionId;
    if (projectName) window.hfmState.activeProjectName = projectName;

    const liveUrl = `/sites/${encodeURIComponent(window.hfmState.activeSubscriptionId)}/`;
    document.getElementById('hfmPreviewUrlText').textContent = liveUrl;

    const iframe = document.getElementById('hfmLiveIframe');
    if (iframe) iframe.src = liveUrl;

    window.hfmPreviewSetDevice('desktop');
    window.hfmOpenModal('hfmLivePreviewModal');
  };

  window.hfmOpenLivePreview = function() {
    window.openHostingLivePreview(window.hfmState.activeSubscriptionId, window.hfmState.activeProjectName);
  };

  window.hfmPreviewSetDevice = function(device) {
    const wrapper = document.getElementById('hfmPreviewIframeWrapper');
    const bDesk = document.getElementById('hfmBtnDevDesktop');
    const bTab = document.getElementById('hfmBtnDevTablet');
    const bMob = document.getElementById('hfmBtnDevMobile');

    [bDesk, bTab, bMob].forEach(b => {
      if (b) { b.style.background = 'rgba(15, 23, 42, 0.6)'; b.style.color = '#94a3b8'; }
    });

    if (device === 'mobile') {
      wrapper.style.width = '375px';
      if (bMob) { bMob.style.background = '#1e293b'; bMob.style.color = '#38bdf8'; }
    } else if (device === 'tablet') {
      wrapper.style.width = '768px';
      if (bTab) { bTab.style.background = '#1e293b'; bTab.style.color = '#38bdf8'; }
    } else {
      wrapper.style.width = '100%';
      if (bDesk) { bDesk.style.background = '#1e293b'; bDesk.style.color = '#38bdf8'; }
    }
  };

  window.hfmPreviewReload = function() {
    const iframe = document.getElementById('hfmLiveIframe');
    if (iframe) {
      const src = iframe.src;
      iframe.src = 'about:blank';
      setTimeout(() => { iframe.src = src; }, 50);
    }
  };

  window.hfmPreviewOpenTab = function() {
    const liveUrl = `/sites/${encodeURIComponent(window.hfmState.activeSubscriptionId)}/`;
    window.open(liveUrl, '_blank');
  };

  function formatBytesJs(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHfmComponents);
  } else {
    injectHfmComponents();
  }

})();
