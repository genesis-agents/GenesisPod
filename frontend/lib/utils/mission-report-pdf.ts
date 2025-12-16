/**
 * AI Team Mission Report PDF Generator
 * 生成专业的任务执行报告PDF
 *
 * 功能特点：
 * - 执行摘要 (Executive Summary)
 * - 任务统计图表
 * - 详细任务内容
 * - Agent参与情况
 * - 专业排版设计
 */

import jsPDF from 'jspdf';

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
 * Mission Report PDF Generator Class
 */
export class MissionReportPDFGenerator {
  private pdf: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number;
  private contentWidth: number;
  private currentY: number;
  private pageNumber: number;

  // Color scheme
  private colors = {
    primary: '#7c3aed', // Purple
    secondary: '#6366f1', // Indigo
    success: '#22c55e', // Green
    warning: '#f59e0b', // Amber
    error: '#ef4444', // Red
    text: '#1f2937', // Gray 800
    textLight: '#6b7280', // Gray 500
    textMuted: '#9ca3af', // Gray 400
    border: '#e5e7eb', // Gray 200
    background: '#f9fafb', // Gray 50
    white: '#ffffff',
  };

  constructor() {
    this.pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    this.pageWidth = this.pdf.internal.pageSize.getWidth();
    this.pageHeight = this.pdf.internal.pageSize.getHeight();
    this.margin = 20;
    this.contentWidth = this.pageWidth - 2 * this.margin;
    this.currentY = this.margin;
    this.pageNumber = 1;
  }

  /**
   * Generate PDF from report data
   */
  async generate(data: MissionReportData): Promise<Blob> {
    const stats = this.calculateStats(data);

    // Cover Page
    this.addCoverPage(data);

    // Executive Summary
    this.addNewPage();
    this.addExecutiveSummary(data, stats);

    // Task Statistics
    this.addNewPage();
    this.addTaskStatistics(stats);

    // Agent Participation
    this.addAgentParticipation(stats);

    // Final Result
    if (data.mission.finalResult) {
      this.addNewPage();
      this.addFinalResult(data.mission.finalResult);
    }

    // Detailed Task Reports
    this.addNewPage();
    this.addDetailedTasks(data.tasks);

    // Add page numbers
    this.addPageNumbers();

    return this.pdf.output('blob');
  }

  /**
   * Calculate statistics from report data
   */
  private calculateStats(data: MissionReportData): ReportStats {
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
   * Add cover page
   */
  private addCoverPage(data: MissionReportData) {
    // Background gradient effect (simplified with rectangles)
    this.pdf.setFillColor(124, 58, 237); // Primary purple
    this.pdf.rect(0, 0, this.pageWidth, 100, 'F');

    // Title
    this.pdf.setTextColor(255, 255, 255);
    this.pdf.setFontSize(28);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text('AI Team Mission Report', this.pageWidth / 2, 50, {
      align: 'center',
    });

    // Subtitle
    this.pdf.setFontSize(14);
    this.pdf.setFont('helvetica', 'normal');
    this.pdf.text('Powered by DeepDive Engine', this.pageWidth / 2, 65, {
      align: 'center',
    });

    // Mission title
    this.pdf.setTextColor(31, 41, 55);
    this.pdf.setFontSize(16);
    this.pdf.setFont('helvetica', 'bold');
    const titleLines = this.pdf.splitTextToSize(
      this.truncateText(data.mission.title, 200),
      this.contentWidth
    );
    this.pdf.text(titleLines, this.pageWidth / 2, 130, { align: 'center' });

    // Mission info box
    const infoY = 160;
    this.pdf.setFillColor(249, 250, 251);
    this.pdf.roundedRect(this.margin, infoY, this.contentWidth, 60, 3, 3, 'F');

    this.pdf.setTextColor(107, 114, 128);
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'normal');

    const infoItems = [
      { label: 'Mission ID', value: data.mission.id },
      { label: 'Status', value: data.mission.status },
      { label: 'Leader', value: data.mission.leader },
      { label: 'Created', value: this.formatDate(data.mission.createdAt) },
      {
        label: 'Completed',
        value: data.mission.completedAt
          ? this.formatDate(data.mission.completedAt)
          : 'In Progress',
      },
    ];

    let infoItemY = infoY + 12;
    infoItems.forEach((item) => {
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(`${item.label}:`, this.margin + 10, infoItemY);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(item.value, this.margin + 45, infoItemY);
      infoItemY += 10;
    });

    // Footer
    this.pdf.setTextColor(156, 163, 175);
    this.pdf.setFontSize(9);
    this.pdf.text(
      `Generated on ${new Date().toLocaleString()}`,
      this.pageWidth / 2,
      this.pageHeight - 20,
      { align: 'center' }
    );
  }

