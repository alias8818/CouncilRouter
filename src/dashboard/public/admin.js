/**
 * Admin Dashboard Client-Side JavaScript
 *
 * @fileoverview Frontend JavaScript for admin dashboard
 * @browser
 */

/* eslint-env browser */

// State management
let currentTab = "overview";
let refreshInterval = null;

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  loadOverview();
  startAutoRefresh();
});

/**
 * Setup tab navigation
 */
function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === tabName);
  });

  currentTab = tabName;

  // Load tab-specific data
  switch (tabName) {
    case "overview":
      loadOverview();
      break;
    case "query":
      setupQueryPresetSelector();
      break;
    case "providers":
      loadProviders();
      break;
    case "models":
      loadModels();
      loadSyncStatus();
      loadSyncHistory();
      break;
    case "config":
      loadConfig();
      break;
    case "analytics":
      loadAnalytics();
      break;
    case "logs":
      loadLogs();
      break;
  }
}

/**
 * Start auto-refresh for active tab
 */
function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(() => {
    switch (currentTab) {
      case "overview":
        loadOverview();
        break;
      case "providers":
        loadProviders();
        break;
      case "logs":
        loadLogs();
        break;
    }
  }, 10000); // Refresh every 10 seconds
}

/**
 * Show loading spinner
 */
function showLoading() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) {
    spinner.classList.remove("hidden");
  }
}

/**
 * Hide loading spinner
 */
function hideLoading() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) {
    spinner.classList.add("hidden");
  }
}

/**
 * Update last updated timestamp
 */
