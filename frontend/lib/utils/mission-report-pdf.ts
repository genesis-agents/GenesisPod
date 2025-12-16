/**
 * AI Team Mission Report PDF Generator
 * 使用纯内联样式确保 PDF 渲染正确
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

function getStatusBadge(status: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    COMPLETED: { bg: '#dcfce7', text: '#166534' },
    IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af' },
    PENDING: { bg: '#fef3c7', text: '#92400e' },
    FAILED: { bg: '#fee2e2', text: '#991b1b' },
  };
  const c = colors[status] || { bg: '#f3f4f6', text: '#374151' };
  return `<span style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 500; background: ${c.bg}; color: ${c.text};">${status}</span>`;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate HTML with pure inline styles
 */
function generateReportHtml(data: MissionReportData): string {
  const stats = calculateStats(data);
  const completionRate =
    stats.totalTasks > 0
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;

  const sortedParticipants = Array.from(stats.participants.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  const maxTasks = sortedParticipants[0]?.[1] || 1;

  const baseFont =
    "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Mission Report</title>
</head>
<body style="margin: 0; padding: 0; ${baseFont} font-size: 12px; line-height: 1.6; color: #1f2937; background: #fff;">

  <!-- Cover Page -->
  <div style="width: 100%; padding: 40px; box-sizing: border-box;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%); color: white; padding: 40px; margin: -40px -40px 30px -40px; text-align: center;">
      <div style="font-size: 32px; font-weight: bold; margin-bottom: 8px;">AI Team Mission Report</div>
      <div style="font-size: 14px; opacity: 0.9;">Powered by DeepDive Engine</div>
    </div>

    <!-- Mission Title -->
    <div style="text-align: center; margin: 40px 0;">
      <div style="font-size: 20px; font-weight: bold; color: #1f2937; margin-bottom: 20px;">${escapeHtml(data.mission.title)}</div>
    </div>

    <!-- Info Box -->
    <div style="background: #f8fafc; border-radius: 12px; padding: 24px; max-width: 450px; margin: 0 auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; width: 100px;">任务ID:</td>
          <td style="padding: 8px 0; color: #1f2937;">${escapeHtml(data.mission.id)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">状态:</td>
          <td style="padding: 8px 0;">${getStatusBadge(data.mission.status)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">负责人:</td>
          <td style="padding: 8px 0; color: #1f2937;">${escapeHtml(data.mission.leader)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">创建时间:</td>
          <td style="padding: 8px 0; color: #1f2937;">${formatDate(data.mission.createdAt)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">完成时间:</td>
          <td style="padding: 8px 0; color: #1f2937;">${data.mission.completedAt ? formatDate(data.mission.completedAt) : '进行中'}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin-top: 60px; color: #9ca3af; font-size: 11px;">
      生成时间: ${new Date().toLocaleString('zh-CN')}
    </div>
  </div>

  <!-- Executive Summary -->
  <div style="width: 100%; padding: 40px; box-sizing: border-box; page-break-before: always;">
    <div style="font-size: 20px; font-weight: bold; color: #1f2937; border-bottom: 3px solid #7c3aed; padding-bottom: 10px; margin-bottom: 30px;">
      执行摘要
    </div>

    <!-- Metrics -->
    <table style="width: 100%; border-collapse: separate; border-spacing: 12px;">
      <tr>
        <td style="background: #f8fafc; border-radius: 10px; padding: 20px; text-align: center; width: 33%;">
          <div style="font-size: 32px; font-weight: bold; color: #7c3aed;">${stats.totalTasks}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">总任务数</div>
        </td>
        <td style="background: #f8fafc; border-radius: 10px; padding: 20px; text-align: center; width: 33%;">
          <div style="font-size: 32px; font-weight: bold; color: #22c55e;">${stats.completedTasks}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">已完成</div>
        </td>
        <td style="background: #f8fafc; border-radius: 10px; padding: 20px; text-align: center; width: 33%;">
          <div style="font-size: 32px; font-weight: bold; color: #6366f1;">${completionRate}%</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">完成率</div>
        </td>
      </tr>
      <tr>
        <td style="background: #f8fafc; border-radius: 10px; padding: 20px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #7c3aed;">${stats.participantCount}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">AI成员</div>
        </td>
        <td style="background: #f8fafc; border-radius: 10px; padding: 20px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #6b7280;">${stats.durationMinutes}<span style="font-size: 14px;">分钟</span></div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">执行时长</div>
        </td>
        <td style="background: #f8fafc; border-radius: 10px; padding: 20px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${stats.totalRevisions}</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">修订次数</div>
        </td>
      </tr>
    </table>

    <!-- Task Description -->
    <div style="margin-top: 30px;">
      <div style="font-size: 16px; font-weight: bold; color: #1f2937; margin-bottom: 12px;">任务描述</div>
      <div style="background: #f8fafc; border-radius: 8px; padding: 16px; color: #374151; line-height: 1.8;">
        ${escapeHtml(data.mission.description)}
      </div>
    </div>

    <!-- Status Distribution -->
    <div style="margin-top: 30px;">
      <div style="font-size: 16px; font-weight: bold; color: #1f2937; margin-bottom: 12px;">任务状态分布</div>
      <table style="width: 100%; background: #f8fafc; border-radius: 8px; padding: 20px;">
        <tr>
          <td style="text-align: center; padding: 10px;">
            <div style="display: inline-block; width: 50px; height: ${Math.max(20, (stats.completedTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #22c55e; border-radius: 4px 4px 0 0;"></div>
            <div style="font-size: 14px; font-weight: bold; margin-top: 8px;">${stats.completedTasks}</div>
            <div style="font-size: 11px; color: #6b7280;">已完成</div>
          </td>
          <td style="text-align: center; padding: 10px;">
            <div style="display: inline-block; width: 50px; height: ${Math.max(20, (stats.inProgressTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #3b82f6; border-radius: 4px 4px 0 0;"></div>
            <div style="font-size: 14px; font-weight: bold; margin-top: 8px;">${stats.inProgressTasks}</div>
            <div style="font-size: 11px; color: #6b7280;">进行中</div>
          </td>
          <td style="text-align: center; padding: 10px;">
            <div style="display: inline-block; width: 50px; height: ${Math.max(20, (stats.pendingTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #f59e0b; border-radius: 4px 4px 0 0;"></div>
            <div style="font-size: 14px; font-weight: bold; margin-top: 8px;">${stats.pendingTasks}</div>
            <div style="font-size: 11px; color: #6b7280;">待处理</div>
          </td>
          <td style="text-align: center; padding: 10px;">
            <div style="display: inline-block; width: 50px; height: ${Math.max(20, (stats.failedTasks / Math.max(stats.totalTasks, 1)) * 80)}px; background: #ef4444; border-radius: 4px 4px 0 0;"></div>
            <div style="font-size: 14px; font-weight: bold; margin-top: 8px;">${stats.failedTasks}</div>
            <div style="font-size: 11px; color: #6b7280;">失败</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Participants -->
    <div style="margin-top: 30px;">
      <div style="font-size: 16px; font-weight: bold; color: #1f2937; margin-bottom: 12px;">AI成员参与情况</div>
      ${sortedParticipants
        .map(
          ([name, count]) => `
        <div style="display: flex; align-items: center; margin: 10px 0;">
          <div style="width: 140px; font-size: 12px; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</div>
          <div style="flex: 1; height: 10px; background: #e5e7eb; border-radius: 5px; margin: 0 12px;">
            <div style="width: ${(count / maxTasks) * 100}%; height: 100%; background: linear-gradient(90deg, #7c3aed, #6366f1); border-radius: 5px;"></div>
          </div>
          <div style="width: 70px; font-size: 12px; color: #6b7280;">${count} 个任务</div>
        </div>
      `
        )
        .join('')}
    </div>
  </div>

  ${
    data.mission.finalResult
      ? `
  <!-- Final Result -->
  <div style="width: 100%; padding: 40px; box-sizing: border-box; page-break-before: always;">
    <div style="font-size: 20px; font-weight: bold; color: #1f2937; border-bottom: 3px solid #7c3aed; padding-bottom: 10px; margin-bottom: 30px;">
      最终成果
    </div>
    <div style="background: #f8fafc; border-radius: 12px; padding: 24px; color: #374151; line-height: 1.8; white-space: pre-wrap;">
${escapeHtml(data.mission.finalResult)}
    </div>
  </div>
  `
      : ''
  }

  <!-- Detailed Tasks -->
  <div style="width: 100%; padding: 40px; box-sizing: border-box; page-break-before: always;">
    <div style="font-size: 20px; font-weight: bold; color: #1f2937; border-bottom: 3px solid #7c3aed; padding-bottom: 10px; margin-bottom: 30px;">
      详细任务报告
    </div>

    ${data.tasks
      .map(
        (task, index) => `
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 15px; font-weight: bold; color: #1f2937;">任务 ${index + 1}: ${escapeHtml(task.title)}</div>
          ${getStatusBadge(task.status)}
        </div>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 12px;">
          执行者: ${escapeHtml(task.assignedTo)} | 修订次数: ${task.revisionCount}
        </div>
        ${
          task.result
            ? `
          <div style="background: white; border-radius: 8px; padding: 14px; font-size: 12px; color: #374151; line-height: 1.7; white-space: pre-wrap;">
${escapeHtml(task.result.length > 800 ? task.result.substring(0, 800) + '...' : task.result)}
          </div>
        `
            : ''
        }
        ${
          task.leaderFeedback
            ? `
          <div style="background: #fef3c7; border-radius: 8px; padding: 14px; margin-top: 12px; font-size: 12px; color: #92400e;">
            <strong>Leader 反馈:</strong> ${escapeHtml(task.leaderFeedback.length > 300 ? task.leaderFeedback.substring(0, 300) + '...' : task.leaderFeedback)}
          </div>
        `
            : ''
        }
      </div>
    `
      )
      .join('')}
  </div>

  <!-- Footer -->
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 11px;">
    © ${new Date().getFullYear()} DeepDive Engine - AI Team Mission Report
  </div>

</body>
</html>`;
}

/**
 * Generate and download mission report PDF
 */
export async function downloadMissionReportPDF(
  data: MissionReportData,
  filename?: string
): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;
  const html = generateReportHtml(data);

  // Create iframe for isolated rendering
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 794px;
    height: 1123px;
    border: none;
    z-index: 99999;
    background: white;
  `;
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error('无法创建 PDF 渲染环境');
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Wait for content to render
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const options = {
    margin: 0,
    filename: filename || `mission-report-${data.mission.id}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: '#ffffff',
    },
    jsPDF: {
      unit: 'px' as const,
      format: 'a4' as const,
      orientation: 'portrait' as const,
      hotfixes: ['px_scaling'],
    },
    pagebreak: {
      mode: ['css', 'legacy'] as ('css' | 'legacy')[],
    },
  };

  try {
    await html2pdf().set(options).from(iframeDoc.body).save();
  } finally {
    document.body.removeChild(iframe);
  }
}