  /**
   * Add executive summary section
   */
  private addExecutiveSummary(data: MissionReportData, stats: ReportStats) {
    this.addSectionTitle('Executive Summary');
    this.currentY += 5;

    // Summary box
    this.pdf.setFillColor(249, 250, 251);
    this.pdf.roundedRect(
      this.margin,
      this.currentY,
      this.contentWidth,
      70,
      3,
      3,
      'F'
    );

    const boxY = this.currentY + 8;
    this.pdf.setTextColor(31, 41, 55);
    this.pdf.setFontSize(11);
    this.pdf.setFont('helvetica', 'normal');

    // Key metrics
    const metrics = [
      {
        label: 'Total Tasks',
        value: stats.totalTasks.toString(),
        color: this.colors.primary,
      },
      {
        label: 'Completed',
        value: stats.completedTasks.toString(),
        color: this.colors.success,
      },
      {
        label: 'Completion Rate',
        value: `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}%`,
        color: this.colors.secondary,
      },
      {
        label: 'AI Agents',
        value: stats.participantCount.toString(),
        color: this.colors.primary,
      },
      {
        label: 'Duration',
        value: `${stats.durationMinutes} min`,
        color: this.colors.textLight,
      },
      {
        label: 'Revisions',
        value: stats.totalRevisions.toString(),
        color: this.colors.warning,
      },
    ];

    const colWidth = this.contentWidth / 3;
    metrics.forEach((metric, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = this.margin + 10 + col * colWidth;
      const y = boxY + row * 30;

      // Value
      this.pdf.setTextColor(
        this.hexToRgb(metric.color).r,
        this.hexToRgb(metric.color).g,
        this.hexToRgb(metric.color).b
      );
      this.pdf.setFontSize(20);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(metric.value, x, y);

      // Label
      this.pdf.setTextColor(107, 114, 128);
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(metric.label, x, y + 6);
    });

    this.currentY += 80;

    // Mission description
    this.addSubsectionTitle('Mission Description');
    this.currentY += 3;

    this.pdf.setTextColor(55, 65, 81);
    this.pdf.setFontSize(10);
    this.pdf.setFont('helvetica', 'normal');
    const descLines = this.pdf.splitTextToSize(
      this.truncateText(data.mission.description, 800),
      this.contentWidth
    );
    this.pdf.text(descLines, this.margin, this.currentY);
    this.currentY += descLines.length * 5 + 10;

    // Overall assessment
    this.addSubsectionTitle('Overall Assessment');
    this.currentY += 3;

    const completionRate = (stats.completedTasks / stats.totalTasks) * 100;
    let assessment = '';
    let assessmentColor = this.colors.success;

    if (completionRate === 100) {
      assessment =
        'All tasks completed successfully. The mission was executed efficiently with full completion.';
    } else if (completionRate >= 80) {
      assessment = `Mission largely successful with ${Math.round(completionRate)}% completion rate. Minor tasks remain pending.`;
      assessmentColor = this.colors.success;
    } else if (completionRate >= 50) {
      assessment = `Mission partially complete with ${Math.round(completionRate)}% completion rate. Several tasks require attention.`;
      assessmentColor = this.colors.warning;
    } else {
      assessment = `Mission requires attention with only ${Math.round(completionRate)}% completion rate. Multiple tasks are pending or failed.`;
      assessmentColor = this.colors.error;
    }

    this.pdf.setTextColor(55, 65, 81);
    this.pdf.setFontSize(10);
    const assessLines = this.pdf.splitTextToSize(assessment, this.contentWidth);
    this.pdf.text(assessLines, this.margin, this.currentY);
  }