function updateLastUpdated() {
  const lastUpdated = document.getElementById("last-updated");
  if (lastUpdated) {
    const now = new Date();
    lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString()}`;
  }
}

/**
 * Load overview metrics
 */
async function loadOverview() {
  showLoading();
  try {
    const [overview, activity] = await Promise.all([
      fetch("/api/admin/overview").then((r) => r.json()),
      fetch("/api/admin/activity?limit=10").then((r) => r.json()),
    ]);

    // Update metrics
    document.getElementById("total-requests").textContent =
      overview.totalRequests;
    document.getElementById("active-sessions").textContent =
      overview.activeSessions;
    document.getElementById("avg-response-time").textContent =
      overview.avgResponseTime;
    document.getElementById("total-cost").textContent = overview.totalCost;
    document.getElementById("today-cost").textContent = overview.todayCost;
    document.getElementById("avg-cost").textContent = overview.avgCost;
    document.getElementById("success-rate").textContent = overview.successRate;
    document.getElementById("consensus-rate").textContent =
      overview.consensusRate;
    document.getElementById("avg-deliberations").textContent =
      overview.avgDeliberations;

    // Update recent activity
    const activityContainer = document.getElementById("recent-activity");
    if (activity.length === 0) {
      activityContainer.innerHTML =
        '<p style="color: var(--text-muted, #606070); text-align: center; padding: 40px;">No recent activity</p>';
    } else {
      activityContainer.innerHTML = activity
        .map((item) => {
          const statusClass =
            item.status === "completed"
              ? "success"
              : item.status === "failed"
                ? "error"
                : "pending";
          const statusIcon =
            item.status === "completed"
              ? "✓"
              : item.status === "failed"
                ? "✗"
                : "⏳";
          return `
                <div class="activity-item">
                    <div class="activity-icon ${statusClass}">${statusIcon}</div>
                    <div class="activity-content">
                        <div class="activity-title">${item.query.substring(0, 60)}${item.query.length > 60 ? "..." : ""}</div>
                        <div class="activity-meta">
                            <span style="color: var(--accent-cyan, #00d4ff);">${item.requestId.substring(0, 8)}</span> •
                            ${new Date(item.timestamp).toLocaleString()} •
                            <span style="color: var(--accent-emerald, #10b981);">${item.cost}</span> •
                            ${item.latency} •
                            Agreement: ${item.agreement}
                        </div>
                    </div>
                </div>
            `;
        })
        .join("");
    }

    updateLastUpdated();
  } catch (error) {
    console.error("Error loading overview:", error);
    showError("Failed to load overview data");
  } finally {
    hideLoading();
  }
}

/**
 * Load provider health status
 */
async function loadProviders() {
  showLoading();
  try {
    const providers = await fetch("/api/admin/providers").then((r) => r.json());

    const providerList = document.getElementById("provider-list");
    if (providers.length === 0) {
      providerList.innerHTML =
        '<p style="color: var(--text-muted, #606070); text-align: center; padding: 40px;">No providers configured</p>';
      return;
    }

    providerList.innerHTML = providers
      .map(
        (provider) => `
            <div class="provider-item">
                <div class="provider-header">
                    <span class="provider-name">${provider.name}</span>
                    <span class="status ${provider.status}">${provider.status}</span>
                </div>
                <div class="provider-stats">
                    <div class="provider-stat">
                        Success Rate
                        <strong style="color: var(--accent-emerald, #10b981);">${provider.successRate}</strong>
                    </div>
                    <div class="provider-stat">
                        Avg Latency
                        <strong style="color: var(--accent-cyan, #00d4ff);">${provider.avgLatency}</strong>
                    </div>
                    <div class="provider-stat">
                        Requests
                        <strong style="color: var(--accent-purple, #a855f7);">${provider.requestCount}</strong>
                    </div>
                </div>
                ${
                  provider.consecutiveFailures > 0
                    ? `
                    <div style="margin-top: 12px; padding: 12px 16px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; font-size: 13px; color: var(--accent-red, #ef4444);">
                        ⚠️ ${provider.consecutiveFailures} consecutive failures
                    </div>
                `
                    : ""
                }
            </div>
        `,
      )
      .join("");

    updateLastUpdated();
  } catch (error) {
    console.error("Error loading providers:", error);
    showError("Failed to load provider data");
  } finally {
    hideLoading();
  }
}

// Global state for available models
let availableModels = {};

/**
 * Load configuration
 */
async function loadConfig() {
  showLoading();
  try {
    // Load available models first
    await loadAvailableModels();

    const config = await fetch("/api/admin/config").then((r) => r.json());

    // Update form fields
    document.getElementById("max-rounds").value = config.maxRounds || 1;
    document.getElementById("global-timeout").value =
      config.globalTimeout || 60;
    document.getElementById("synthesis-strategy").value =
      config.synthesisStrategy || "consensus-extraction";

    // Update active council members display
    const membersList = document.getElementById("active-members-list");
    if (config.members && config.members.length > 0) {
      membersList.innerHTML = config.members
        .map(
          (member) => `
                <div class="provider-item">
                    <div class="provider-header">
                        <span class="provider-name">${member.id}</span>
                        <span class="status ${member.enabled ? "healthy" : "disabled"}">
                            ${member.enabled ? "enabled" : "disabled"}
                        </span>
                    </div>
                    <div class="provider-stats">
                        <div class="provider-stat">
                            Provider: <strong>${member.provider}</strong>
                        </div>
                        <div class="provider-stat">
                            Model: <strong>${member.model}</strong>
                        </div>
                        <div class="provider-stat">
                            Timeout: <strong>${member.timeout}s</strong>
                        </div>
                    </div>
                </div>
            `,
        )
        .join("");

      // Set member count
      document.getElementById("member-count").value = config.members.length;
    } else {
      membersList.innerHTML =
        '<p style="color: var(--text-muted, #606070); text-align: center; padding: 40px;">No council members configured</p>';
    }

    // Initialize member slots
    updateMemberSlots();

    updateLastUpdated();
  } catch (error) {
    console.error("Error loading config:", error);
    showError("Failed to load configuration");
  } finally {
    hideLoading();
  }
}

/**
 * Load available models from the synced model list
 */
async function loadAvailableModels() {
  try {
    const response = await fetch("/api/admin/available-models");
    availableModels = await response.json();
    console.log("Loaded available models:", availableModels);
  } catch (error) {
    console.error("Error loading available models:", error);
    availableModels = {};
  }
}

/**
 * Load a preset for editing
 */
async function loadPresetForEditing() {
  const presetSelect = document.getElementById("config-preset");
  const presetName = presetSelect.value;
  const customNameGroup = document.getElementById("custom-preset-name-group");
  const descriptionDiv = document.getElementById("preset-description");

  if (!presetName) {
    customNameGroup.style.display = "none";
    descriptionDiv.textContent = "";
    return;
  }

  if (presetName === "custom") {
    customNameGroup.style.display = "block";
    descriptionDiv.textContent =
      "Create a new custom preset with your own configuration.";
    document.getElementById("member-count").value = 3;
    updateMemberSlots();
    return;
  }

  customNameGroup.style.display = "none";

  try {
    const preset = await fetch(`/api/admin/presets/${presetName}`).then((r) =>
      r.json(),
    );

    descriptionDiv.textContent = preset.description || "";

    // Update form fields
    document.getElementById("max-rounds").value =
      preset.deliberationRounds || 1;
    document.getElementById("global-timeout").value =
      preset.globalTimeout || 60;
    document.getElementById("synthesis-strategy").value =
      preset.synthesisStrategy || "consensus-extraction";

    // Update member count and slots
    const memberCount = preset.members ? preset.members.length : 3;
    document.getElementById("member-count").value = memberCount;
    updateMemberSlots();

    // Populate member slots with preset values
    if (preset.members) {
      preset.members.forEach((member, idx) => {
        const providerSelect = document.getElementById(
          `member-${idx}-provider`,
        );
        const modelSelect = document.getElementById(`member-${idx}-model`);
        const timeoutInput = document.getElementById(`member-${idx}-timeout`);

        if (providerSelect) {
          providerSelect.value = member.provider;
          updateModelOptions(idx);

          // Set model after options are loaded
          setTimeout(() => {
            if (modelSelect) modelSelect.value = member.model;
          }, 100);
        }
        if (timeoutInput) timeoutInput.value = member.timeout || 30;
      });
    }
  } catch (error) {
    console.error("Error loading preset:", error);
    showError("Failed to load preset");
  }
}

/**
 * Update member slots based on count
 */
function updateMemberSlots() {
  const count = parseInt(document.getElementById("member-count").value) || 3;
  const container = document.getElementById("member-slots-container");

  const providers = Object.keys(availableModels);

  let html = "";
  for (let i = 0; i < count; i++) {
    html += `
      <div class="provider-item" style="margin-bottom: 16px;">
        <div class="provider-header">
          <span class="provider-name">Member ${i + 1}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 2fr 100px; gap: 12px; margin-top: 12px;">
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.8rem;">Provider</label>
            <select id="member-${i}-provider" onchange="updateModelOptions(${i})">
              <option value="">Select Provider</option>
              ${providers.map((p) => `<option value="${p}">${p}</option>`).join("")}
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.8rem;">Model</label>
            <select id="member-${i}-model">
              <option value="">Select Model</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label style="font-size: 0.8rem;">Timeout (s)</label>
            <input type="number" id="member-${i}-timeout" value="30" min="5" max="120">
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

/**
 * Update model options when provider changes
 */
function updateModelOptions(memberIndex) {
  const providerSelect = document.getElementById(
    `member-${memberIndex}-provider`,
  );
  const modelSelect = document.getElementById(`member-${memberIndex}-model`);
  const provider = providerSelect.value;

  if (!provider || !availableModels[provider]) {
    modelSelect.innerHTML = '<option value="">Select Model</option>';
    return;
  }

  const models = availableModels[provider];
  modelSelect.innerHTML =
    '<option value="">Select Model</option>' +
    models
      .map((m) => `<option value="${m.id}">${m.displayName || m.id}</option>`)
      .join("");
}

/**
 * Save preset configuration
 */
async function savePresetConfiguration() {
  try {
    const presetSelect = document.getElementById("config-preset");
    let presetName = presetSelect.value;

    if (presetName === "custom") {
      presetName = document.getElementById("custom-preset-name").value;
      if (!presetName) {
        showError("Please enter a name for your custom preset");
        return;
      }
    }

    if (!presetName) {
      showError("Please select a preset to save");
      return;
    }

    // Gather member configurations
    const memberCount = parseInt(document.getElementById("member-count").value);
    const members = [];

    for (let i = 0; i < memberCount; i++) {
      const provider = document.getElementById(`member-${i}-provider`).value;
      const model = document.getElementById(`member-${i}-model`).value;
      const timeout =
        parseInt(document.getElementById(`member-${i}-timeout`).value) || 30;

      if (provider && model) {
        members.push({ provider, model, timeout });
      }
    }

    if (members.length === 0) {
      showError("Please configure at least one council member");
      return;
    }

    const config = {
      members,
      deliberationRounds: parseInt(document.getElementById("max-rounds").value),
      globalTimeout: parseInt(document.getElementById("global-timeout").value),
      synthesisStrategy: document.getElementById("synthesis-strategy").value,
    };

    const response = await fetch(`/api/admin/presets/${presetName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

    if (response.ok) {
      showSuccess(`Preset '${presetName}' saved successfully`);
    } else {
      const error = await response.json();
      showError(error.error || "Failed to save preset");
    }
  } catch (error) {
    console.error("Error saving preset:", error);
    showError("Failed to save preset");
  }
}

/**
 * Apply preset to the active council
 */
async function applyPresetToCouncil() {
  try {
    const presetSelect = document.getElementById("config-preset");
    let presetName = presetSelect.value;

    if (presetName === "custom") {
      presetName = document.getElementById("custom-preset-name").value;
    }

    if (!presetName) {
      // Apply current form values directly
      const memberCount = parseInt(
        document.getElementById("member-count").value,
      );
      const members = [];

      for (let i = 0; i < memberCount; i++) {
        const provider = document.getElementById(`member-${i}-provider`).value;
        const model = document.getElementById(`member-${i}-model`).value;
        const timeout =
          parseInt(document.getElementById(`member-${i}-timeout`).value) || 30;

        if (provider && model) {
          members.push({ provider, model, timeout });
        }
      }

      if (members.length === 0) {
        showError("Please configure at least one council member");
        return;
      }

      const response = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members,
          maxRounds: parseInt(document.getElementById("max-rounds").value),
          synthesisStrategy:
            document.getElementById("synthesis-strategy").value,
        }),
      });

      if (response.ok) {
        showSuccess("Configuration applied to active council");
        loadConfig();
      } else {
        showError("Failed to apply configuration");
      }
    } else {
      // Apply preset by name
      const response = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: presetName }),
      });

      if (response.ok) {
        showSuccess(`Preset '${presetName}' applied to active council`);
        loadConfig();
      } else {
        showError("Failed to apply preset");
      }
    }
  } catch (error) {
    console.error("Error applying configuration:", error);
    showError("Failed to apply configuration");
  }
}

/**
 * Save configuration (legacy function for compatibility)
 */
async function saveConfiguration() {
  await applyPresetToCouncil();
}

/**
 * Load analytics
 */
async function loadAnalytics() {
  showLoading();
  try {
    const [performance, cost] = await Promise.all([
      fetch("/api/admin/analytics/performance?days=7").then((r) => r.json()),
      fetch("/api/admin/analytics/cost?days=7").then((r) => r.json()),
    ]);

    // Display analytics with Aurora theme styling
    const requestChart = document.getElementById("request-chart");
    requestChart.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px;">
                <div style="text-align: center; padding: 20px; background: rgba(0, 212, 255, 0.05); border-radius: 12px; border: 1px solid rgba(0, 212, 255, 0.2);">
                    <div style="font-size: 28px; font-weight: 700; color: var(--accent-cyan, #00d4ff);">${performance.totalRequests}</div>
                    <div style="font-size: 12px; color: var(--text-muted, #606070); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Total Requests</div>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(16, 185, 129, 0.05); border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
                    <div style="font-size: 28px; font-weight: 700; color: var(--accent-emerald, #10b981);">${(performance.successRate * 100).toFixed(1)}%</div>
                    <div style="font-size: 12px; color: var(--text-muted, #606070); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Success Rate</div>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(168, 85, 247, 0.05); border-radius: 12px; border: 1px solid rgba(168, 85, 247, 0.2);">
                    <div style="font-size: 28px; font-weight: 700; color: var(--accent-purple, #a855f7);">${(performance.consensusRate * 100).toFixed(1)}%</div>
                    <div style="font-size: 12px; color: var(--text-muted, #606070); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Consensus Rate</div>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(245, 158, 11, 0.05); border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.2);">
                    <div style="font-size: 28px; font-weight: 700; color: var(--accent-amber, #f59e0b);">${Math.round(performance.averageLatency)}ms</div>
                    <div style="font-size: 12px; color: var(--text-muted, #606070); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Avg Latency</div>
                </div>
                <div style="text-align: center; padding: 20px; background: rgba(236, 72, 153, 0.05); border-radius: 12px; border: 1px solid rgba(236, 72, 153, 0.2);">
                    <div style="font-size: 28px; font-weight: 700; color: var(--accent-pink, #ec4899);">${performance.averageDeliberationRounds.toFixed(1)}</div>
                    <div style="font-size: 12px; color: var(--text-muted, #606070); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Avg Rounds</div>
                </div>
            </div>
        `;

    const costChart = document.getElementById("cost-chart");
    const providerCosts = Object.entries(cost.costByProvider)
      .map(
        ([provider, amount]) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-tertiary, #10101a); border-radius: 8px; margin-bottom: 8px;">
                    <span style="font-weight: 500;">${provider}</span>
                    <span style="font-weight: 700; color: var(--accent-emerald, #10b981);">$${amount.toFixed(4)}</span>
                </div>
            `,
      )
      .join("");

    costChart.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                <div style="text-align: center; padding: 24px; background: rgba(16, 185, 129, 0.05); border-radius: 12px; border: 1px solid rgba(16, 185, 129, 0.2);">
                    <div style="font-size: 32px; font-weight: 700; color: var(--accent-emerald, #10b981);">$${cost.totalCost.toFixed(4)}</div>
                    <div style="font-size: 12px; color: var(--text-muted, #606070); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Total Cost</div>
                </div>
                <div style="text-align: center; padding: 24px; background: rgba(0, 212, 255, 0.05); border-radius: 12px; border: 1px solid rgba(0, 212, 255, 0.2);">
                    <div style="font-size: 32px; font-weight: 700; color: var(--accent-cyan, #00d4ff);">$${cost.averageCostPerRequest.toFixed(4)}</div>
                    <div style="font-size: 12px; color: var(--text-muted, #606070); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em;">Avg/Request</div>
                </div>
            </div>
            <div>
                <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary, #a0a0b0); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Cost by Provider</div>
                ${providerCosts || '<div style="color: var(--text-muted, #606070); text-align: center; padding: 20px;">No data available</div>'}
            </div>
        `;
    updateLastUpdated();
  } catch (error) {
    console.error("Error loading analytics:", error);
    showError("Failed to load analytics");
  } finally {
    hideLoading();
  }
}

/**
 * Load system logs
 */
async function loadLogs() {
  showLoading();
  try {
    const logs = await fetch("/api/admin/logs?limit=50").then((r) => r.json());

    const logContainer = document.getElementById("log-container");
    if (logs.length === 0) {
      logContainer.innerHTML =
        '<p style="color: var(--text-muted, #606070); text-align: center; padding: 40px;">No logs available</p>';
      return;
    }

    logContainer.innerHTML = logs
      .map((log) => {
        const logClass = log.type.includes("error")
          ? "error"
          : log.type.includes("warning")
            ? "warning"
            : "info";
        const logIcon = log.type.includes("error")
          ? "❌"
          : log.type.includes("warning")
            ? "⚠️"
            : "ℹ️";

        return `
                    <div class="log-entry ${logClass}">
                        <span class="log-timestamp">${new Date(log.timestamp).toLocaleString()}</span>
                        <strong>${logIcon} ${log.type}</strong>
                        <pre style="margin-top: 12px; color: var(--text-secondary, #a0a0b0); font-size: 12px; background: var(--bg-tertiary, #10101a); padding: 12px; border-radius: 8px; overflow-x: auto;">${JSON.stringify(log.data, null, 2)}</pre>
                    </div>
                `;
      })
      .join("");
    updateLastUpdated();
  } catch (error) {
    console.error("Error loading logs:", error);
    showError("Failed to load logs");
  } finally {
    hideLoading();
  }
}

/**
 * Show success message
 */
function showSuccess(message) {
  const alert = document.createElement("div");
  alert.className = "alert alert-success";
  alert.textContent = message;

  document
    .querySelector(".container")
    .insertBefore(alert, document.querySelector(".tabs"));

  setTimeout(() => alert.remove(), 3000);
}

/**
 * Show error message
 */
function showError(message) {
  const alert = document.createElement("div");
  alert.className = "alert alert-error";
  alert.textContent = message;

  document
    .querySelector(".container")
    .insertBefore(alert, document.querySelector(".tabs"));

  setTimeout(() => alert.remove(), 5000);
}

/**
 * Handle preset selection
 */
document.addEventListener("DOMContentLoaded", () => {
  const presetSelect = document.getElementById("config-preset");
  if (presetSelect) {
    presetSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        // Disable manual inputs when preset is selected
        document.getElementById("max-rounds").disabled = true;
        document.getElementById("consensus-threshold").disabled = true;
        document.getElementById("synthesis-strategy").disabled = true;
      } else {
        // Enable manual inputs when custom is selected
        document.getElementById("max-rounds").disabled = false;
        document.getElementById("consensus-threshold").disabled = false;
        document.getElementById("synthesis-strategy").disabled = false;
      }
    });
  }
});

