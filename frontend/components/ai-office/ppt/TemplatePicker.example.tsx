/**
 * TemplatePicker 使用示例
 *
 * 展示如何在不同场景下使用 TemplatePicker 组件
 */

import React, { useState } from 'react';
import { TemplatePicker } from './TemplatePicker';

// ============================================
// 示例 1: 基础使用 - 显示所有模板
// ============================================

export function BasicTemplatePickerExample() {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  return (
    <div className="p-6">
      <h2 className="mb-4 text-xl font-bold">选择 PPT 模板</h2>
      <TemplatePicker
        onApplyTemplate={(template) => {
          setSelectedTemplate(template);
          console.log('应用模板:', template);
        }}
        selectedTemplateKey={selectedTemplate?.key}
      />
    </div>
  );
}

// ============================================
// 示例 2: 单页推荐 - 智能匹配模式
// ============================================

export function SmartMatchTemplatePickerExample() {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  // 假设这些值来自父组件
  const pptId = 'ppt-123';
  const currentSlideIndex = 2;

  return (
    <div className="p-6">
      <h2 className="mb-4 text-xl font-bold">为当前页面推荐模板</h2>
      <p className="mb-4 text-sm text-gray-600">
        根据第 {currentSlideIndex + 1} 页的内容，智能推荐最合适的模板
      </p>

      <TemplatePicker
        pptId={pptId}
        slideIndex={currentSlideIndex}
        enableSmartMatch={true}
        onApplyTemplate={(template) => {
          setSelectedTemplate(template);
          // 调用 API 应用模板到当前页面
          applyTemplateToSlide(pptId, currentSlideIndex, template);
        }}
        selectedTemplateKey={selectedTemplate?.key}
      />
    </div>
  );
}

// ============================================
// 示例 3: 模态框中使用
// ============================================

export function ModalTemplatePickerExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  return (
    <div className="p-6">
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        更换模板
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">选择模板</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <TemplatePicker
              pptId="ppt-123"
              slideIndex={0}
              enableSmartMatch={true}
              onApplyTemplate={(template) => {
                setSelectedTemplate(template);
                setIsOpen(false);
                console.log('应用模板:', template);
              }}
              selectedTemplateKey={selectedTemplate?.key}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// 示例 4: 在 PPT 编辑器侧边栏中使用
// ============================================

export function SidebarTemplatePickerExample() {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const pptId = 'ppt-123';

  return (
    <div className="flex h-screen">
      {/* 主编辑区 */}
      <div className="flex-1 bg-gray-100 p-6">
        <h2 className="mb-4 text-xl font-bold">幻灯片编辑区</h2>
        <div className="aspect-video rounded-lg bg-white shadow-lg">
          <p className="p-8 text-center text-gray-500">
            当前第 {currentSlideIndex + 1} 页
            {selectedTemplate && (
              <span className="block text-sm text-blue-600">
                模板: {selectedTemplate.nameZh}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 右侧模板选择器 */}
      <div className="w-96 overflow-y-auto border-l border-gray-200 bg-white p-4">
        <TemplatePicker
          pptId={pptId}
          slideIndex={currentSlideIndex}
          enableSmartMatch={true}
          onApplyTemplate={(template) => {
            setSelectedTemplate(template);
            // 实际场景中会调用 API
            console.log(
              `应用模板 ${template.key} 到第 ${currentSlideIndex + 1} 页`
            );
          }}
          selectedTemplateKey={selectedTemplate?.key}
          className="h-full"
        />
      </div>
    </div>
  );
}

// ============================================
// 辅助函数
// ============================================

/**
 * 应用模板到指定幻灯片
 */
async function applyTemplateToSlide(
  pptId: string,
  slideIndex: number,
  template: any
): Promise<void> {
  try {
    const response = await fetch(
      `/api/ai-office/ppt/${pptId}/slides/${slideIndex}/apply-template`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateKey: template.key }),
      }
    );

    if (!response.ok) {
      throw new Error('应用模板失败');
    }

    console.log('模板应用成功');
  } catch (error) {
    console.error('应用模板时出错:', error);
  }
}