  /**
   * Add task statistics section
   */
  private addTaskStatistics(stats: ReportStats) {
    this.addSectionTitle('Task Statistics');
    this.currentY += 10;

    // Status breakdown chart (simplified bar chart)
    const chartHeight = 60;
    const chartY = this.currentY;
    const barWidth = 30;
    const maxHeight = 50;
    const maxValue = Math.max(
      stats.completedTasks,
      stats.inProgressTasks,
      stats.pendingTasks,
      stats.failedTasks,
      1
    );

    const statuses = [
      { label: 'Completed', value: stats.completedTasks, color: '#22c55e' },
      { label: 'In Progress', value: stats.inProgressTasks, color: '#3b82f6' },
      { label: 'Pending', value: stats.pendingTasks, color: '#f59e0b' },
      { label: 'Failed', value: stats.failedTasks, color: '#ef4444' },
    ];

    const chartStartX = this.margin + 20;

    statuses.forEach((status, index) => {
      const x = chartStartX + index * (barWidth + 15);
      const barHeight = (status.value / maxValue) * maxHeight;
      const y = chartY + maxHeight - barHeight;

      // Bar
      const rgb = this.hexToRgb(status.color);
      this.pdf.setFillColor(rgb.r, rgb.g, rgb.b);
      this.pdf.roundedRect(x, y, barWidth, barHeight, 2, 2, 'F');

      // Value on top
      this.pdf.setTextColor(31, 41, 55);
      this.pdf.setFontSize(12);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(status.value.toString(), x + barWidth / 2, y - 3, {
        align: 'center',
      });

      // Label below
      this.pdf.setTextColor(107, 114, 128);
      this.pdf.setFontSize(8);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(status.label, x + barWidth / 2, chartY + maxHeight + 8, {
        align: 'center',
      });
    });

    this.currentY = chartY + chartHeight + 20;

    // Summary table
    this.pdf.setFillColor(249, 250, 251);
    this.pdf.roundedRect(
      this.margin,
      this.currentY,
      this.contentWidth,
      40,
      3,
      3,
      'F'
    );

    const tableY = this.currentY + 10;
    const summaryItems = [
      { label: 'Total Tasks Processed', value: stats.totalTasks },
      { label: 'Total Revisions Made', value: stats.totalRevisions },
      {
        label: 'Average Revisions per Task',
        value: stats.avgRevisions.toFixed(1),
      },
      {
        label: 'Total Processing Time',
        value: `${stats.durationMinutes} minutes`,
      },
    ];

    summaryItems.forEach((item, index) => {
      const y = tableY + index * 8;
      this.pdf.setTextColor(107, 114, 128);
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(item.label, this.margin + 10, y);

      this.pdf.setTextColor(31, 41, 55);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(
        item.value.toString(),
        this.margin + this.contentWidth - 10,
        y,
        { align: 'right' }
      );
    });

    this.currentY += 50;
  }