function closeModal() {
  document.getElementById("request-modal").classList.remove("active");
}

/**
 * Load discovered models
 */
async function loadModels() {
  showLoading();
  try {
    const providerFilter =
      document.getElementById("model-provider-filter")?.value || "";
    const url = providerFilter
      ? `/api/admin/models?provider=${providerFilter}`
      : "/api/admin/models";

    const response = await fetch(url).then((r) => r.json());

    const modelList = document.getElementById("model-list");
    if (!response.models || response.models.length === 0) {
      modelList.innerHTML =
        '<p style="color: #64748b; text-align: center; padding: 20px;">No models discovered yet. Click "Sync Now" to fetch models.</p>';
      return;
    }

    modelList.innerHTML = response.models
      .map(
        (model) => `
            <div class="provider-item">
                <div class="provider-header">
                    <span class="provider-name">${model.displayName || model.id}</span>
                    <span class="status ${model.usability === "available" ? "healthy" : model.usability === "deprecated" ? "disabled" : "degraded"}">
                        ${model.usability}
                    </span>
                </div>
                <div class="provider-stats">
                    <div class="provider-stat">
                        Provider: <strong>${model.provider}</strong>
                    </div>
                    <div class="provider-stat">
                        Context: <strong>${model.contextWindow.toLocaleString()} tokens</strong>
                    </div>
                    <div class="provider-stat">
                        Classifications: <strong>${model.classification.join(", ")}</strong>
                    </div>
                </div>
                ${
                  model.pricing && model.pricing.length > 0
                    ? `
                    <div style="margin-top: 12px; padding: 12px; background: #0f172a; border-radius: 6px;">
                        <strong style="font-size: 13px; color: #cbd5e1;">Pricing:</strong>
                        ${model.pricing
                          .map(
                            (p) => `
                            <div style="margin-top: 8px; font-size: 12px; color: #94a3b8;">
                                ${p.tier}: $${p.inputCostPerMillion.toFixed(2)}/M input, $${p.outputCostPerMillion.toFixed(2)}/M output
                            </div>
                        `,
                          )
                          .join("")}
                    </div>
                `
                    : ""
                }
                <div style="margin-top: 8px; font-size: 11px; color: #64748b;">
                    Discovered: ${new Date(model.discoveredAt).toLocaleString()}
                </div>
            </div>
        `,
      )
      .join("");

    updateLastUpdated();
  } catch (error) {
    console.error("Error loading models:", error);
    const modelList = document.getElementById("model-list");
    modelList.innerHTML =
      '<p style="color: #ef4444; text-align: center; padding: 20px;">Model Registry not configured or unavailable</p>';
  } finally {
    hideLoading();
  }
}

