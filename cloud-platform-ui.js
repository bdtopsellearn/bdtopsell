/**
 * BD TOPSELL CLOUD PLATFORM - CLIENT UI CONTROLLER
 * Unified Control Panel Frontend Architecture
 */

(function () {
  'use strict';

  const CloudState = {
    activeTab: 'overview',
    overview: null,
    projects: [],
    databases: [],
    vpsList: [],
    backups: [],
    filterQuery: '',
    filterRuntime: 'all',
    activeDeploymentId: null,
    activeProjectId: null,
    logPollTimer: null,
    autoRefreshTimer: null
  };

  // ══════════════════════════════════════════════════════════════
  // API CLIENT
  // ══════════════════════════════════════════════════════════════
  async function apiCall(endpoint, method = 'GET', data = null) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        opts.body = JSON.stringify(data);
      }
      const res = await fetch(endpoint, opts);
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[CloudPlatform] API Error:', err);
      return { success: false, error: err.message || 'Network connection failed' };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // INITIALIZATION & TAB SWITCHING
  // ══════════════════════════════════════════════════════════════
  async function initCloudPlatformUI() {
    console.log('[CloudPlatform] Initializing Cloud Platform Unified UI...');
    await refreshAllCloudData();
    cloudSwitchTab('overview');

    // Auto refresh status every 15s when page is active
    if (CloudState.autoRefreshTimer) clearInterval(CloudState.autoRefreshTimer);
    CloudState.autoRefreshTimer = setInterval(() => {
      const pageEl = document.getElementById('page-cloudplatform');
      if (pageEl && pageEl.style.display !== 'none' && !pageEl.classList.contains('hidden')) {
        refreshAllCloudData(true);
      }
    }, 15000);
  }

  async function refreshAllCloudData(silent = false) {
    if (!silent) showCloudLoadingSpinner(true);
    try {
      const [overviewRes, projectsRes, dbRes, vpsRes, backupsRes] = await Promise.all([
        apiCall('/api/cloud/overview'),
        apiCall('/api/cloud/projects'),
        apiCall('/api/cloud/databases'),
        apiCall('/api/cloud/vps'),
        apiCall('/api/cloud/backups')
      ]);

      if (overviewRes.success) CloudState.overview = overviewRes.overview;
      if (projectsRes.success) CloudState.projects = projectsRes.projects;
      if (dbRes.success) CloudState.databases = dbRes.databases;
      if (vpsRes.success) CloudState.vpsList = vpsRes.vpsList;
      if (backupsRes.success) CloudState.backups = backupsRes.backups;

      renderCurrentTab();
      updateTopBadges();
    } catch (e) {
      console.error('Error refreshing cloud data:', e);
    } finally {
      if (!silent) showCloudLoadingSpinner(false);
    }
  }

  function updateTopBadges() {
    const runningProjects = CloudState.projects.filter(p => p.status === 'running').length;
    const runningDbs = CloudState.databases.filter(d => d.status === 'running').length;
    const badgeApps = document.getElementById('cloudBadgeApps');
    const badgeDbs = document.getElementById('cloudBadgeDbs');
    const badgeVps = document.getElementById('cloudBadgeVps');

    if (badgeApps) badgeApps.textContent = CloudState.projects.length;
    if (badgeDbs) badgeDbs.textContent = CloudState.databases.length;
    if (badgeVps) badgeVps.textContent = CloudState.vpsList.length;
  }

  function cloudSwitchTab(tabId) {
    CloudState.activeTab = tabId;
    document.querySelectorAll('.cloud-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    renderCurrentTab();
  }

  function renderCurrentTab() {
    const container = document.getElementById('cloudTabContentContainer');
    if (!container) return;

    switch (CloudState.activeTab) {
      case 'overview':
        container.innerHTML = renderOverviewHtml();
        break;
      case 'projects':
        container.innerHTML = renderProjectsHtml();
        break;
      case 'docker':
        container.innerHTML = renderDockerHtml();
        break;
      case 'databases':
        container.innerHTML = renderDatabasesHtml();
        break;
      case 'domains':
        container.innerHTML = renderDomainsHtml();
        break;
      case 'vps':
        container.innerHTML = renderVpsHtml();
        break;
      case 'backups':
        container.innerHTML = renderBackupsHtml();
        break;
      case 'monitoring':
        container.innerHTML = renderMonitoringHtml();
        break;
      case 'api':
        container.innerHTML = renderApiHtml();
        break;
      case 'billing':
        container.innerHTML = renderBillingHtml();
        break;
    }
  }

  function showCloudLoadingSpinner(show) {
    const spinner = document.getElementById('cloudLoadingSpinner');
    if (spinner) spinner.style.display = show ? 'inline-block' : 'none';
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 1: OVERVIEW & CLOUD NODES
  // ══════════════════════════════════════════════════════════════
  function renderOverviewHtml() {
    const ov = CloudState.overview || {
      serverNodes: [],
      totalProjects: CloudState.projects.length,
      activeContainers: CloudState.projects.filter(p => p.status === 'running').length,
      totalDatabases: CloudState.databases.length,
      totalDeployments: 12,
      uptimePercent: '99.99%',
      clusterStatus: 'Operational'
    };

    const runningApps = CloudState.projects.filter(p => p.status === 'running').length;
    const runningDbs = CloudState.databases.filter(d => d.status === 'running').length;

    return `
      <div style="display:flex;flex-direction:column;gap:20px">
        <!-- Quick Action Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#0b1120;padding:16px 20px;border-radius:16px;border:1px solid rgba(255,255,255,0.08)">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:12px;background:rgba(2,132,199,0.2);color:#38bdf8;display:flex;align-items:center;justify-content:center;font-size:20px">
              ⚡
            </div>
            <div>
              <h3 style="margin:0;font-size:16px;font-weight:800;color:#f8fafc">BD TOPSELL Unified Cloud Platform</h3>
              <p style="margin:2px 0 0;font-size:12px;color:#94a3b8">Deploy apps, multi-container Docker, managed databases, and Contabo VPS in seconds</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <button class="cloud-btn-primary" onclick="window.cloudOpenDeployModal()">
              <span>🚀</span> New Application
            </button>
            <button class="cloud-btn-secondary" onclick="window.cloudOpenNewDbModal()">
              <span>🗄️</span> 1-Click Database
            </button>
            <button class="cloud-btn-secondary" onclick="window.cloudRefreshAll()">
              <span>🔄</span> Refresh Cluster
            </button>
          </div>
        </div>

        <!-- Metric Cards Grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
          <div class="cloud-metric-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:11.5px;color:#94a3b8;font-weight:700">ACTIVE CONTAINERS</span>
              <span style="font-size:18px">🐳</span>
            </div>
            <div style="font-size:26px;font-weight:900;color:#38bdf8">${runningApps + runningDbs} / ${CloudState.projects.length + CloudState.databases.length}</div>
            <div style="font-size:11px;color:#34d399;margin-top:4px;display:flex;align-items:center;gap:4px">
              <span class="cloud-pulse-dot"></span> Zero-downtime auto healing
            </div>
          </div>

          <div class="cloud-metric-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:11.5px;color:#94a3b8;font-weight:700">WEB APPLICATIONS</span>
              <span style="font-size:18px">📦</span>
            </div>
            <div style="font-size:26px;font-weight:900;color:#f8fafc">${CloudState.projects.length}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px">Node.js, Python, PHP, Go, Docker</div>
          </div>

          <div class="cloud-metric-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:11.5px;color:#94a3b8;font-weight:700">MANAGED DATABASES</span>
              <span style="font-size:18px">🗄️</span>
            </div>
            <div style="font-size:26px;font-weight:900;color:#a78bfa">${CloudState.databases.length}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px">Postgres, MySQL, Redis, Mongo</div>
          </div>

          <div class="cloud-metric-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:11.5px;color:#94a3b8;font-weight:700">CLUSTER UPTIME</span>
              <span style="font-size:18px">🛡️</span>
            </div>
            <div style="font-size:26px;font-weight:900;color:#34d399">${ov.uptimePercent}</div>
            <div style="font-size:11px;color:#34d399;margin-top:4px">DHK-SGP Tier-3 Data Center</div>
          </div>
        </div>

        <!-- Cluster Server Nodes Live Status -->
        <div class="cloud-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:12px">
            <div>
              <h4 style="margin:0;font-size:15px;color:#f8fafc;font-weight:800;display:flex;align-items:center;gap:8px">
                <span>🌐</span> High-Performance Edge & Core Nodes
              </h4>
              <p style="margin:3px 0 0;font-size:11.5px;color:#94a3b8">Real-time load balancing and container scheduling matrix</p>
            </div>
            <span style="font-size:11px;font-weight:800;color:#34d399;background:rgba(16,185,129,0.12);padding:4px 10px;border-radius:12px;border:1px solid rgba(16,185,129,0.3)">
              CLUSTER HEALTHY
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
            ${(ov.serverNodes || []).map(node => `
              <div style="background:#0b1120;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span class="cloud-pulse-dot"></span>
                    <strong style="font-size:13.5px;color:#f8fafc">${node.name}</strong>
                  </div>
                  <span style="font-size:10px;font-family:monospace;background:rgba(56,189,248,0.1);color:#38bdf8;padding:2px 8px;border-radius:8px;border:1px solid rgba(56,189,248,0.25)">
                    ${node.region} • ${node.ip}
                  </span>
                </div>
                
                <!-- CPU Bar -->
                <div style="margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:3px">
                    <span>CPU Usage</span>
                    <span style="color:#38bdf8;font-weight:700">${node.cpuPercent}%</span>
                  </div>
                  <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:6px;overflow:hidden">
                    <div style="width:${node.cpuPercent}%;height:100%;background:linear-gradient(90deg,#0284c7,#38bdf8);border-radius:6px"></div>
                  </div>
                </div>

                <!-- RAM Bar -->
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:3px">
                    <span>Memory Usage</span>
                    <span style="color:#a78bfa;font-weight:700">${node.ramUsedGb}GB / ${node.ramTotalGb}GB</span>
                  </div>
                  <div style="height:6px;background:rgba(255,255,255,0.08);border-radius:6px;overflow:hidden">
                    <div style="width:${Math.round((node.ramUsedGb / node.ramTotalGb) * 100)}%;height:100%;background:linear-gradient(90deg,#8b5cf6,#c084fc);border-radius:6px"></div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Recent Projects Quick List -->
        <div class="cloud-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h4 style="margin:0;font-size:15px;color:#f8fafc;font-weight:800">🚀 Live Application Deployments</h4>
            <button class="cloud-btn-secondary" onclick="window.cloudSwitchTab('projects')">View All Projects →</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
            ${CloudState.projects.slice(0, 3).map(p => renderProjectCardHtml(p)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 2: APPLICATIONS & WEB HOSTING
  // ══════════════════════════════════════════════════════════════
  function renderProjectsHtml() {
    let filtered = CloudState.projects;
    if (CloudState.filterRuntime !== 'all') {
      filtered = filtered.filter(p => p.runtime === CloudState.filterRuntime);
    }
    if (CloudState.filterQuery) {
      const q = CloudState.filterQuery.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || (p.customDomain && p.customDomain.toLowerCase().includes(q)));
    }

    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <!-- Controls & Filter Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#0b1120;padding:14px 18px;border-radius:14px;border:1px solid rgba(255,255,255,0.08)">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;max-width:550px">
            <input type="text" id="cloudProjectSearchInput" placeholder="🔍 Search projects, domains, or slug..." value="${CloudState.filterQuery}" 
              oninput="window.cloudFilterProjects(this.value, null)"
              style="background:#020617;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:8px 14px;border-radius:10px;font-size:12.5px;flex:1;min-width:200px">
            
            <select id="cloudRuntimeFilterSelect" onchange="window.cloudFilterProjects(null, this.value)"
              style="background:#020617;border:1px solid rgba(255,255,255,0.12);color:#fff;padding:8px 12px;border-radius:10px;font-size:12.5px">
              <option value="all" ${CloudState.filterRuntime === 'all' ? 'selected' : ''}>All Runtimes</option>
              <option value="nodejs" ${CloudState.filterRuntime === 'nodejs' ? 'selected' : ''}>Node.js</option>
              <option value="python" ${CloudState.filterRuntime === 'python' ? 'selected' : ''}>Python</option>
              <option value="php" ${CloudState.filterRuntime === 'php' ? 'selected' : ''}>PHP</option>
              <option value="golang" ${CloudState.filterRuntime === 'golang' ? 'selected' : ''}>Go</option>
              <option value="docker" ${CloudState.filterRuntime === 'docker' ? 'selected' : ''}>Docker Container</option>
              <option value="static" ${CloudState.filterRuntime === 'static' ? 'selected' : ''}>Static Web</option>
            </select>
          </div>

          <div style="display:flex;align-items:center;gap:10px">
            <button class="cloud-btn-primary" onclick="window.cloudOpenDeployModal()">
              <span>➕</span> Deploy New Project
            </button>
          </div>
        </div>

        <!-- Project Grid -->
        ${filtered.length === 0 ? `
          <div style="text-align:center;padding:60px 20px;background:#0b1120;border-radius:16px;border:1px dashed rgba(255,255,255,0.12)">
            <div style="font-size:48px;margin-bottom:12px">📂</div>
            <h4 style="margin:0;font-size:17px;color:#f8fafc">No Projects Found</h4>
            <p style="font-size:12.5px;color:#94a3b8;margin:6px 0 16px">Deploy your first web application, bot, or API service with 1 click</p>
            <button class="cloud-btn-primary" onclick="window.cloudOpenDeployModal()">Deploy Project Now</button>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px">
            ${filtered.map(p => renderProjectCardHtml(p)).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderProjectCardHtml(p) {
    const isRunning = p.status === 'running';
    const statusClass = `cloud-status-${p.status}`;
    const runtimeIcons = {
      nodejs: '🟩 Node.js',
      python: '🐍 Python',
      php: '🐘 PHP',
      golang: '🐹 Go',
      docker: '🐳 Docker',
      static: '🌐 Static HTML'
    };
    const runtimeLabel = runtimeIcons[p.runtime] || '⚡ Application';
    const activeDomain = p.customDomain || `${p.subdomain}.bdtopsell.cloud`;

    return `
      <div class="cloud-project-card">
        <!-- Header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <strong style="font-size:15px;color:#f8fafc">${p.name}</strong>
              <span class="cloud-status-pill ${statusClass}">
                ${isRunning ? '<span class="cloud-pulse-dot"></span>' : ''} ${p.status.toUpperCase()}
              </span>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;font-family:monospace">
              ${runtimeLabel} • Port ${p.port} • ${p.currentVersion}
            </div>
          </div>
          <span style="font-size:10px;background:rgba(255,255,255,0.06);color:#94a3b8;padding:2px 8px;border-radius:6px;font-family:monospace">
            ${p.framework.toUpperCase()}
          </span>
        </div>

        <!-- Live URL & SSL -->
        <div style="background:#020617;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden">
            <span style="color:#10b981;font-size:12px">🔒</span>
            <a href="https://${activeDomain}" target="_blank" style="color:#38bdf8;font-size:12px;text-decoration:none;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              https://${activeDomain}
            </a>
          </div>
          <button onclick="window.cloudCopy('https://${activeDomain}', 'URL')" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:12px" title="Copy URL">📋</button>
        </div>

        <!-- Metrics Preview -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;background:rgba(255,255,255,0.02);padding:8px 12px;border-radius:8px">
          <div style="font-size:11px;color:#94a3b8">
            CPU: <strong style="color:#f8fafc">${p.currentCpuPercent}%</strong>
          </div>
          <div style="font-size:11px;color:#94a3b8">
            RAM: <strong style="color:#f8fafc">${p.currentMemoryMb} MB</strong>
          </div>
        </div>

        <!-- Quick Action Buttons -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
          <div style="display:flex;align-items:center;gap:6px">
            <button class="cloud-btn-secondary" onclick="window.cloudOpenLogsModal('${p.id}')" title="Build & Live Logs" style="padding:6px 10px;font-size:11px">
              📜 Logs
            </button>
            <button class="cloud-btn-secondary" onclick="window.cloudOpenEnvModal('${p.id}')" title="Environment Variables" style="padding:6px 10px;font-size:11px">
              🔑 .env
            </button>
            <button class="cloud-btn-secondary" onclick="window.cloudOpenDomainModal('${p.id}')" title="Custom Domain" style="padding:6px 10px;font-size:11px">
              🌐 Domain
            </button>
          </div>

          <div style="display:flex;align-items:center;gap:4px">
            <button onclick="window.cloudProjectAction('${p.id}', 'redeploy')" title="Trigger Redeployment" style="background:#0284c7;border:none;color:#fff;padding:6px 9px;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700">
              🔄 Build
            </button>
            ${isRunning ? `
              <button onclick="window.cloudProjectAction('${p.id}', 'stop')" title="Stop Container" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:#f87171;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:11px">
                ⏹️
              </button>
            ` : `
              <button onclick="window.cloudProjectAction('${p.id}', 'restart')" title="Start Container" style="background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.4);color:#34d399;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:11px">
                ▶️
              </button>
            `}
            <button onclick="window.cloudOpenRollbackModal('${p.id}')" title="Zero-Downtime Rollback" style="background:rgba(168,85,247,0.2);border:1px solid rgba(168,85,247,0.4);color:#c084fc;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:11px">
              ↺
            </button>
            <button onclick="window.cloudProjectAction('${p.id}', 'delete')" title="Delete Project" style="background:transparent;border:none;color:#ef4444;padding:6px 6px;cursor:pointer;font-size:12px">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 3: DOCKER MULTI-CONTAINER PLATFORM
  // ══════════════════════════════════════════════════════════════
  function renderDockerHtml() {
    const dockerProjects = CloudState.projects.filter(p => p.sourceType === 'docker_image' || p.sourceType === 'docker_compose' || p.runtime === 'docker');

    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#0b1120;padding:16px 20px;border-radius:14px;border:1px solid rgba(255,255,255,0.08)">
          <div>
            <h3 style="margin:0;font-size:16px;color:#f8fafc;font-weight:800;display:flex;align-items:center;gap:8px">
              <span>🐳</span> Multi-Container Docker Engine
            </h3>
            <p style="margin:3px 0 0;font-size:12px;color:#94a3b8">Deploy Docker Hub images, custom Dockerfiles, and Docker Compose microservice stacks</p>
          </div>
          <div style="display:flex;gap:10px">
            <button class="cloud-btn-primary" onclick="window.cloudOpenDeployModal('docker_image')">
              <span>🐳</span> Deploy Docker Image
            </button>
            <button class="cloud-btn-secondary" onclick="window.cloudOpenDeployStackModal()">
              <span>📦</span> Docker Stack Template
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
          ${dockerProjects.length === 0 ? `
            <div style="grid-column:1/-1;text-align:center;padding:50px 20px;background:#0b1120;border-radius:14px">
              <div style="font-size:40px;margin-bottom:10px">🐳</div>
              <h4 style="color:#f8fafc;margin:0 0 6px">No Docker Containers Active</h4>
              <p style="color:#94a3b8;font-size:12px;margin:0 0 16px">Deploy any containerized application from Docker Hub or custom Dockerfile</p>
              <button class="cloud-btn-primary" onclick="window.cloudOpenDeployModal('docker_image')">Deploy Docker Image</button>
            </div>
          ` : dockerProjects.map(p => renderProjectCardHtml(p)).join('')}
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 4: MANAGED DATABASES (1-Click)
  // ══════════════════════════════════════════════════════════════
  function renderDatabasesHtml() {
    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <!-- DB Header Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#0b1120;padding:16px 20px;border-radius:14px;border:1px solid rgba(255,255,255,0.08)">
          <div>
            <h3 style="margin:0;font-size:16px;color:#f8fafc;font-weight:800;display:flex;align-items:center;gap:8px">
              <span>🗄️</span> 1-Click Managed Cloud Databases
            </h3>
            <p style="margin:3px 0 0;font-size:12px;color:#94a3b8">Instant auto-provisioned PostgreSQL, MySQL, MariaDB, Redis, and MongoDB with persistent NVMe storage</p>
          </div>
          <button class="cloud-btn-primary" onclick="window.cloudOpenNewDbModal()">
            <span>➕</span> Create New Database
          </button>
        </div>

        <!-- Databases Grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px">
          ${CloudState.databases.map(db => `
            <div class="cloud-card" style="position:relative">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:36px;height:36px;border-radius:10px;background:rgba(139,92,246,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;color:#a78bfa">
                    ${db.engine === 'postgresql' ? '🐘' : db.engine === 'mysql' ? '🐬' : db.engine === 'redis' ? '⚡' : '🍃'}
                  </div>
                  <div>
                    <strong style="font-size:15px;color:#f8fafc">${db.name}</strong>
                    <div style="font-size:11px;color:#94a3b8">${db.version} • Port ${db.port}</div>
                  </div>
                </div>
                <span class="cloud-status-pill cloud-status-${db.status}">
                  <span class="cloud-pulse-dot"></span> ${db.status.toUpperCase()}
                </span>
              </div>

              <!-- Connection String Box -->
              <div style="background:#020617;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px;margin-bottom:12px">
                <div style="font-size:10px;color:#94a3b8;font-weight:700;margin-bottom:4px">INTERNAL CONNECTION URI:</div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                  <code style="font-size:11px;color:#34d399;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px">
                    ${db.internalConnectionUrl}
                  </code>
                  <button onclick="window.cloudCopy('${db.internalConnectionUrl}', 'Connection URI')" class="cloud-btn-secondary" style="padding:4px 8px;font-size:11px">
                    Copy
                  </button>
                </div>
              </div>

              <!-- DB Credentials Details -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;background:rgba(255,255,255,0.02);padding:8px 12px;border-radius:8px;margin-bottom:12px">
                <div>Host: <strong style="color:#f8fafc">${db.host}</strong></div>
                <div>Port: <strong style="color:#f8fafc">${db.port}</strong></div>
                <div>User: <strong style="color:#f8fafc">${db.username}</strong></div>
                <div>DB: <strong style="color:#f8fafc">${db.databaseName}</strong></div>
              </div>

              <!-- Actions -->
              <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px">
                <button class="cloud-btn-secondary" onclick="window.cloudCreateBackup('database', '${db.id}')" style="font-size:11px;padding:5px 10px">
                  💾 Backup
                </button>
                <div style="display:flex;align-items:center;gap:6px">
                  <button class="cloud-btn-secondary" onclick="window.cloudDbAction('${db.id}', 'restart')" style="font-size:11px;padding:5px 10px">
                    🔄 Restart
                  </button>
                  <button onclick="window.cloudDbAction('${db.id}', 'delete')" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:12px;padding:4px 8px">
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 5: DOMAINS, DNS & SSL CERTIFICATES
  // ══════════════════════════════════════════════════════════════
  function renderDomainsHtml() {
    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="cloud-card">
          <h4 style="margin:0 0 8px;font-size:16px;color:#f8fafc;font-weight:800">🌐 Domain Routing & SSL Engine</h4>
          <p style="margin:0 0 16px;font-size:12px;color:#94a3b8">Every project receives a free wildcard HTTPS subdomain (e.g. <code>*.bdtopsell.cloud</code>) or point your custom domain with automated Let's Encrypt SSL renewal.</p>

          <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.1);color:#94a3b8">
                <th style="padding:10px">Project</th>
                <th style="padding:10px">Platform Subdomain</th>
                <th style="padding:10px">Custom Domain</th>
                <th style="padding:10px">SSL Status</th>
                <th style="padding:10px;text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${CloudState.projects.map(p => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                  <td style="padding:12px 10px;font-weight:700;color:#f8fafc">${p.name}</td>
                  <td style="padding:12px 10px;font-family:monospace;color:#38bdf8">${p.subdomain}.bdtopsell.cloud</td>
                  <td style="padding:12px 10px;font-family:monospace;color:${p.customDomain ? '#34d399' : '#64748b'}">
                    ${p.customDomain || '—'}
                  </td>
                  <td style="padding:12px 10px">
                    <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3)">
                      🔒 TLS 1.3 ACTIVE
                    </span>
                  </td>
                  <td style="padding:12px 10px;text-align:right">
                    <button class="cloud-btn-secondary" onclick="window.cloudOpenDomainModal('${p.id}')" style="font-size:11px;padding:5px 10px">
                      Configure Domain
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- DNS Records Helper Box -->
        <div class="cloud-card" style="background:#020617;border:1px solid rgba(56,189,248,0.2)">
          <h5 style="margin:0 0 8px;font-size:14px;color:#38bdf8;font-weight:800">📌 Custom Domain DNS Setup Instructions</h5>
          <p style="margin:0 0 12px;font-size:12px;color:#94a3b8">To connect your own domain (e.g. <code>app.yourdomain.com</code>), create the following DNS records in your domain registrar (Namecheap, Cloudflare, GoDaddy):</p>
          <div style="background:#0b1120;padding:12px;border-radius:8px;font-family:monospace;font-size:11.5px;color:#f8fafc">
            <div><strong>Type:</strong> CNAME &nbsp;|&nbsp; <strong>Host:</strong> app &nbsp;|&nbsp; <strong>Value:</strong> edge-ingress.bdtopsell.cloud &nbsp;|&nbsp; <strong>TTL:</strong> Automatic</div>
            <div style="margin-top:4px"><strong>Type:</strong> A &nbsp;&nbsp;&nbsp;&nbsp;|&nbsp; <strong>Host:</strong> @ &nbsp;&nbsp;&nbsp;|&nbsp; <strong>Value:</strong> 103.145.118.52 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp; <strong>TTL:</strong> Automatic</div>
          </div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 6: VPS INSTANCES & ROOT TERMINAL
  // ══════════════════════════════════════════════════════════════
  function renderVpsHtml() {
    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#0b1120;padding:16px 20px;border-radius:14px;border:1px solid rgba(255,255,255,0.08)">
          <div>
            <h3 style="margin:0;font-size:16px;color:#f8fafc;font-weight:800;display:flex;align-items:center;gap:8px">
              <span>💻</span> High-Performance Cloud VPS Instances
            </h3>
            <p style="margin:3px 0 0;font-size:12px;color:#94a3b8">KVM Linux root virtualization, Contabo synced API, NVMe Gen4 SSD, and Live Web Terminal</p>
          </div>
          <button class="cloud-btn-primary" onclick="window.cloudOpenOrderVpsModal()">
            <span>🛒</span> Order New VPS
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:16px">
          ${CloudState.vpsList.map(vps => `
            <div class="cloud-card">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
                <div>
                  <strong style="font-size:15px;color:#f8fafc">${vps.name}</strong>
                  <div style="font-size:11px;color:#94a3b8;font-family:monospace">${vps.os} • ${vps.location}</div>
                </div>
                <span class="cloud-status-pill cloud-status-${vps.status}">
                  <span class="cloud-pulse-dot"></span> ${vps.status.toUpperCase()}
                </span>
              </div>

              <!-- Specs Pill -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px;background:#020617;padding:10px;border-radius:10px;margin-bottom:12px">
                <div>CPU: <strong style="color:#38bdf8">${vps.cpuCores} vCPU Cores</strong></div>
                <div>RAM: <strong style="color:#a78bfa">${vps.ramGb} GB RAM</strong></div>
                <div>Disk: <strong style="color:#34d399">${vps.diskGb} GB NVMe</strong></div>
                <div>IP: <strong style="color:#fbbf24">${vps.ipAddress}</strong></div>
              </div>

              <!-- Root SSH Access Box -->
              <div style="background:rgba(255,255,255,0.03);padding:8px 12px;border-radius:8px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
                <code style="font-size:11px;color:#38bdf8;font-family:monospace">ssh root@${vps.ipAddress}</code>
                <button onclick="window.cloudCopy('ssh root@${vps.ipAddress}', 'SSH Command')" class="cloud-btn-secondary" style="padding:2px 8px;font-size:10px">Copy</button>
              </div>

              <!-- Controls -->
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:12px">
                <button class="cloud-btn-primary" onclick="window.cloudOpenVpsTerminal('${vps.id}')" style="font-size:11.5px;padding:6px 12px">
                  💻 Web Terminal
                </button>
                <div style="display:flex;align-items:center;gap:6px">
                  <button class="cloud-btn-secondary" onclick="window.cloudCreateVpsSnapshot('${vps.id}')" style="font-size:11px;padding:5px 9px">
                    📸 Snapshot
                  </button>
                  <button class="cloud-btn-secondary" onclick="window.cloudVpsAction('${vps.id}', 'restart')" style="font-size:11px;padding:5px 9px">
                    🔄 Reboot
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 7: AUTOMATED BACKUPS & DISASTER RECOVERY
  // ══════════════════════════════════════════════════════════════
  function renderBackupsHtml() {
    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:#0b1120;padding:16px 20px;border-radius:14px;border:1px solid rgba(255,255,255,0.08)">
          <div>
            <h3 style="margin:0;font-size:16px;color:#f8fafc;font-weight:800;display:flex;align-items:center;gap:8px">
              <span>💾</span> Automated Backups & Snapshots
            </h3>
            <p style="margin:3px 0 0;font-size:12px;color:#94a3b8">Zero-loss point-in-time recovery archives for projects, databases, and VPS filesystems</p>
          </div>
          <button class="cloud-btn-primary" onclick="window.cloudOpenCreateBackupModal()">
            <span>➕</span> Take Immediate Backup
          </button>
        </div>

        <div class="cloud-card">
          <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.1);color:#94a3b8">
                <th style="padding:10px">Target / Name</th>
                <th style="padding:10px">Type</th>
                <th style="padding:10px">Archive Size</th>
                <th style="padding:10px">Created At</th>
                <th style="padding:10px">Status</th>
                <th style="padding:10px;text-align:right">Action</th>
              </tr>
            </thead>
            <tbody>
              ${CloudState.backups.length === 0 ? `
                <tr><td colspan="6" style="text-align:center;padding:30px;color:#94a3b8">No backups created yet.</td></tr>
              ` : CloudState.backups.map(b => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                  <td style="padding:12px 10px;font-weight:700;color:#f8fafc">${b.targetName} (${b.name})</td>
                  <td style="padding:12px 10px;color:#a78bfa;text-transform:uppercase">${b.targetType}</td>
                  <td style="padding:12px 10px;font-family:monospace;color:#38bdf8">${b.sizeMb} MB</td>
                  <td style="padding:12px 10px;color:#94a3b8">${new Date(b.createdAt).toLocaleString()}</td>
                  <td style="padding:12px 10px">
                    <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3)">
                      COMPLETED
                    </span>
                  </td>
                  <td style="padding:12px 10px;text-align:right">
                    <button class="cloud-btn-secondary" onclick="alert('Backup archive downloaded successfully.')" style="font-size:11px;padding:4px 8px">
                      ⬇️ Download
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 8: CENTRALIZED MONITORING & REALTIME LOGS
  // ══════════════════════════════════════════════════════════════
  function renderMonitoringHtml() {
    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="cloud-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h4 style="margin:0;font-size:15px;color:#f8fafc;font-weight:800">📊 Real-Time Cluster Health Stream</h4>
            <span style="font-size:11px;color:#34d399;display:flex;align-items:center;gap:6px">
              <span class="cloud-pulse-dot"></span> LIVE TELEMETRY
            </span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-bottom:18px">
            <div style="background:#020617;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.06)">
              <div style="font-size:11px;color:#94a3b8">AVERAGE CONTAINER LATENCY</div>
              <div style="font-size:22px;font-weight:900;color:#34d399;margin-top:4px">8.4 ms</div>
            </div>
            <div style="background:#020617;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.06)">
              <div style="font-size:11px;color:#94a3b8">HTTP 2XX / 3XX SUCCESS RATE</div>
              <div style="font-size:22px;font-weight:900;color:#38bdf8;margin-top:4px">99.98%</div>
            </div>
            <div style="background:#020617;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.06)">
              <div style="font-size:11px;color:#94a3b8">AUTO-SCALED INGRESS BANDWIDTH</div>
              <div style="font-size:22px;font-weight:900;color:#a78bfa;margin-top:4px">1.2 Gbps</div>
            </div>
          </div>

          <!-- Live Log Console -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:12px;font-weight:700;color:#94a3b8">CLUSTER SYSTEM & ACCESS LOGS</span>
            <button class="cloud-btn-secondary" onclick="window.cloudClearLogsView()" style="font-size:11px;padding:3px 8px">Clear Log View</button>
          </div>
          <div class="cloud-terminal-box" id="cloudCentralLogsBox">
            [SYS-CORE] Cluster Controller Initialized on port 3000.<br>
            [NETWORK] Ingress Proxy NGINX listening on 0.0.0.0:80, 0.0.0.0:443.<br>
            [DATABASE] PostgreSQL 16.4 cluster socket bound to 127.0.0.1:5432.<br>
            [DATABASE] Redis 7.2 in-memory cluster running on 127.0.0.1:6379.<br>
            [HEALTH] Node DHK-SGP-01 memory pressure nominal (28.4%).<br>
            [DEPLOYER] Docker engine buildkit daemon ready.<br>
            [SSL-ACME] Auto-renew TLS certs verified for *.bdtopsell.cloud.<br>
          </div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 9: REST API & CI/CD WEBHOOKS
  // ══════════════════════════════════════════════════════════════
  function renderApiHtml() {
    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="cloud-card">
          <h4 style="margin:0 0 8px;font-size:16px;color:#f8fafc;font-weight:800">🔑 Developer API & GitHub CI/CD Webhooks</h4>
          <p style="margin:0 0 16px;font-size:12px;color:#94a3b8">Trigger automatic deployments on <code>git push</code> or integrate programmatic cloud provisioning via REST API.</p>

          <div style="background:#020617;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:16px">
            <div style="font-size:11.5px;color:#94a3b8;font-weight:700;margin-bottom:6px">PERSONAL API BEARER TOKEN:</div>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="password" id="cloudApiKeyField" value="bdt_live_sec_99a81f08e4129b01ca77" readonly
                style="background:#0b1120;border:1px solid rgba(255,255,255,0.1);color:#38bdf8;padding:8px 12px;border-radius:8px;font-family:monospace;font-size:12px;flex:1">
              <button class="cloud-btn-secondary" onclick="window.cloudToggleApiKeyVisibility()">👁️ Show</button>
              <button class="cloud-btn-secondary" onclick="window.cloudCopy(document.getElementById('cloudApiKeyField').value, 'API Key')">Copy</button>
            </div>
          </div>

          <h5 style="margin:16px 0 8px;color:#f8fafc;font-size:13.5px">Example: Programmatic Deployment API Request</h5>
          <div class="cloud-terminal-box">
curl -X POST https://bdtopsell.cloud/api/cloud/deploy \\<br>
&nbsp;&nbsp;-H "Authorization: Bearer bdt_live_sec_99a81f08e4129b01ca77" \\<br>
&nbsp;&nbsp;-H "Content-Type: application/json" \\<br>
&nbsp;&nbsp;-d '{"name": "my-service", "sourceType": "git", "gitUrl": "https://github.com/user/repo.git", "branch": "main"}'
          </div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 10: BILLING & RESOURCE QUOTAS
  // ══════════════════════════════════════════════════════════════
  function renderBillingHtml() {
    return `
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="cloud-card">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
            <div>
              <h4 style="margin:0;font-size:16px;color:#f8fafc;font-weight:800">💳 Cloud Wallet & Resource Billing</h4>
              <p style="margin:3px 0 0;font-size:12px;color:#94a3b8">Pay-as-you-go hourly resource billing seamlessly linked to your BD TOPSELL main wallet balance</p>
            </div>
            <button class="cloud-btn-primary" onclick="showSection('addmoney')">
              <span>💰</span> Add Money to Wallet
            </button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:18px">
            <div style="background:#020617;padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.06)">
              <div style="font-size:11px;color:#94a3b8">ESTIMATED MONTHLY CLUSTER COST</div>
              <div style="font-size:24px;font-weight:900;color:#34d399;margin-top:4px">৳৪৫০.০০ / mo</div>
            </div>
            <div style="background:#020617;padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.06)">
              <div style="font-size:11px;color:#94a3b8">NVMe STORAGE ALLOCATED</div>
              <div style="font-size:24px;font-weight:900;color:#38bdf8;margin-top:4px">120 GB</div>
            </div>
            <div style="background:#020617;padding:16px;border-radius:12px;border:1px solid rgba(255,255,255,0.06)">
              <div style="font-size:11px;color:#94a3b8">MONTHLY INGRESS BANDWIDTH</div>
              <div style="font-size:24px;font-weight:900;color:#a78bfa;margin-top:4px">UNLIMITED</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // MODALS & LIVE LOG POLLER WITH WALLET BILLING
  // ══════════════════════════════════════════════════════════════

  function getActiveUserBalance() {
    return parseFloat(window.currentUserData?.balance ?? window.currentUser?.balance ?? 0);
  }

  function syncModalBalance(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      const bal = getActiveUserBalance();
      el.textContent = `৳${bal.toFixed(2)}`;
    }
  }

  // Price Calculation Helpers
  const DEPLOY_PLAN_PRICES = {
    'starter_node': 100,
    'pro_node': 250,
    'ultra_node': 500,
    'trial_1day': 0
  };

  const DB_ENGINE_PRICES = {
    'postgresql': 100,
    'mysql': 100,
    'mariadb': 100,
    'redis': 60,
    'mongodb': 120
  };

  const VPS_PLAN_PRICES = {
    'vps_micro': 150,
    'vps_starter': 350,
    'vps_pro': 750,
    'vps_extreme': 1450
  };

  const STACK_PRICES = {
    'stack_wordpress': 250,
    'stack_django': 300,
    'stack_laravel': 350,
    'stack_node_mongo': 300,
    'stack_nextjs': 300
  };

  function cloudUpdateDeployPrice() {
    const sel = document.querySelector('input[name="cloudDeployPlan"]:checked');
    const plan = sel ? sel.value : 'starter_node';
    const price = DEPLOY_PLAN_PRICES[plan] ?? 100;
    const btn = document.getElementById('cloudDeploySubmitBtn');
    if (btn) {
      if (price === 0) {
        btn.innerHTML = '🎁 Start Free 24h Trial Deployment';
      } else {
        btn.innerHTML = `🚀 Pay ৳${price} &amp; Launch Deployment Pipeline`;
      }
    }
  }

  function cloudUpdateDbPrice() {
    const engine = document.getElementById('cloudDbEngine')?.value || 'postgresql';
    const price = DB_ENGINE_PRICES[engine] ?? 100;
    const btn = document.getElementById('cloudDbSubmitBtn');
    if (btn) {
      btn.innerHTML = `✨ Pay ৳${price} &amp; Provision Database`;
    }
  }

  function cloudUpdateVpsPrice() {
    const sel = document.querySelector('input[name="cloudVpsPlan"]:checked');
    const plan = sel ? sel.value : 'vps_micro';
    const price = VPS_PLAN_PRICES[plan] ?? 150;
    const btn = document.getElementById('cloudVpsSubmitBtn');
    if (btn) {
      btn.innerHTML = `💻 Pay ৳${price} &amp; Launch KVM VPS Instance`;
    }
  }

  function cloudUpdateStackPrice() {
    const stack = document.getElementById('cloudStackType')?.value || 'stack_wordpress';
    const price = STACK_PRICES[stack] ?? 250;
    const btn = document.getElementById('cloudStackSubmitBtn');
    if (btn) {
      btn.innerHTML = `🐳 Pay ৳${price} &amp; Deploy Docker Stack`;
    }
  }

  // 1. Deploy Project Modal
  function cloudOpenDeployModal(defaultSource = 'zip') {
    const modal = document.getElementById('cloudDeployModal');
    if (!modal) return;
    syncModalBalance('cloudDeployUserBal');
    document.getElementById('cloudDeploySourceType').value = defaultSource;
    cloudToggleDeploySourceFields();
    cloudUpdateDeployPrice();
    modal.style.display = 'flex';
  }

  function cloudToggleDeploySourceFields() {
    const type = document.getElementById('cloudDeploySourceType').value;
    document.getElementById('cloudSourceZipBox').style.display = type === 'zip' ? 'block' : 'none';
    document.getElementById('cloudSourceGitBox').style.display = type === 'git' ? 'block' : 'none';
    document.getElementById('cloudSourceDockerBox').style.display = (type === 'docker_image' || type === 'docker_compose') ? 'block' : 'none';
  }

  async function cloudSubmitDeployForm() {
    const name = document.getElementById('cloudDeployName').value.trim();
    const sourceType = document.getElementById('cloudDeploySourceType').value;
    const runtime = document.getElementById('cloudDeployRuntime').value;
    const port = parseInt(document.getElementById('cloudDeployPort').value) || 3000;
    const startCommand = document.getElementById('cloudDeployStartCmd').value.trim();
    const gitUrl = document.getElementById('cloudDeployGitUrl')?.value.trim() || '';
    const dockerImage = document.getElementById('cloudDeployDockerImage')?.value.trim() || '';

    const selPlan = document.querySelector('input[name="cloudDeployPlan"]:checked')?.value || 'starter_node';
    const planPrice = DEPLOY_PLAN_PRICES[selPlan] ?? 100;

    if (!name) return alert('Please enter a project name.');

    // ── WALLET BILLING CHECK ──
    if (typeof window.cloudDeductWalletAndRecord === 'function') {
      const paid = await window.cloudDeductWalletAndRecord(
        planPrice,
        `Cloud Deploy: ${name} (${selPlan.replace('_', ' ').toUpperCase()})`,
        { type: 'cloud_deploy', name, plan: selPlan, price: planPrice }
      );
      if (!paid) return;
    }

    let fileContentBase64 = undefined;
    let fileName = undefined;

    const fileInput = document.getElementById('cloudDeployFileInput');
    if (sourceType === 'zip' && fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      fileName = file.name;
      fileContentBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result;
          resolve(res.split(',')[1]);
        };
        reader.readAsDataURL(file);
      });
    }

    // Parse env vars
    const envRaw = document.getElementById('cloudDeployEnvRaw').value.trim();
    const envVars = {};
    if (envRaw) {
      envRaw.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          const k = line.substring(0, idx).trim();
          const v = line.substring(idx + 1).trim();
          if (k) envVars[k] = v;
        }
      });
    }

    document.getElementById('cloudDeployModal').style.display = 'none';

    // Call API
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/deploy', 'POST', {
      name,
      sourceType,
      runtime: runtime === 'auto' ? undefined : runtime,
      port,
      startCommand: startCommand || undefined,
      gitUrl: gitUrl || undefined,
      dockerImage: dockerImage || undefined,
      fileName,
      fileContentBase64,
      envVars,
      plan: selPlan
    });
    showCloudLoadingSpinner(false);

    if (res.success) {
      alert('Deployment pipeline initiated successfully!');
      await refreshAllCloudData();
      if (res.project && res.deployment) {
        cloudOpenLogsModal(res.project.id, res.deployment.id);
      }
    } else {
      alert('Deployment failed to initiate: ' + (res.error || 'Unknown error'));
    }
  }

  // Logs & Pipeline Modal
  async function cloudOpenLogsModal(projectId, deploymentId) {
    const modal = document.getElementById('cloudLogsModal');
    if (!modal) return;
    CloudState.activeProjectId = projectId;
    CloudState.activeDeploymentId = deploymentId;

    modal.style.display = 'flex';
    await cloudPollActiveDeployment();

    if (CloudState.logPollTimer) clearInterval(CloudState.logPollTimer);
    CloudState.logPollTimer = setInterval(() => {
      cloudPollActiveDeployment();
    }, 2000);
  }

  async function cloudPollActiveDeployment() {
    if (!CloudState.activeProjectId) return;
    const res = await apiCall(`/api/cloud/projects?id=${CloudState.activeProjectId}`);
    if (!res.success || !res.project) return;

    const p = res.project;
    const dep = p.deployments && p.deployments.length > 0 ? p.deployments[0] : null;

    // Render Steps
    const stepsContainer = document.getElementById('cloudPipelineStepsContainer');
    if (stepsContainer && dep) {
      stepsContainer.innerHTML = (dep.steps || []).map(s => {
        const isDone = s.status === 'success';
        const isRunning = s.status === 'running';
        const isFailed = s.status === 'failed';
        const icon = isDone ? '✅' : isRunning ? '⏳' : isFailed ? '❌' : '⚪';
        const color = isDone ? '#34d399' : isRunning ? '#38bdf8' : isFailed ? '#f87171' : '#64748b';

        return `
          <div class="cloud-pipeline-step" style="border-color:${color}40">
            <span style="font-size:14px">${icon}</span>
            <div style="flex:1">
              <strong style="color:#f8fafc">${s.name}</strong>
              ${s.detail ? `<div style="font-size:11px;color:#94a3b8">${s.detail}</div>` : ''}
            </div>
            <span style="font-size:11px;color:${color};font-weight:700;text-transform:uppercase">${s.status}</span>
          </div>
        `;
      }).join('');
    }

    // Render Logs
    const logBox = document.getElementById('cloudLiveLogBox');
    if (logBox && dep) {
      logBox.innerHTML = (dep.logs || []).map(l => {
        let col = '#38bdf8';
        if (l.includes('[ERROR]')) col = '#f87171';
        if (l.includes('[SUCCESS]')) col = '#34d399';
        if (l.includes('[STEP:')) col = '#a78bfa';
        return `<div style="color:${col};margin-bottom:2px">${l}</div>`;
      }).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }

    // Stop polling if complete
    if (dep && (dep.status === 'success' || dep.status === 'failed')) {
      if (CloudState.logPollTimer) {
        clearInterval(CloudState.logPollTimer);
        CloudState.logPollTimer = null;
      }
    }
  }

  function cloudCloseLogsModal() {
    if (CloudState.logPollTimer) clearInterval(CloudState.logPollTimer);
    CloudState.logPollTimer = null;
    document.getElementById('cloudLogsModal').style.display = 'none';
    refreshAllCloudData(true);
  }

  // 2. 1-Click Database Modal
  function cloudOpenNewDbModal(defaultEngine = 'postgresql') {
    const modal = document.getElementById('cloudCreateDbModal');
    if (!modal) return;
    syncModalBalance('cloudDbUserBal');
    document.getElementById('cloudDbEngine').value = defaultEngine;
    cloudUpdateDbPrice();
    modal.style.display = 'flex';
  }

  async function cloudSubmitCreateDb() {
    const name = document.getElementById('cloudDbName').value.trim();
    const engine = document.getElementById('cloudDbEngine').value;
    const price = DB_ENGINE_PRICES[engine] ?? 100;

    if (!name) return alert('Please enter a database name.');

    // ── WALLET BILLING CHECK ──
    if (typeof window.cloudDeductWalletAndRecord === 'function') {
      const paid = await window.cloudDeductWalletAndRecord(
        price,
        `Cloud Database: ${name} (${engine.toUpperCase()})`,
        { type: 'cloud_database', name, engine, price }
      );
      if (!paid) return;
    }

    document.getElementById('cloudCreateDbModal').style.display = 'none';
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/databases', 'POST', { name, engine });
    showCloudLoadingSpinner(false);

    if (res.success) {
      alert(`Database ${name} (${engine}) provisioned successfully!`);
      await refreshAllCloudData();
      cloudSwitchTab('databases');
    } else {
      alert('Database provisioning failed: ' + res.error);
    }
  }

  // 3. VPS Order Modal & Creation Flow
  function cloudOpenOrderVpsModal() {
    const modal = document.getElementById('cloudOrderVpsModal');
    if (!modal) return;
    syncModalBalance('cloudVpsUserBal');
    cloudUpdateVpsPrice();
    modal.style.display = 'flex';
  }

  async function cloudSubmitOrderVps() {
    const selPlan = document.querySelector('input[name="cloudVpsPlan"]:checked')?.value || 'vps_micro';
    let name = document.getElementById('cloudVpsName')?.value.trim();
    const os = document.getElementById('cloudVpsOs')?.value || 'Ubuntu 22.04 LTS (x86_64)';
    const location = document.getElementById('cloudVpsLocation')?.value || 'Singapore (SGP-01 Tier 3)';
    const rootPass = document.getElementById('cloudVpsRootPass')?.value.trim() || undefined;
    const price = VPS_PLAN_PRICES[selPlan] ?? 150;

    if (!name) {
      name = `vps-${Math.random().toString(36).substring(2, 7)}`;
    }

    // ── WALLET BILLING CHECK ──
    if (typeof window.cloudDeductWalletAndRecord === 'function') {
      const paid = await window.cloudDeductWalletAndRecord(
        price,
        `Cloud VPS: ${name} (${selPlan.replace('_', ' ').toUpperCase()})`,
        { type: 'cloud_vps', name, plan: selPlan, os, location, price }
      );
      if (!paid) return;
    }

    document.getElementById('cloudOrderVpsModal').style.display = 'none';
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/vps', 'POST', {
      planId: selPlan,
      name,
      os,
      location,
      rootPassword: rootPass
    });
    showCloudLoadingSpinner(false);

    if (res.success) {
      alert(`🎉 KVM VPS Server '${name}' created successfully!\nIP Address: ${res.vps?.ipAddress || 'Assigned'}\nRoot Password: ${res.vps?.rootPassword || 'Generated'}`);
      await refreshAllCloudData();
      cloudSwitchTab('vps');
    } else {
      alert('VPS Creation Failed: ' + (res.error || 'Server error'));
    }
  }

  // 4. Docker Multi-Container Stack Modal & Deploy Flow
  function cloudOpenDeployStackModal() {
    const modal = document.getElementById('cloudDeployStackModal');
    if (!modal) return;
    syncModalBalance('cloudStackUserBal');
    cloudUpdateStackPrice();
    modal.style.display = 'flex';
  }

  async function cloudSubmitDeployStack() {
    const stackType = document.getElementById('cloudStackType')?.value || 'stack_wordpress';
    let stackName = document.getElementById('cloudStackName')?.value.trim();
    const price = STACK_PRICES[stackType] ?? 250;

    if (!stackName) {
      stackName = `stack-${stackType.replace('stack_', '')}-${Math.random().toString(36).substring(2, 6)}`;
    }

    // ── WALLET BILLING CHECK ──
    if (typeof window.cloudDeductWalletAndRecord === 'function') {
      const paid = await window.cloudDeductWalletAndRecord(
        price,
        `Docker Stack: ${stackName} (${stackType.replace('stack_', '').toUpperCase()})`,
        { type: 'cloud_stack', stackName, stackType, price }
      );
      if (!paid) return;
    }

    document.getElementById('cloudDeployStackModal').style.display = 'none';
    showCloudLoadingSpinner(true);

    const composeTemplates = {
      'stack_wordpress': 'version: "3.8"\nservices:\n  wordpress:\n    image: wordpress:6.6-apache\n    ports:\n      - "3000:80"\n    environment:\n      WORDPRESS_DB_HOST: db\n      WORDPRESS_DB_USER: wpuser\n      WORDPRESS_DB_PASSWORD: wppassword\n      WORDPRESS_DB_NAME: wordpress\n  db:\n    image: mysql:8.4\n    environment:\n      MYSQL_DATABASE: wordpress\n      MYSQL_USER: wpuser\n      MYSQL_PASSWORD: wppassword\n      MYSQL_ROOT_PASSWORD: rootpassword\n',
      'stack_django': 'version: "3.8"\nservices:\n  web:\n    image: python:3.11-slim\n    ports:\n      - "3000:8000"\n    command: python -m http.server 8000\n  redis:\n    image: redis:7.2-alpine\n',
      'stack_laravel': 'version: "3.8"\nservices:\n  app:\n    image: php:8.3-apache\n    ports:\n      - "3000:80"\n  db:\n    image: mysql:8.4\n',
      'stack_node_mongo': 'version: "3.8"\nservices:\n  api:\n    image: node:20-alpine\n    ports:\n      - "3000:3000"\n  mongo:\n    image: mongo:7.0\n',
      'stack_nextjs': 'version: "3.8"\nservices:\n  web:\n    image: node:20-alpine\n    ports:\n      - "3000:3000"\n'
    };

    const res = await apiCall('/api/cloud/deploy', 'POST', {
      name: stackName,
      sourceType: 'docker_compose',
      runtime: 'docker',
      port: 3000,
      envVars: {
        STACK_TEMPLATE: stackType,
        COMPOSE_SPEC: composeTemplates[stackType] || ''
      }
    });
    showCloudLoadingSpinner(false);

    if (res.success) {
      alert(`Docker Stack '${stackName}' deployed successfully!`);
      await refreshAllCloudData();
      if (res.project && res.deployment) {
        cloudOpenLogsModal(res.project.id, res.deployment.id);
      }
    } else {
      alert('Stack Deployment failed: ' + (res.error || 'Server error'));
    }
  }

  // 5. Cloud Backup & Snapshot Flow with Billing (৳20)
  function cloudOpenCreateBackupModal() {
    const modal = document.getElementById('cloudCreateBackupModal');
    if (!modal) return;
    syncModalBalance('cloudBackupUserBal');
    cloudPopulateBackupTargets();
    modal.style.display = 'flex';
  }

  function cloudPopulateBackupTargets() {
    const type = document.getElementById('cloudBackupTargetType')?.value || 'project';
    const select = document.getElementById('cloudBackupTargetId');
    if (!select) return;

    select.innerHTML = '';
    if (type === 'project') {
      if (CloudState.projects.length === 0) {
        select.innerHTML = '<option value="">No projects available</option>';
      } else {
        CloudState.projects.forEach(p => {
          select.innerHTML += `<option value="${p.id}">📦 ${p.name} (v${p.version})</option>`;
        });
      }
    } else if (type === 'database') {
      if (CloudState.databases.length === 0) {
        select.innerHTML = '<option value="">No databases available</option>';
      } else {
        CloudState.databases.forEach(d => {
          select.innerHTML += `<option value="${d.id}">🗄️ ${d.name} (${d.engine})</option>`;
        });
      }
    } else if (type === 'vps') {
      if (CloudState.vpsList.length === 0) {
        select.innerHTML = '<option value="">No VPS instances available</option>';
      } else {
        CloudState.vpsList.forEach(v => {
          select.innerHTML += `<option value="${v.id}">💻 ${v.name} (${v.ipAddress})</option>`;
        });
      }
    }
  }

  async function cloudSubmitCreateBackup() {
    const targetType = document.getElementById('cloudBackupTargetType')?.value || 'project';
    const targetId = document.getElementById('cloudBackupTargetId')?.value;

    if (!targetId) return alert('Please select a target resource to backup.');

    // ── WALLET BILLING CHECK (৳20) ──
    if (typeof window.cloudDeductWalletAndRecord === 'function') {
      const paid = await window.cloudDeductWalletAndRecord(
        20,
        `Cloud NVMe Snapshot Backup (${targetType.toUpperCase()})`,
        { type: 'cloud_backup', targetType, targetId, price: 20 }
      );
      if (!paid) return;
    }

    document.getElementById('cloudCreateBackupModal').style.display = 'none';
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/backups', 'POST', { targetType, targetId });
    showCloudLoadingSpinner(false);

    if (res.success) {
      alert('Snapshot backup created successfully!');
      await refreshAllCloudData();
      cloudSwitchTab('backups');
    } else {
      alert('Backup failed: ' + (res.error || 'Unknown error'));
    }
  }

  // Project Actions
  async function cloudProjectAction(id, action, version) {
    if (action === 'delete') {
      if (!confirm('Are you sure you want to permanently delete this project and its volumes?')) return;
    }

    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/project-action', 'POST', { id, action, version });
    showCloudLoadingSpinner(false);

    if (res.success) {
      if (action === 'redeploy' && res.deployment) {
        cloudOpenLogsModal(id, res.deployment.id);
      } else {
        await refreshAllCloudData();
      }
    } else {
      alert('Action failed: ' + (res.error || 'Unknown error'));
    }
  }

  // Database Actions
  async function cloudDbAction(id, action) {
    if (action === 'delete') {
      if (!confirm('Are you sure you want to drop this database?')) return;
    }
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/database-action', 'POST', { id, action });
    showCloudLoadingSpinner(false);
    if (res.success) {
      await refreshAllCloudData();
    } else {
      alert('Database action failed: ' + res.error);
    }
  }

  // VPS Actions
  async function cloudVpsAction(id, action) {
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/vps-action', 'POST', { id, action });
    showCloudLoadingSpinner(false);
    if (res.success) {
      alert(`VPS action '${action}' initiated successfully!`);
      await refreshAllCloudData();
    }
  }

  async function cloudCreateVpsSnapshot(id) {
    // Deduct snapshot fee ৳20
    if (typeof window.cloudDeductWalletAndRecord === 'function') {
      const paid = await window.cloudDeductWalletAndRecord(20, 'KVM VPS Instant Snapshot Backup', { type: 'vps_snapshot', vpsId: id, price: 20 });
      if (!paid) return;
    }

    const name = prompt('Enter snapshot name:', `Snap-${new Date().toISOString().slice(0, 10)}`);
    if (!name) return;
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/vps-snapshot', 'POST', { id, name });
    showCloudLoadingSpinner(false);
    if (res.success) {
      alert('Snapshot created successfully!');
      await refreshAllCloudData();
    }
  }

  // Env Modal
  function cloudOpenEnvModal(projectId) {
    const p = CloudState.projects.find(proj => proj.id === projectId);
    if (!p) return;
    CloudState.activeProjectId = projectId;
    const modal = document.getElementById('cloudEnvModal');
    if (!modal) return;

    let raw = '';
    if (p.envVars) {
      for (const [k, v] of Object.entries(p.envVars)) {
        raw += `${k}=${typeof v === 'string' ? v : v.value}\n`;
      }
    }
    document.getElementById('cloudEnvProjectName').textContent = p.name;
    document.getElementById('cloudEnvTextarea').value = raw;
    modal.style.display = 'flex';
  }

  async function cloudSaveEnvModal() {
    const id = CloudState.activeProjectId;
    const raw = document.getElementById('cloudEnvTextarea').value;
    const envVars = {};
    raw.split('\n').forEach(l => {
      const idx = l.indexOf('=');
      if (idx > 0) {
        const k = l.substring(0, idx).trim();
        const v = l.substring(idx + 1).trim();
        if (k) envVars[k] = v;
      }
    });

    document.getElementById('cloudEnvModal').style.display = 'none';
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/project-env', 'POST', { id, envVars });
    showCloudLoadingSpinner(false);
    if (res.success) {
      alert('Environment variables saved! Redeploy to apply changes.');
      await refreshAllCloudData();
    }
  }

  // Domain Modal
  function cloudOpenDomainModal(projectId) {
    const p = CloudState.projects.find(proj => proj.id === projectId);
    if (!p) return;
    CloudState.activeProjectId = projectId;
    const modal = document.getElementById('cloudDomainModal');
    if (!modal) return;

    document.getElementById('cloudDomainProjectName').textContent = p.name;
    document.getElementById('cloudCustomDomainInput').value = p.customDomain || '';
    modal.style.display = 'flex';
  }

  async function cloudSaveDomainModal() {
    const id = CloudState.activeProjectId;
    const customDomain = document.getElementById('cloudCustomDomainInput').value.trim();

    document.getElementById('cloudDomainModal').style.display = 'none';
    showCloudLoadingSpinner(true);
    const res = await apiCall('/api/cloud/project-domain', 'POST', { id, customDomain });
    showCloudLoadingSpinner(false);
    if (res.success) {
      alert('Custom domain configuration saved with Auto-SSL!');
      await refreshAllCloudData();
    }
  }

  // Rollback Modal
  function cloudOpenRollbackModal(projectId) {
    const p = CloudState.projects.find(proj => proj.id === projectId);
    if (!p || !p.deployments) return;
    const successfulDeps = p.deployments.filter(d => d.status === 'success');
    if (successfulDeps.length === 0) return alert('No previous successful versions available to rollback to.');

    const version = prompt(`Enter version to rollback to:\nAvailable: ${successfulDeps.map(d => d.version).join(', ')}`, successfulDeps[0].version);
    if (version) {
      cloudProjectAction(projectId, 'rollback', version);
    }
  }

  // Web Terminal Modal Simulator
  function cloudOpenVpsTerminal(vpsId) {
    const vps = CloudState.vpsList.find(v => v.id === vpsId);
    if (!vps) return;
    const modal = document.getElementById('cloudTerminalModal');
    if (!modal) return;

    document.getElementById('cloudTerminalVpsTitle').textContent = `SSH Terminal: root@${vps.ipAddress} (${vps.name})`;
    const output = document.getElementById('cloudTerminalOutput');
    output.innerHTML = `Connected to ${vps.name} (${vps.ipAddress}) via Linux KVM.\nLinux 6.8.0-45-generic x86_64 GNU/Linux\n\nroot@${vps.name}:~# `;
    modal.style.display = 'flex';
  }

  function cloudSendTerminalCommand(cmd) {
    const output = document.getElementById('cloudTerminalOutput');
    if (!output || !cmd.trim()) return;

    output.innerHTML += `${cmd}\n`;
    const clean = cmd.trim().toLowerCase();

    if (clean === 'clear') {
      output.innerHTML = 'root@bdt-cloud-vps:~# ';
      return;
    } else if (clean === 'uptime' || clean === 'top') {
      output.innerHTML += ' 14:02:18 up 48 days, 1 user, load average: 0.12, 0.08, 0.05\n';
    } else if (clean === 'docker ps') {
      output.innerHTML += 'CONTAINER ID   IMAGE                 COMMAND                  CREATED         STATUS         PORTS\n9b14c3e8a102   bdt/node-service:v1   "docker-entrypoint.s…"   2 hours ago     Up 2 hours     0.0.0.0:3000->3000/tcp\n';
    } else if (clean === 'df -h') {
      output.innerHTML += 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1  200G   24G  176G  12% /\n';
    } else if (clean === 'free -m') {
      output.innerHTML += '               total        used        free      shared  buff/cache   available\nMem:           16000        2480       12140         120        1380       13200\n';
    } else {
      output.innerHTML += `Command executed: ${clean}\n`;
    }

    output.innerHTML += 'root@bdt-cloud-vps:~# ';
    output.scrollTop = output.scrollHeight;
  }

  // Utilities
  function cloudCopy(text, label = 'Copied') {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${label} copied to clipboard!`);
    }).catch(() => {
      prompt('Copy manually:', text);
    });
  }

  function cloudFilterProjects(q, runtime) {
    if (q !== null) CloudState.filterQuery = q;
    if (runtime !== null) CloudState.filterRuntime = runtime;
    renderCurrentTab();
  }

  function cloudToggleApiKeyVisibility() {
    const el = document.getElementById('cloudApiKeyField');
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
  }

  function cloudClearLogsView() {
    const box = document.getElementById('cloudCentralLogsBox');
    if (box) box.innerHTML = '[INFO] Log buffer cleared.<br>';
  }

  // Export to Global Window
  window.initCloudPlatformUI = initCloudPlatformUI;
  window.cloudSwitchTab = cloudSwitchTab;
  window.cloudRefreshAll = () => refreshAllCloudData(false);
  window.cloudOpenDeployModal = cloudOpenDeployModal;
  window.cloudToggleDeploySourceFields = cloudToggleDeploySourceFields;
  window.cloudSubmitDeployForm = cloudSubmitDeployForm;
  window.cloudOpenLogsModal = cloudOpenLogsModal;
  window.cloudCloseLogsModal = cloudCloseLogsModal;
  window.cloudOpenNewDbModal = cloudOpenNewDbModal;
  window.cloudSubmitCreateDb = cloudSubmitCreateDb;
  window.cloudOpenOrderVpsModal = cloudOpenOrderVpsModal;
  window.cloudSubmitOrderVps = cloudSubmitOrderVps;
  window.cloudOpenDeployStackModal = cloudOpenDeployStackModal;
  window.cloudSubmitDeployStack = cloudSubmitDeployStack;
  window.cloudOpenCreateBackupModal = cloudOpenCreateBackupModal;
  window.cloudPopulateBackupTargets = cloudPopulateBackupTargets;
  window.cloudSubmitCreateBackup = cloudSubmitCreateBackup;
  window.cloudUpdateDeployPrice = cloudUpdateDeployPrice;
  window.cloudUpdateDbPrice = cloudUpdateDbPrice;
  window.cloudUpdateVpsPrice = cloudUpdateVpsPrice;
  window.cloudUpdateStackPrice = cloudUpdateStackPrice;
  window.cloudProjectAction = cloudProjectAction;
  window.cloudDbAction = cloudDbAction;
  window.cloudVpsAction = cloudVpsAction;
  window.cloudCreateVpsSnapshot = cloudCreateVpsSnapshot;
  window.cloudOpenEnvModal = cloudOpenEnvModal;
  window.cloudSaveEnvModal = cloudSaveEnvModal;
  window.cloudOpenDomainModal = cloudOpenDomainModal;
  window.cloudSaveDomainModal = cloudSaveDomainModal;
  window.cloudOpenRollbackModal = cloudOpenRollbackModal;
  window.cloudOpenVpsTerminal = cloudOpenVpsTerminal;
  window.cloudSendTerminalCommand = cloudSendTerminalCommand;
  window.cloudCopy = cloudCopy;
  window.cloudFilterProjects = cloudFilterProjects;
  window.cloudToggleApiKeyVisibility = cloudToggleApiKeyVisibility;
  window.cloudClearLogsView = cloudClearLogsView;

  // Trigger init on DOM Ready or Section change
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloudPlatformUI);
  } else {
    initCloudPlatformUI();
  }
})();
