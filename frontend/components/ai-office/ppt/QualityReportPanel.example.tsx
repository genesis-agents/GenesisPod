'use client';

/**
 * QualityReportPanel 使用示例
 *
 * 展示如何在 PPT 编辑器中集成质量检查面板
 */

import React, { useState } from 'react';
import { Tabs, Button, Group } from '@mantine/core';
import { FileCheck } from 'lucide-react';
import QualityReportPanel from './QualityReportPanel';

/**
 * 示例 1: 在 PPT 编辑器右侧面板中使用
 */
export function PPTEditorWithQuality() {
  const [pptDocumentId] = useState('ppt-12345'); // 实际使用中从路由或 props 获取
  const [activeTab, setActiveTab] = useState<string | null>('slides');

  const handleJumpToPage = (pageIndex: number) => {
    console.log('跳转到页面:', pageIndex);
    // 实现页面跳转逻辑
    // 例如：setSelectedSlideIndex(pageIndex);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 左侧：幻灯片列表 */}
      <div style={{ width: 200, borderRight: '1px solid #e0e0e0' }}>
        {/* 幻灯片缩略图列表 */}
      </div>

      {/* 中间：幻灯片预览 */}
      <div style={{ flex: 1 }}>{/* 幻灯片内容 */}</div>

      {/* 右侧：属性面板 + 质量检查 */}
      <div style={{ width: 360, borderLeft: '1px solid #e0e0e0' }}>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="slides">幻灯片</Tabs.Tab>
            <Tabs.Tab value="quality" leftSection={<FileCheck size={16} />}>
              质量检查
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="slides" pt="md">
            <div>{/* 幻灯片属性编辑 */}</div>
          </Tabs.Panel>

          <Tabs.Panel value="quality" pt="md">
            <QualityReportPanel
              documentId={pptDocumentId}
              onJumpToPage={handleJumpToPage}
              onReportUpdate={(report) => {
                console.log('质量报告更新:', report);
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * 示例 2: 在独立的质量检查页面中使用
 */
export function QualityCheckPage({ documentId }: { documentId: string }) {
  const handleJumpToPage = (pageIndex: number) => {
    // 跳转到编辑器并定位到对应页面
    window.location.href = `/ai-office/ppt/${documentId}?page=${pageIndex}`;
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <Group justify="space-between" mb="lg">
        <h1>PPT 质量检查</h1>
        <Button variant="outline" onClick={() => window.history.back()}>
          返回编辑器
        </Button>
      </Group>

      <QualityReportPanel
        documentId={documentId}
        onJumpToPage={handleJumpToPage}
      />
    </div>
  );
}

/**
 * 示例 3: 在导出前的质量检查对话框中使用
 */
export function ExportWithQualityCheck({ documentId }: { documentId: string }) {
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [qualityScore, setQualityScore] = useState<number | null>(null);

  const handleExport = () => {
    if (qualityScore !== null && qualityScore < 70) {
      // 分数较低，建议先优化
      setShowQualityCheck(true);
    } else {
      // 直接导出
      performExport();
    }
  };

  const performExport = () => {
    console.log('开始导出 PPT...');
    // 实际导出逻辑
  };

  return (
    <div>
      <Button onClick={handleExport}>导出 PPT</Button>

      {showQualityCheck && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 8,
              maxWidth: 800,
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div style={{ padding: 24 }}>
              <h2>质量检查</h2>
              <p>检测到您的 PPT 存在一些可以优化的地方，建议先修复后再导出。</p>

              <QualityReportPanel
                documentId={documentId}
                onReportUpdate={(report) => setQualityScore(report.score)}
              />

              <Group justify="flex-end" mt="lg">
                <Button
                  variant="outline"
                  onClick={() => setShowQualityCheck(false)}
                >
                  取消
                </Button>
                <Button
                  variant="light"
                  onClick={() => setShowQualityCheck(false)}
                >
                  稍后优化
                </Button>
                <Button onClick={performExport}>仍然导出</Button>
              </Group>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PPTEditorWithQuality;