/**
 * Load sync status
 */
async function loadSyncStatus() {
  try {
    const status = await fetch("/api/admin/sync/status").then((r) => r.json());

    const syncStatusDiv = document.getElementById("sync-status");
    syncStatusDiv.innerHTML = `
            <div class="metric">
                <span class="metric-label">Last Sync</span>
                <span class="metric-value" style="font-size: 14px;">
                    ${status.lastSync ? new Date(status.lastSync).toLocaleString() : "Never"}
                </span>
            </div>
            <div class="metric">
                <span class="metric-label">Next Sync</span>
                <span class="metric-value" style="font-size: 14px;">
                    ${status.nextSync ? new Date(status.nextSync).toLocaleString() : "Not scheduled"}
                </span>
            </div>
            <div class="metric">
                <span class="metric-label">Status</span>
                <span class="status ${status.status === "idle" ? "healthy" : status.status === "running" ? "degraded" : "disabled"}">
                    ${status.status}
                </span>
            </div>
            ${
              status.lastResult
                ? `
                <div style="margin-top: 16px; padding: 12px; background: #0f172a; border-radius: 6px;">
                    <strong style="font-size: 13px; color: #cbd5e1;">Last Sync Result:</strong>
                    <div style="margin-top: 8px; font-size: 12px; color: #94a3b8;">
                        <div>Models Discovered: ${status.lastResult.modelsDiscovered}</div>
                        <div>Models Updated: ${status.lastResult.modelsUpdated}</div>
                        <div>Models Deprecated: ${status.lastResult.modelsDeprecated}</div>
                        <div>Pricing Updated: ${status.lastResult.pricingUpdated}</div>
                        ${
                          status.lastResult.errors &&
                          status.lastResult.errors.length > 0
                            ? `
                            <div style="margin-top: 8px; color: #ef4444;">
                                Errors: ${status.lastResult.errors.length}
                            </div>
                        `
                            : ""
                        }
                    </div>
                </div>
            `
                : ""
            }
        `;
  } catch (error) {
    console.error("Error loading sync status:", error);
    const syncStatusDiv = document.getElementById("sync-status");
    syncStatusDiv.innerHTML =
      '<p style="color: #ef4444; text-align: center; padding: 20px;">Sync Scheduler not configured or unavailable</p>';
  }
}

