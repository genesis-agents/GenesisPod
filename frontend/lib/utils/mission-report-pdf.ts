/**
 * AI Team Mission Report PDF Generator
 * 使用 HTML 转 PDF 方式生成专业报告
 *
 * 功能特点：
 * - 完美支持中文显示
 * - 执行摘要 (Executive Summary)
 * - 任务统计图表
 * - 详细任务内容
 * - Agent参与情况
 * - 专业排版设计
 */

// Report data interfaces
export interface MissionReportData {
  mission: {
    id: string;
    title: string;
    description: string;
    status: string;
    leader: string;
    createdAt: string;
    completedAt?: string;
    finalResult?: string;
  };
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    assignedTo: string;
    result?: string;
    leaderFeedback?: string;
    revisionCount: number;
    startedAt?: string;
    completedAt?: string;
  }>;
}

interface ReportStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  failedTasks: number;
  totalRevisions: number;
  avgRevisions: number;
  durationMinutes: number;
  participantCount: number;
  participants: Map<string, number>;
}

/**
 * Calculate statistics from report data
 */
function calculateStats(data: MissionReportData): ReportStats {
  const tasks = data.tasks || [];
  const participants = new Map<string, number>();

  tasks.forEach((task) => {
    const count = participants.get(task.assignedTo) || 0;
    participants.set(task.assignedTo, count + 1);
  });

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const inProgressTasks = tasks.filter(
    (t) => t.status === 'IN_PROGRESS'
  ).length;
  const pendingTasks = tasks.filter((t) => t.status === 'PENDING').length;
  const failedTasks = tasks.filter((t) => t.status === 'FAILED').length;
  const totalRevisions = tasks.reduce(
    (sum, t) => sum + (t.revisionCount || 0),
    0
  );

  let durationMinutes = 0;
  if (data.mission.createdAt && data.mission.completedAt) {
    const start = new Date(data.mission.createdAt);
    const end = new Date(data.mission.completedAt);
    durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  }

  return {
    totalTasks: tasks.length,
    completedTasks,
    inProgressTasks,
    pendingTasks,
    failedTasks,
    totalRevisions,
    avgRevisions: tasks.length > 0 ? totalRevisions / tasks.length : 0,
    durationMinutes,
    participantCount: participants.size,
    participants,
  };
}

/**
 * Format date string
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Get status badge color
 */
function getStatusColor(status: string): { bg: string; text: string } {
  const colors: Record<string, { bg: string; text: string }> = {
    COMPLETED: { bg: '#dcfce7', text: '#166534' },
    IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af' },
    PENDING: { bg: '#fef3c7', text: '#92400e' },
    FAILED: { bg: '#fee2e2', text: '#991b1b' },
    AWAITING_REVIEW: { bg: '#f3e8ff', text: '#6b21a8' },
    REVISION_NEEDED: { bg: '#ffedd5', text: '#9a3412' },
  };
  return colors[status] || { bg: '#f3f4f6', text: '#374151' };
}

/**
 * Escape HTML characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Convert markdown to simple HTML
 */
function markdownToHtml(text: string): string {
  if (!text) return '';

  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<br/>';

      // Headers
      if (trimmed.startsWith('#### ')) {
        return `<h4 style="font-size: 14px; font-weight: bold; margin: 16px 0 8px 0; color: #374151;">${escapeHtml(trimmed.slice(5))}</h4>`;
      }
      if (trimmed.startsWith('### ')) {
        return `<h3 style="font-size: 16px; font-weight: bold; margin: 20px 0 10px 0; color: #1f2937;">${escapeHtml(trimmed.slice(4))}</h3>`;
      }
      if (trimmed.startsWith('## ')) {
        return `<h2 style="font-size: 18px; font-weight: bold; margin: 24px 0 12px 0; color: #111827;">${escapeHtml(trimmed.slice(3))}</h2>`;
      }
      if (trimmed.startsWith('# ')) {
        return `<h1 style="font-size: 22px; font-weight: bold; margin: 28px 0 14px 0; color: #111827;">${escapeHtml(trimmed.slice(2))}</h1>`;
      }

      // List items
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return `<li style="margin: 4px 0; margin-left: 20px;">${escapeHtml(trimmed.slice(2))}</li>`;
      }

      // Horizontal rule
      if (trimmed === '---') {
        return '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;"/>';
      }

      // Regular paragraph - handle bold/italic
      let html = escapeHtml(trimmed);
      html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
      html = html.replace(
        /`(.+?)`/g,
        '<code style="background: #f3f4f6; padding: 2px 4px; border-radius: 3px;">$1</code>'
      );

      return `<p style="margin: 8px 0; line-height: 1.6;">${html}</p>`;
    })
    .join('');
}

/**
 * Generate HTML content for the report
 */
