document.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('chart');
  const refreshBtn = document.getElementById('refreshBtn');
  const themeToggle = document.getElementById('themeToggle');
  const teamFilter = document.getElementById('teamFilter');
  const rangeButtons = document.querySelectorAll('.range-pill[data-range]');
  const periodButtons = document.querySelectorAll('.period-btn');
  const periodFilters = document.querySelectorAll('.period-filter');
  const reportRows = document.getElementById('managementRows');
  const reportPeriodLabel = document.getElementById('reportPeriodLabel');
  const monitorRows = document.getElementById('monitorAgentRows');
  const reportFilterForm = document.getElementById('licenseReportFilters');
  const licenseReportRows = document.getElementById('licenseReportRows');
  const reportExportLink = document.getElementById('exportLicenseReport');
  let selectedRange = 'today';
  let selectedTeam = teamFilter?.value || 'all';
  let selectedPeriod = 'interval';

  const applyTheme = (theme, persist = false) => {
    const selectedTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = selectedTheme;
    const isLight = selectedTheme === 'light';
    const label = isLight ? 'Modo oscuro' : 'Modo claro';
    const icon = isLight ? '☾' : '☼';
    const themeLabel = document.getElementById('themeToggleLabel');
    const themeIcon = document.getElementById('themeToggleIcon');
    if (themeLabel) themeLabel.textContent = label;
    if (themeIcon) themeIcon.textContent = icon;
    if (themeToggle) {
      themeToggle.setAttribute('aria-label', `Cambiar a ${label.toLowerCase()}`);
      themeToggle.setAttribute('title', `Cambiar a ${label.toLowerCase()}`);
      themeToggle.setAttribute('aria-pressed', String(isLight));
    }
    if (persist) {
      try {
        localStorage.setItem('genesys-dashboard-theme', selectedTheme);
      } catch (error) {
        return;
      }
    }
  };

  applyTheme(document.documentElement.dataset.theme);
  themeToggle?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light', true);
  });

  const updateLicenseStatus = (licenseData) => {
    if (!licenseData) return;
    const badge = document.getElementById('licenseStatus');
    const utilization = document.querySelector('.utilization-header strong');
    const bar = document.getElementById('licenseUtilizationBar');
    const percent = Number(licenseData.utilization ?? (licenseData.used / licenseData.total) * 100);
    if (badge) {
      badge.textContent = `Estado ${licenseData.status}`;
      badge.className = `pill-status ${licenseData.status_key}`;
    }
    if (utilization) utilization.textContent = `${percent.toFixed(1)}%`;
    if (bar) {
      bar.style.width = `${percent}%`;
      bar.className = licenseData.status_key;
    }
  };

  const updateLicenseTypes = (licenseTypes = []) => {
    document.querySelectorAll('[data-license-type]').forEach((element) => {
      const license = licenseTypes.find((item) => item.name === element.dataset.licenseType);
      if (!license) return;
      element.querySelector('[data-license-type-count]').textContent = `${license.used}/${license.capacity}`;
      element.querySelector('[data-license-type-bar]').style.width = `${license.utilization}%`;
      element.querySelector('[data-license-type-utilization]').textContent = `${license.utilization}% en uso`;
      element.querySelector('[data-license-type-available]').textContent = `${license.available} libres`;
    });
  };

  const appendCells = (row, values) => {
    values.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });
  };

  const renderDistribution = (elementId, items) => {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.replaceChildren(...items.map((item) => {
      const row = document.createElement('div');
      row.className = 'distribution-item';
      const name = document.createElement('span');
      name.textContent = item.name;
      const count = document.createElement('strong');
      count.textContent = item.count;
      row.append(name, count);
      return row;
    }));
  };

  const loadLicenseMonitoring = async () => {
    const response = await fetch(`/api/license-monitoring?team=${encodeURIComponent(selectedTeam)}`);
    if (!response.ok) return;
    const monitor = await response.json();
    updateLicenseStatus(monitor);
    document.querySelectorAll('[data-license-field]').forEach((element) => {
      const field = element.dataset.licenseField;
      if (field in monitor) element.textContent = monitor[field];
    });
    const availableLabel = document.querySelector('.utilization-meta small:last-child');
    if (availableLabel) availableLabel.textContent = `${monitor.available} licencias libres`;
    document.getElementById('monitorUsed').textContent = monitor.used;
    document.getElementById('monitorOnline').textContent = monitor.online;
    document.getElementById('monitorOffline').textContent = monitor.offline;
    document.getElementById('monitorAvailable').textContent = monitor.available;
    document.getElementById('monitorCapacity').textContent = monitor.capacity;
    document.getElementById('monitorUtilization').textContent = `${monitor.utilization}% de capacidad`;
    document.getElementById('monitorOnlineTime').textContent = `Tiempo acumulado ${monitor.online_duration}`;
    document.getElementById('monitorOfflineTime').textContent = `Tiempo acumulado ${monitor.offline_duration}`;
    document.getElementById('monitorUpdatedAt').textContent = `Actualizado ${monitor.updated_at}`;

    const status = document.getElementById('licenseAlert');
    status.textContent = `Estado ${monitor.status}`;
    status.className = `license-alert ${monitor.status_key}`;
    const usageBar = document.getElementById('licenseUsageBar');
    usageBar.style.width = `${monitor.utilization}%`;
    usageBar.className = monitor.status_key;

    renderDistribution('distributionType', monitor.by_type);
    renderDistribution('distributionRole', monitor.by_role);
    renderDistribution('distributionOrganization', monitor.by_organization);

    if (monitorRows) {
      const rows = monitor.agents.map((agent) => {
        const row = document.createElement('tr');
        appendCells(row, [agent.user, agent.connection, agent.status_time, agent.license_type,
          agent.queue_state, agent.available_time, agent.interaction_time, agent.acw_time,
          agent.pause_time, `${agent.occupancy}%`]);
        return row;
      });
      monitorRows.replaceChildren(...rows);
    }
  };

  const loadLicenseReport = async () => {
    if (!reportFilterForm) return;
    const params = new URLSearchParams(new FormData(reportFilterForm));
    params.set('team', selectedTeam);
    const query = params.toString();
    const response = await fetch(`/api/license-report?${query}`);
    if (!response.ok) return;
    const report = await response.json();
    document.getElementById('reportResultCount').textContent = `${report.count} registros`;

    if (licenseReportRows) {
      const rows = report.rows.map((record) => {
        const row = document.createElement('tr');
        appendCells(row, [record.login_date, record.user, record.login_at, record.logout_at,
          record.connection, record.connection_time, record.status_time, record.queue_state, record.queue_active ? 'Activo' : 'Inactivo',
          record.available_time, record.interaction_time, record.acw_time, record.pause_time,
          `${record.occupancy}%`, record.license_active ? record.license_type : 'No consume',
          record.team, record.campaign, record.supervisor, record.profile]);
        return row;
      });
      licenseReportRows.replaceChildren(...rows);
    }
    if (reportExportLink) reportExportLink.href = `/reports/licenses.csv?${query}`;
  };

  const drawChart = (series) => {
    if (!svg || !series || !series.length) return;

    const width = 820;
    const height = 250;
    const padding = { top: 16, right: 18, bottom: 26, left: 22 };
    const maxValue = Math.max(...series.flatMap(item => [item.offered, item.answered]), 10);
    const chartHeight = height - padding.top - padding.bottom;
    const chartWidth = width - padding.left - padding.right;
    const stepX = chartWidth / Math.max(series.length - 1, 1);

    const pointsOffered = series.map((item, index) => {
      const x = padding.left + index * stepX;
      const y = height - padding.bottom - (item.offered / maxValue) * chartHeight;
      return `${x},${y}`;
    });

    const pointsAnswered = series.map((item, index) => {
      const x = padding.left + index * stepX;
      const y = height - padding.bottom - (item.answered / maxValue) * chartHeight;
      return `${x},${y}`;
    });

    const labels = series.map((item, index) => {
      const x = padding.left + index * stepX;
      return `<text x="${x}" y="${height - 6}" text-anchor="middle" class="axis-label">${item.label}</text>`;
    }).join('');

    const gridLines = Array.from({ length: 5 }, (_, index) => {
      const value = (maxValue / 4) * index;
      const y = height - padding.bottom - (value / maxValue) * chartHeight;
      return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(148,163,184,0.12)" stroke-width="1" />`;
    }).join('');

    svg.innerHTML = `
      ${gridLines}
      <polyline class="line-offered" points="${pointsOffered.join(' ')}" />
      <polyline class="line-answered" points="${pointsAnswered.join(' ')}" />
      ${labels}
    `;
  };

  const loadData = async () => {
    const params = new URLSearchParams({ range: selectedRange, team: selectedTeam });
    const response = await fetch(`/api/metrics?${params}`);
    const payload = await response.json();
    drawChart(payload.series);

    document.querySelectorAll('[data-metric]').forEach((element) => {
      const field = element.dataset.metric;
      if (field in payload.metrics) {
        element.textContent = `${payload.metrics[field]}${element.dataset.metricUnit || ''}`;
      }
    });

    const fields = document.querySelectorAll('[data-field]');
    fields.forEach((element) => {
      const field = element.dataset.field;
      if (field in payload.queue_metrics) {
        const value = payload.queue_metrics[field];
        element.textContent = field === 'longest_wait_sec' ? `${value}s` : value;
      }
    });

    const licenseFields = document.querySelectorAll('[data-license-field]');
    licenseFields.forEach((element) => {
      const field = element.dataset.licenseField;
      if (payload.licenses && field in payload.licenses) {
        element.textContent = payload.licenses[field];
      }
    });

    updateLicenseStatus(payload.licenses);
    updateLicenseTypes(payload.licenses?.by_type);

    const timeLabel = document.querySelector('.status-time');
    if (timeLabel) {
      timeLabel.textContent = `Updated ${payload.updated_at}`;
    }
  };

  const loadManagementReport = async () => {
    const valueInput = document.querySelector(`[data-filter="${selectedPeriod}"] input`);
    const params = new URLSearchParams({ period: selectedPeriod, team: selectedTeam });
    if (valueInput) params.set('value', valueInput.value);

    const response = await fetch(`/api/management?${params}`);
    if (!response.ok) return;
    const report = await response.json();

    document.querySelectorAll('[data-management-summary]').forEach((element) => {
      const field = element.dataset.managementSummary;
      const value = report.summary[field];
      element.textContent = field === 'handled'
        ? Number(value).toLocaleString('es-VE')
        : field === 'average_wait' ? `${value}s` : `${value}%`;
    });

    if (reportRows) {
      const rows = report.rows.map((item) => {
        const row = document.createElement('tr');
        [item.label, item.offered, item.answered, item.abandoned, `${item.sla}%`, `${item.asa}s`, item.agents]
          .forEach((value) => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
          });
        return row;
      });
      reportRows.replaceChildren(...rows);
    }

    const periodNames = {
      interval: 'Intervalos de 30 minutos',
      date: `Fecha: ${report.selected_value}`,
      month: `Mes: ${report.selected_value}`,
      year: `Año: ${report.selected_value}`,
    };
    if (reportPeriodLabel) reportPeriodLabel.textContent = periodNames[selectedPeriod];
  };

  refreshBtn?.addEventListener('click', () => {
    loadData();
    loadManagementReport();
  });

  teamFilter?.addEventListener('change', () => {
    selectedTeam = teamFilter.value;
    loadData();
    loadLicenseMonitoring();
    loadManagementReport();
    loadLicenseReport();
  });

  rangeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedRange = button.dataset.range;
      rangeButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
      });
      loadData();
    });
  });

  periodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedPeriod = button.dataset.period;
      periodButtons.forEach((item) => item.classList.toggle('active', item === button));
      periodFilters.forEach((filter) => {
        filter.hidden = filter.dataset.filter !== selectedPeriod;
      });
      loadManagementReport();
    });
  });

  periodFilters.forEach((filter) => {
    filter.querySelector('input')?.addEventListener('change', loadManagementReport);
  });

  reportFilterForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    loadLicenseReport();
  });

  loadData();
  loadManagementReport();
  loadLicenseMonitoring();
  loadLicenseReport();
  window.setInterval(loadLicenseMonitoring, 5 * 60 * 1000);
});