/**
 * Trigger manual model sync
 */
async function triggerModelSync() {
  try {
    showSuccess("Sync started...");
    const result = await fetch("/api/admin/sync/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then((r) => r.json());

    if (result.success) {
      showSuccess(
        `Sync completed! Discovered: ${result.modelsDiscovered}, Updated: ${result.modelsUpdated}`,
      );
      // Reload models and sync status
      loadModels();
      loadSyncStatus();
    } else {
      showError("Sync failed. Check logs for details.");
    }
  } catch (error) {
    console.error("Error triggering sync:", error);
    showError("Failed to trigger sync");
  }
}

// Add event listener for model provider filter
document.addEventListener("DOMContentLoaded", () => {
  const filterSelect = document.getElementById("model-provider-filter");
  if (filterSelect) {
    filterSelect.addEventListener("change", () => {
      loadModels();
    });
  }
});

/**
 * Load sync history
 */
async function loadSyncHistory() {
  try {
    const response = await fetch("/api/admin/sync/history?limit=10").then((r) =>
      r.json(),
    );

    // Display sync history
    const historyDiv = document.getElementById("sync-history");
    if (!response.history || response.history.length === 0) {
      historyDiv.innerHTML =
        '<p style="color: #64748b; text-align: center; padding: 20px;">No sync history available</p>';
    } else {
      historyDiv.innerHTML = response.history
        .map(
          (sync) => `
                <div class="log-entry ${sync.status === "failed" ? "error" : "info"}">
                    <span class="log-timestamp">${new Date(sync.timestamp).toLocaleString()}</span>
                    <strong>${sync.provider}</strong> - ${sync.status}
                    <div style="margin-top: 8px; font-size: 12px; color: #94a3b8;">
                        Discovered: ${sync.modelsDiscovered} | Updated: ${sync.modelsUpdated} |
                        Deprecated: ${sync.modelsDeprecated} | Pricing: ${sync.pricingUpdated}
                    </div>
                    ${
                      sync.errors && sync.errors.length > 0
                        ? `
                        <div style="margin-top: 8px; padding: 8px; background: #ef444420; border-radius: 4px; font-size: 11px; color: #ef4444;">
                            ${sync.errors.length} error(s) occurred
                        </div>
                    `
                        : ""
                    }
                </div>
            `,
        )
        .join("");
    }

    // Display provider stats
    const statsDiv = document.getElementById("provider-sync-stats");
    if (!response.providerStats || response.providerStats.length === 0) {
      statsDiv.innerHTML =
        '<p style="color: #64748b; text-align: center; padding: 20px;">No provider stats available</p>';
    } else {
      statsDiv.innerHTML = response.providerStats
        .map(
          (stat) => `
                <div class="provider-item">
                    <div class="provider-header">
                        <span class="provider-name">${stat.provider}</span>
                        <span class="status ${parseFloat(stat.successRate) > 90 ? "healthy" : parseFloat(stat.successRate) > 50 ? "degraded" : "disabled"}">
                            ${stat.successRate}% success
                        </span>
                    </div>
                    <div class="provider-stats">
                        <div class="provider-stat">
                            Total Syncs: <strong>${stat.totalSyncs}</strong>
                        </div>
                        <div class="provider-stat">
                            Successful: <strong>${stat.successfulSyncs}</strong>
                        </div>
                        <div class="provider-stat">
                            Failed: <strong>${stat.failedSyncs}</strong>
                        </div>
                    </div>
                    ${
                      stat.failedSyncs > 3
                        ? `
                        <div style="margin-top: 8px; padding: 8px; background: #f59e0b20; border-radius: 4px; font-size: 12px; color: #f59e0b;">
                            ⚠️ High failure rate detected
                        </div>
                    `
                        : ""
                    }
                </div>
            `,
        )
        .join("");
    }
  } catch (error) {
    console.error("Error loading sync history:", error);
    const historyDiv = document.getElementById("sync-history");
    historyDiv.innerHTML =
      '<p style="color: #ef4444; text-align: center; padding: 20px;">Failed to load sync history</p>';
  }
}

// ============================================================================
// Test Query Functions
// ============================================================================

let PRESET_INFO = {
  "fast-council": {
    title: "⚡ Fast Council",
    desc: "Uses GPT-4o-mini, Claude Haiku 4.5, and Gemini Flash for quick responses. Best for simple queries where speed matters.",
    models: ["gpt-4o-mini", "claude-haiku-4.5", "gemini-2.0-flash"],
  },
  "balanced-council": {
    title: "⚖️ Balanced Council",
    desc: "Uses GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Pro, and Grok 3 for a good balance of quality and speed.",
    models: ["gpt-4o", "claude-sonnet-4.5", "gemini-2.5-pro", "grok-3"],
  },
  "research-council": {
    title: "🔬 Research Council",
    desc: "Flagship models: GPT-5.1, Claude Opus 4.5, Gemini 3 Pro, and Grok 4.1 for deep analysis and complex reasoning.",
    models: ["gpt-5.1", "claude-opus-4.5", "gemini-3-pro-preview", "grok-4-1-fast-reasoning"],
  },
  "coding-council": {
    title: "💻 Coding Council",
    desc: "Optimized for code with Claude Sonnet 4.5 (lead), GPT-5.1, Gemini 2.5 Pro, and Grok 3.",
    models: ["claude-sonnet-4.5", "gpt-5.1", "gemini-2.5-pro", "grok-3"],
  },
  "cost-effective-council": {
    title: "💰 Cost-Effective Council",
    desc: "Budget-friendly models: GPT-4o-mini, Claude Haiku, Gemini Flash-Lite, and Grok Mini. Great for high-volume, simple tasks.",
    models: [
      "gpt-4o-mini",
      "claude-3-5-haiku",
      "gemini-2.5-flash-lite",
      "grok-3-mini",
    ],
  },
  "free-council": {
    title: "🆓 Free Council",
    desc: "Zero-cost! Auto-selects the 5 best free models from OpenRouter. Updated on every startup to use the most capable free models available.",
    models: [
      "DeepSeek R1 (reasoning)",
      "Llama 3.3 70B",
      "Qwen 2.5 72B",
      "Gemini 2.0 Flash",
      "Grok 4.1 Fast",
    ],
  },
};

/**
 * Setup preset selector change handler
 */
function setupQueryPresetSelector() {
  const presetSelect = document.getElementById("query-preset");
  if (presetSelect) {
    presetSelect.addEventListener("change", updatePresetInfo);
    loadQueryPresets();
  }
}

/**
 * Update preset info display
 */
function updatePresetInfo() {
  const presetSelect = document.getElementById("query-preset");
  const infoDiv = document.getElementById("preset-info");
  const titleEl = document.getElementById("preset-info-title");
  const descEl = document.getElementById("preset-info-desc");

  const preset = presetSelect.value;
  const info = PRESET_INFO[preset] || {};
  if (preset) {
    titleEl.textContent = info.title || info.name || info.displayName || preset;
    const descText = info.desc || info.description || '';
    let modelsText = '';
    if (info.models && Array.isArray(info.models)) {
      modelsText = info.models.join(', ');
    } else if (info.members && Array.isArray(info.members)) {
      modelsText = info.members.map(m => `${m.provider}/${m.model}`).join(', ');
    } else {
      modelsText = 'Custom configuration';
    }
    descEl.innerHTML = `${descText}<br><small style="color: var(--cyan);">Models: ${modelsText}</small>`;
    infoDiv.style.display = "block";
  } else {
    infoDiv.style.display = "none";
  }
}

/**
 * Send test query to the council
 */
async function loadQueryPresets() {
  try {
    const response = await fetch('/presets');
    if (!response.ok) {
      throw new Error(`Failed to fetch presets: HTTP ${response.status}`);
    }
    const data = await response.json();
    const select = document.getElementById('query-preset');
    if (select) {
      select.innerHTML = '<option value="">Use Active Council (default)</option>';
      const allPresets = { ...data.builtIn, ...data.custom };
      Object.entries(allPresets).forEach(([key, preset]) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = preset.name || preset.displayName || key;
        select.appendChild(opt);
      });
    }
    // Merge custom presets into PRESET_INFO
    if (data.custom) {
      Object.entries(data.custom).forEach(([k, custom]) => {
        PRESET_INFO[k] = {
          title: custom.displayName || custom.name || k,
          desc: custom.description || 'Custom council configuration',
          models: custom.members ? custom.members.map(m => `${m.provider}/${m.model}`) : ['Custom']
        };
      });
    }
    updatePresetInfo();
  } catch (error) {
    console.error('Failed to load presets:', error);
    // Fallback: HTML hardcoded options remain, PRESET_INFO has built-ins
    updatePresetInfo();
  }
}