function generateReportHtml(data: MissionReportData): string {
  const stats = calculateStats(data);
  const completionRate =
    stats.totalTasks > 0
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;

  // Sort participants by task count
  const sortedParticipants = Array.from(stats.participants.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const maxTasks = sortedParticipants[0]?.[1] || 1;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1f2937;
      background: white;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 20mm;
      margin: 0 auto;
      background: white;
      page-break-after: always;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .cover {
      text-align: center;
      padding-top: 60mm;
    }
    .cover-header {
      background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
      color: white;
      padding: 40px;
      margin: -20mm -20mm 40px -20mm;
      border-radius: 0 0 20px 20px;
    }
    .cover-title {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .cover-subtitle {
      font-size: 14px;
      opacity: 0.9;
    }
    .mission-title {
      font-size: 18px;
      font-weight: bold;
      color: #1f2937;
      margin: 40px 0 30px 0;
      padding: 0 20px;
    }
    .info-box {
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      margin: 20px auto;
      max-width: 400px;
      text-align: left;
    }
    .info-row {
      display: flex;
      margin: 8px 0;
    }
    .info-label {
      width: 80px;
      color: #6b7280;
      font-weight: 500;
    }
    .info-value {
      flex: 1;
      color: #1f2937;
    }
    .section-title {
      font-size: 18px;
      font-weight: bold;
      color: #1f2937;
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 8px;
      margin-bottom: 20px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .metric-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: #7c3aed;
    }
    .metric-label {
      font-size: 11px;
      color: #6b7280;
      margin-top: 4px;
    }
    .chart-container {
      margin: 20px 0;
    }
    .bar-chart {
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      height: 120px;
      padding: 10px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .bar-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 60px;
    }
    .bar {
      width: 40px;
      border-radius: 4px 4px 0 0;
      transition: height 0.3s;
    }
    .bar-value {
      font-size: 12px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .bar-label {
      font-size: 10px;
      color: #6b7280;
      margin-top: 8px;
      text-align: center;
    }
    .participant-row {
      display: flex;
      align-items: center;
      margin: 8px 0;
    }
    .participant-name {
      width: 120px;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .participant-bar-bg {
      flex: 1;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      margin: 0 10px;
    }
    .participant-bar {
      height: 100%;
      background: #7c3aed;
      border-radius: 4px;
    }
    .participant-count {
      width: 60px;
      font-size: 11px;
      color: #6b7280;
    }
    .task-card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 15px;
      margin: 15px 0;
    }
    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .task-title {
      font-size: 13px;
      font-weight: bold;
      color: #1f2937;
    }
    .status-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
    }
    .task-meta {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 10px;
    }
    .task-result {
      font-size: 11px;
      color: #374151;
      background: white;
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
    }
    .feedback-box {
      background: #fef3c7;
      border-radius: 4px;
      padding: 10px;
      margin-top: 10px;
      font-size: 11px;
      color: #92400e;
    }
    .final-result {
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      margin-top: 20px;
    }
    .footer {
      text-align: center;
      color: #9ca3af;
      font-size: 10px;
      margin-top: 40px;
    }
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="page cover">
    <div class="cover-header">
      <div class="cover-title">AI Team Mission Report</div>
      <div class="cover-subtitle">Powered by DeepDive Engine</div>
    </div>

    <div class="mission-title">${escapeHtml(data.mission.title)}</div>

    <div class="info-box">
      <div class="info-row">
        <span class="info-label">任务ID:</span>
        <span class="info-value">${escapeHtml(data.mission.id)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">状态:</span>
        <span class="info-value">${escapeHtml(data.mission.status)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">负责人:</span>
        <span class="info-value">${escapeHtml(data.mission.leader)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">创建时间:</span>
        <span class="info-value">${formatDate(data.mission.createdAt)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">完成时间:</span>
        <span class="info-value">${data.mission.completedAt ? formatDate(data.mission.completedAt) : '进行中'}</span>
      </div>
    </div>

    <div class="footer">
      生成时间: ${new Date().toLocaleString('zh-CN')}
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="page">
    <div class="section-title">执行摘要</div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${stats.totalTasks}</div>
        <div class="metric-label">总任务数</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color: #22c55e;">${stats.completedTasks}</div>
        <div class="metric-label">已完成</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color: #6366f1;">${completionRate}%</div>
        <div class="metric-label">完成率</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${stats.participantCount}</div>
        <div class="metric-label">AI成员</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color: #6b7280;">${stats.durationMinutes}分钟</div>
        <div class="metric-label">执行时长</div>
      </div>
      <div class="metric-card">
        <div class="metric-value" style="color: #f59e0b;">${stats.totalRevisions}</div>
        <div class="metric-label">修订次数</div>
      </div>
    </div>

    <h3 style="font-size: 14px; font-weight: bold; margin: 30px 0 10px 0;">任务描述</h3>
    <p style="color: #374151; line-height: 1.8;">${escapeHtml(data.mission.description)}</p>

    <h3 style="font-size: 14px; font-weight: bold; margin: 30px 0 10px 0;">任务状态分布</h3>
    <div class="chart-container">
      <div class="bar-chart">
        <div class="bar-item">
          <div class="bar-value">${stats.completedTasks}</div>
          <div class="bar" style="height: ${Math.max(10, (stats.completedTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #22c55e;"></div>
          <div class="bar-label">已完成</div>
        </div>
        <div class="bar-item">
          <div class="bar-value">${stats.inProgressTasks}</div>
          <div class="bar" style="height: ${Math.max(10, (stats.inProgressTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #3b82f6;"></div>
          <div class="bar-label">进行中</div>
        </div>
        <div class="bar-item">
          <div class="bar-value">${stats.pendingTasks}</div>
          <div class="bar" style="height: ${Math.max(10, (stats.pendingTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #f59e0b;"></div>
          <div class="bar-label">待处理</div>
        </div>
        <div class="bar-item">
          <div class="bar-value">${stats.failedTasks}</div>
          <div class="bar" style="height: ${Math.max(10, (stats.failedTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #ef4444;"></div>
          <div class="bar-label">失败</div>
        </div>
      </div>
    </div>

    <h3 style="font-size: 14px; font-weight: bold; margin: 30px 0 10px 0;">AI成员参与情况</h3>
    ${sortedParticipants
      .map(
        ([name, count]) => `
      <div class="participant-row">
        <span class="participant-name">${escapeHtml(name)}</span>
        <div class="participant-bar-bg">
          <div class="participant-bar" style="width: ${(count / maxTasks) * 100}%;"></div>
        </div>
        <span class="participant-count">${count} 个任务</span>
      </div>
    `
      )
      .join('')}
  </div>

  <!-- Final Result -->
  ${
    data.mission.finalResult
      ? `
  <div class="page">
    <div class="section-title">最终成果</div>
    <div class="final-result">
      ${markdownToHtml(data.mission.finalResult)}
    </div>
  </div>
  `
      : ''
  }

  <!-- Detailed Tasks -->
  <div class="page">
    <div class="section-title">详细任务报告</div>
    ${data.tasks
      .map(
        (task, index) => `
      <div class="task-card">
        <div class="task-header">
          <span class="task-title">任务 ${index + 1}: ${escapeHtml(task.title)}</span>
          <span class="status-badge" style="background: ${getStatusColor(task.status).bg}; color: ${getStatusColor(task.status).text};">
            ${escapeHtml(task.status)}
          </span>
        </div>
        <div class="task-meta">
          执行者: ${escapeHtml(task.assignedTo)} | 修订次数: ${task.revisionCount}
        </div>
        ${
          task.result
            ? `
          <div class="task-result">
            ${escapeHtml(task.result.length > 500 ? task.result.substring(0, 500) + '...' : task.result)}
          </div>
        `
            : ''
        }
        ${
          task.leaderFeedback
            ? `
          <div class="feedback-box">
            <strong>Leader 反馈:</strong> ${escapeHtml(task.leaderFeedback.length > 200 ? task.leaderFeedback.substring(0, 200) + '...' : task.leaderFeedback)}
          </div>
        `
            : ''
        }
      </div>
    `
      )
      .join('')}
  </div>

  <div class="footer" style="margin-top: 20px;">
    © ${new Date().getFullYear()} DeepDive Engine - AI Team Mission Report
  </div>
</body>
</html>
  `;
}

/**
 * Generate and download mission report PDF using html2pdf
 */
export async function downloadMissionReportPDF(
  data: MissionReportData,
  filename?: string
): Promise<void> {
  // Dynamically import html2pdf to avoid SSR issues
  const html2pdf = (await import('html2pdf.js')).default;

  const html = generateReportHtml(data);

  // Create a wrapper element for PDF rendering
  // Must be visible and at the top for html2canvas to capture properly
  const wrapper = document.createElement('div');
  wrapper.id = 'pdf-render-container';
  wrapper.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 210mm;
    min-height: 100vh;
    background: white;
    z-index: 99999;
    overflow: auto;
  `;
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  // Prevent body scroll while generating
  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Wait for fonts and DOM to fully render
  await new Promise((resolve) => setTimeout(resolve, 500));

  const options = {
    margin: [10, 10, 10, 10] as [number, number, number, number],
    filename: filename || `mission-report-${data.mission.id}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.95 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      scrollY: -window.scrollY,
      windowWidth: wrapper.scrollWidth,
      windowHeight: wrapper.scrollHeight,
    },
    jsPDF: {
      unit: 'mm' as const,
      format: 'a4' as const,
      orientation: 'portrait' as const,
    },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'] as (
        | 'avoid-all'
        | 'css'
        | 'legacy'
      )[],
      before: '.page-break',
      after: '.page',
      avoid: '.task-card',
    },
  };

  try {
    await html2pdf().set(options).from(wrapper).save();
  } finally {
    document.body.removeChild(wrapper);
    document.body.style.overflow = originalOverflow;
  }
}