  /**
   * Add agent participation section
   */
  private addAgentParticipation(stats: ReportStats) {
    this.addSubsectionTitle('AI Agent Participation');
    this.currentY += 5;

    const sortedParticipants = Array.from(stats.participants.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    const maxTasks = sortedParticipants[0]?.[1] || 1;
    const barMaxWidth = 100;

    sortedParticipants.forEach(([agent, taskCount], index) => {
      if (this.currentY > this.pageHeight - 40) {
        this.addNewPage();
      }

      // Agent name
      this.pdf.setTextColor(31, 41, 55);
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(this.truncateText(agent, 30), this.margin, this.currentY);

      // Progress bar
      const barX = this.margin + 55;
      const barWidth = (taskCount / maxTasks) * barMaxWidth;

      this.pdf.setFillColor(229, 231, 235);
      this.pdf.roundedRect(barX, this.currentY - 4, barMaxWidth, 5, 1, 1, 'F');

      this.pdf.setFillColor(124, 58, 237);
      this.pdf.roundedRect(barX, this.currentY - 4, barWidth, 5, 1, 1, 'F');

      // Task count
      this.pdf.setTextColor(107, 114, 128);
      this.pdf.text(
        `${taskCount} tasks`,
        barX + barMaxWidth + 5,
        this.currentY
      );

      this.currentY += 10;
    });

    this.currentY += 10;
  }

  /**
   * Add final result section
   */
  private addFinalResult(finalResult: string) {
    this.addSectionTitle('Final Result');
    this.currentY += 5;

    // Process markdown-like content
    const lines = finalResult.split('\n');

    lines.forEach((line) => {
      if (this.currentY > this.pageHeight - 30) {
        this.addNewPage();
      }

      const trimmed = line.trim();
      if (!trimmed) {
        this.currentY += 3;
        return;
      }

      // Headers
      if (trimmed.startsWith('# ')) {
        this.pdf.setTextColor(31, 41, 55);
        this.pdf.setFontSize(14);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.text(trimmed.replace(/^# /, ''), this.margin, this.currentY);
        this.currentY += 8;
      } else if (trimmed.startsWith('## ')) {
        this.pdf.setTextColor(55, 65, 81);
        this.pdf.setFontSize(12);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.text(trimmed.replace(/^## /, ''), this.margin, this.currentY);
        this.currentY += 7;
      } else if (trimmed.startsWith('### ')) {
        this.pdf.setTextColor(75, 85, 99);
        this.pdf.setFontSize(11);
        this.pdf.setFont('helvetica', 'bold');
        this.pdf.text(trimmed.replace(/^### /, ''), this.margin, this.currentY);
        this.currentY += 6;
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        // List items
        this.pdf.setTextColor(55, 65, 81);
        this.pdf.setFontSize(10);
        this.pdf.setFont('helvetica', 'normal');
        const bulletText = `  ${trimmed.replace(/^[-*] /, '')}`;
        const bulletLines = this.pdf.splitTextToSize(
          bulletText,
          this.contentWidth - 10
        );

        // Bullet point
        this.pdf.setFillColor(124, 58, 237);
        this.pdf.circle(this.margin + 3, this.currentY - 1, 1, 'F');

        this.pdf.text(bulletLines, this.margin + 8, this.currentY);
        this.currentY += bulletLines.length * 5;
      } else if (trimmed.startsWith('|')) {
        // Table row (simplified)
        this.pdf.setTextColor(55, 65, 81);
        this.pdf.setFontSize(9);
        this.pdf.setFont('helvetica', 'normal');
        const cleanRow = trimmed.replace(/\|/g, '  ').trim();
        this.pdf.text(cleanRow, this.margin, this.currentY);
        this.currentY += 5;
      } else if (trimmed === '---') {
        // Horizontal rule
        this.pdf.setDrawColor(229, 231, 235);
        this.pdf.line(
          this.margin,
          this.currentY,
          this.margin + this.contentWidth,
          this.currentY
        );
        this.currentY += 5;
      } else {
        // Regular paragraph
        this.pdf.setTextColor(55, 65, 81);
        this.pdf.setFontSize(10);
        this.pdf.setFont('helvetica', 'normal');
        // Remove markdown formatting
        const cleanText = trimmed
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/`(.+?)`/g, '$1');
        const textLines = this.pdf.splitTextToSize(
          cleanText,
          this.contentWidth
        );
        this.pdf.text(textLines, this.margin, this.currentY);
        this.currentY += textLines.length * 5;
      }
    });
  }

  /**
   * Add detailed task reports
   */
  private addDetailedTasks(tasks: MissionReportData['tasks']) {
    this.addSectionTitle('Detailed Task Reports');
    this.currentY += 10;

    tasks.forEach((task, index) => {
      if (this.currentY > this.pageHeight - 60) {
        this.addNewPage();
      }

      // Task header
      this.pdf.setFillColor(249, 250, 251);
      this.pdf.roundedRect(
        this.margin,
        this.currentY,
        this.contentWidth,
        15,
        2,
        2,
        'F'
      );

      this.pdf.setTextColor(31, 41, 55);
      this.pdf.setFontSize(11);
      this.pdf.setFont('helvetica', 'bold');
      this.pdf.text(
        `Task ${index + 1}: ${this.truncateText(task.title, 60)}`,
        this.margin + 5,
        this.currentY + 10
      );

      // Status badge
      const statusColors: Record<string, string> = {
        COMPLETED: '#22c55e',
        IN_PROGRESS: '#3b82f6',
        PENDING: '#f59e0b',
        FAILED: '#ef4444',
      };
      const statusColor = statusColors[task.status] || '#6b7280';
      const statusRgb = this.hexToRgb(statusColor);
      this.pdf.setFillColor(statusRgb.r, statusRgb.g, statusRgb.b);
      this.pdf.roundedRect(
        this.margin + this.contentWidth - 30,
        this.currentY + 4,
        25,
        7,
        2,
        2,
        'F'
      );
      this.pdf.setTextColor(255, 255, 255);
      this.pdf.setFontSize(7);
      this.pdf.text(
        task.status,
        this.margin + this.contentWidth - 17.5,
        this.currentY + 9,
        { align: 'center' }
      );

      this.currentY += 20;

      // Task details
      this.pdf.setTextColor(107, 114, 128);
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(
        `Assigned to: ${task.assignedTo}`,
        this.margin + 5,
        this.currentY
      );
      this.pdf.text(
        `Revisions: ${task.revisionCount}`,
        this.margin + 100,
        this.currentY
      );
      this.currentY += 8;

      // Result preview
      if (task.result) {
        this.pdf.setTextColor(55, 65, 81);
        this.pdf.setFontSize(9);
        const resultPreview = this.truncateText(
          task.result.replace(/\n/g, ' '),
          300
        );
        const resultLines = this.pdf.splitTextToSize(
          resultPreview,
          this.contentWidth - 10
        );
        this.pdf.text(resultLines, this.margin + 5, this.currentY);
        this.currentY += resultLines.length * 4 + 5;
      }

      // Leader feedback
      if (task.leaderFeedback) {
        this.pdf.setFillColor(254, 249, 195);
        this.pdf.roundedRect(
          this.margin + 5,
          this.currentY,
          this.contentWidth - 10,
          15,
          2,
          2,
          'F'
        );
        this.pdf.setTextColor(146, 64, 14);
        this.pdf.setFontSize(8);
        this.pdf.setFont('helvetica', 'italic');
        const feedbackText = `Leader: ${this.truncateText(task.leaderFeedback.replace(/\n/g, ' '), 150)}`;
        this.pdf.text(feedbackText, this.margin + 10, this.currentY + 9);
        this.currentY += 20;
      }

      this.currentY += 10;
    });
  }

  /**
   * Add page numbers to all pages
   */
  private addPageNumbers() {
    const totalPages = this.pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      this.pdf.setPage(i);
      this.pdf.setTextColor(156, 163, 175);
      this.pdf.setFontSize(9);
      this.pdf.setFont('helvetica', 'normal');
      this.pdf.text(
        `Page ${i} of ${totalPages}`,
        this.pageWidth / 2,
        this.pageHeight - 10,
        { align: 'center' }
      );
    }
  }

  /**
   * Helper: Add section title
   */
  private addSectionTitle(title: string) {
    this.pdf.setTextColor(31, 41, 55);
    this.pdf.setFontSize(16);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(title, this.margin, this.currentY);

    // Underline
    this.pdf.setDrawColor(124, 58, 237);
    this.pdf.setLineWidth(0.5);
    this.pdf.line(
      this.margin,
      this.currentY + 2,
      this.margin + 50,
      this.currentY + 2
    );

    this.currentY += 10;
  }

  /**
   * Helper: Add subsection title
   */
  private addSubsectionTitle(title: string) {
    this.pdf.setTextColor(55, 65, 81);
    this.pdf.setFontSize(12);
    this.pdf.setFont('helvetica', 'bold');
    this.pdf.text(title, this.margin, this.currentY);
    this.currentY += 6;
  }

  /**
   * Helper: Add new page
   */
  private addNewPage() {
    this.pdf.addPage();
    this.currentY = this.margin;
    this.pageNumber++;
  }

  /**
   * Helper: Truncate text
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Helper: Format date
   */
  private formatDate(dateStr: string): string {
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
   * Helper: Convert hex color to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }
}

/**
 * Generate and download mission report PDF
 */
export async function downloadMissionReportPDF(
  data: MissionReportData,
  filename?: string
) {
  const generator = new MissionReportPDFGenerator();
  const blob = await generator.generate(data);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `mission-report-${data.mission.id}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