async function sendTestQuery() {
  const queryInput = document.getElementById("query-input");
  const presetSelect = document.getElementById("query-preset");
  const transparencyCheck = document.getElementById("query-transparency");
  const sendBtn = document.getElementById("send-query-btn");

  const query = queryInput.value.trim();
  if (!query) {
    showError("Please enter a query");
    return;
  }

  const preset = presetSelect.value || null;
  const transparency = transparencyCheck.checked;

  // Show loading state
  document.getElementById("query-response-placeholder").style.display = "none";
  document.getElementById("query-response").style.display = "none";
  document.getElementById("query-error").style.display = "none";
  document.getElementById("query-loading").style.display = "block";
  document.getElementById("query-loading-preset").textContent = preset
    ? `Using ${PRESET_INFO[preset]?.title || preset}`
    : "Using active council configuration";
  sendBtn.disabled = true;
  sendBtn.textContent = "⏳ Processing...";

  try {
    // Build request body
    const requestBody = {
      query,
      transparency,
    };
    if (preset) {
      requestBody.preset = preset;
    }

    // Submit the query
    let submitResponse;
    try {
      submitResponse = await fetch("/api/v1/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "ApiKey admin-test-key",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (fetchError) {
      throw new Error(
        "Unable to connect to API Gateway. Please ensure the API service is running.",
      );
    }

    if (!submitResponse.ok) {
      let errorMessage = "Failed to submit query";
      try {
        const contentType = submitResponse.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await submitResponse.json();
          errorMessage = error.error?.message || error.message || errorMessage;
        } else {
          // Response is not JSON (likely HTML error page)
          errorMessage = `API returned status ${submitResponse.status}. The API Gateway may not be running or accessible.`;
        }
      } catch (parseError) {
        errorMessage = `API returned status ${submitResponse.status}. Please check that the API service is running.`;
      }
      throw new Error(errorMessage);
    }

    const submitData = await submitResponse.json();
    const requestId = submitData.requestId;

    // Poll for completion - adjust timeout based on preset
    // Note: polling every 2 seconds, so maxAttempts = desired_seconds / 2
    let attempts = 0;
    let maxAttempts = 60; // Default 2 minutes (60 * 2s = 120s)

    // Increase timeout for slower presets
    // Frontend timeout should be slightly longer than backend timeout to allow for processing
    if (preset === "research-council") {
      maxAttempts = 180; // 6 minutes (180 * 2s = 360s, backend timeout is 300s)
    } else if (preset === "coding-council") {
      maxAttempts = 120; // 4 minutes (120 * 2s = 240s)
    } else if (preset === "balanced-council") {
      maxAttempts = 60; // 2 minutes (60 * 2s = 120s)
    } else if (
      preset === "fast-council" ||
      preset === "cost-effective-council"
    ) {
      maxAttempts = 30; // 1 minute (30 * 2s = 60s)
    } else if (preset === "free-council") {
      maxAttempts = 45; // 1.5 minutes (45 * 2s = 90s)
    }

    let result = null;

    while (attempts < maxAttempts) {
      // Poll every 2 seconds to reduce API load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Update loading message with progress (polling every 2 seconds)
      const elapsedSeconds = (attempts + 1) * 2;
      const remainingSeconds = (maxAttempts - attempts - 1) * 2;
      document.getElementById("query-loading-preset").textContent = preset
        ? `Using ${PRESET_INFO[preset]?.title || preset} (${elapsedSeconds}s elapsed, ~${remainingSeconds}s remaining)`
        : `Using active council configuration (${elapsedSeconds}s elapsed)`;

      try {
        const statusResponse = await fetch(`/api/v1/requests/${requestId}`, {
          headers: {
            Authorization: "ApiKey admin-test-key",
          },
        });

        if (statusResponse.ok) {
          const contentType = statusResponse.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            result = await statusResponse.json();
            // Break on any terminal status (completed, failed, timeout) or if there's an error
            if (result.status === "completed" || 
                result.status === "failed" || 
                result.status === "timeout" ||
                result.error) {
              break;
            }
          }
        }
      } catch (pollError) {
        // Ignore polling errors and continue
        console.warn("Polling error:", pollError);
      }
      attempts++;
    }

    // Hide loading
    document.getElementById("query-loading").style.display = "none";

    if (!result || result.status !== "completed") {
      // If we have an error message from the backend, use it
      if (result?.error?.message) {
        throw new Error(result.error.message);
      }
      
      // Check if result exists but has a different status
      if (result && result.status) {
        throw new Error(
          `Request ${result.status}. ${result.error || "Please check the request details."}`
        );
      }
      
      // Otherwise, show timeout message
      const timeoutMsg =
        preset === "research-council"
          ? "Research council queries can take several minutes due to deep analysis. "
          : "";
      // Use maxAttempts if attempts is 0 (request failed before polling started)
      const elapsedTime = attempts > 0 ? attempts * 2 : maxAttempts * 2;
      throw new Error(
        `${timeoutMsg}Query timed out after ${elapsedTime} seconds or failed to complete`,
      );
    }
    
    // Check if completed but with low confidence (timeout occurred)
    if (result.consensusDecision?.confidence === "low") {
      console.warn("Request completed but with low confidence - backend timeout may have occurred");
    }

    // Display response
    displayQueryResponse(result, requestId, transparency);
  } catch (error) {
    console.error("Error sending query:", error);
    document.getElementById("query-loading").style.display = "none";
    document.getElementById("query-error").style.display = "block";
    document.getElementById("query-error").textContent =
      `Error: ${error.message}`;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "🚀 Send Query";
  }
}

/**
 * Display query response
 */
async function displayQueryResponse(result, requestId, showDetails) {
  const responseDiv = document.getElementById("query-response");
  const statusDiv = document.getElementById("query-status");
  const consensusDiv = document.getElementById("query-consensus");
  const detailsDiv = document.getElementById("query-details");
  const membersDiv = document.getElementById("query-members");
  const metricsDiv = document.getElementById("query-metrics");

  responseDiv.style.display = "block";

  // Status
  statusDiv.innerHTML = `
    <span style="color: var(--success);">✅ Completed</span>
    <span style="margin-left: 16px; color: var(--text-muted); font-size: 0.85rem;">
      Request ID: ${requestId}
    </span>
  `;

  // Consensus decision - render as markdown
  const consensusContent = result.consensusDecision || "No consensus reached";
  consensusDiv.innerHTML = `
    <h3 style="margin-bottom: 12px; color: var(--cyan);">Council Consensus</h3>
    <div class="markdown-content">${renderMarkdown(consensusContent)}</div>
  `;

  // Deliberation details
  if (showDetails) {
    try {
      const deliberationResponse = await fetch(
        `/api/v1/requests/${requestId}/deliberation`,
        {
          headers: {
            Authorization: "ApiKey admin-test-key",
          },
        },
      );

      if (deliberationResponse.ok) {
        const deliberation = await deliberationResponse.json();
        detailsDiv.style.display = "block";

        // Extract rounds from deliberation structure
        const rounds = deliberation.rounds || [];

        // Build HTML for all rounds
        let roundsHtml = "";

        for (const round of rounds) {
          const roundNum = round.roundNumber;
          const exchanges = round.exchanges || [];
          const roundTitle =
            roundNum === 0
              ? "Initial Responses"
              : `Deliberation Round ${roundNum}`;
          const roundColor = roundNum === 0 ? "var(--cyan)" : "var(--purple)";

          roundsHtml += `
            <div style="margin-bottom: 20px;">
              <h4 style="color: ${roundColor}; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                ${roundTitle}
              </h4>
          `;

          for (const exchange of exchanges) {
            const tokenInfo = exchange.tokenUsage
              ? `${exchange.tokenUsage.totalTokens} tokens`
              : "";

            roundsHtml += `
              <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                  <strong style="color: var(--emerald);">${escapeHtml(exchange.councilMemberId)}</strong>
                  <span style="color: var(--text-muted); font-size: 0.85rem;">${tokenInfo}</span>
                </div>
                <div class="markdown-content" style="font-size: 0.9rem; max-height: 200px; overflow-y: auto;">
                  ${renderMarkdown(exchange.content || "No response")}
                </div>
              </div>
            `;
          }

          roundsHtml += "</div>";
        }

        if (rounds.length > 0) {
          membersDiv.innerHTML = roundsHtml;
        } else {
          membersDiv.innerHTML =
            '<p style="color: var(--text-muted);">No deliberation data available</p>';
        }

        // Metrics
        const initialRound =
          rounds.find((r) => r.roundNumber === 0) || rounds[0];
        const numMembers = initialRound?.exchanges?.length || 0;
        const numDeliberationRounds = rounds.length > 0 ? rounds.length - 1 : 0; // Subtract 1 because round 0 is initial responses
        metricsDiv.innerHTML = `
          <strong>Deliberation Rounds:</strong> ${numDeliberationRounds} |
          <strong>Total Time:</strong> ${deliberation.totalDuration || 0}ms |
          <strong>Council Members:</strong> ${numMembers}
        `;
      } else {
        detailsDiv.style.display = "none";
      }
    } catch (error) {
      console.error("Error loading deliberation details:", error);
      detailsDiv.style.display = "none";
    }
  } else {
    detailsDiv.style.display = "none";
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Render markdown to HTML with sanitization
 */
function renderMarkdown(text) {
  if (!text) return "";
  try {
    // Configure marked for safe rendering
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        breaks: true,       // Convert \n to <br>
        gfm: true,          // GitHub Flavored Markdown
        headerIds: false,   // Don't add IDs to headers
        mangle: false,      // Don't mangle email addresses
      });
      return marked.parse(text);
    }
  } catch (e) {
    console.warn('Markdown parsing failed, falling back to escaped HTML:', e);
  }
  // Fallback to escaped HTML if marked isn't available
  return escapeHtml(text);
}
