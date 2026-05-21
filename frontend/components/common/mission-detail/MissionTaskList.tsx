'use client';

/**
 * MissionTaskList — mission 详情「任务列表」内容无关 canonical（标准 21 / 下沉自 playground）。
 *
 * 平台定风格（表格行 / 选中态 / 行点击 / 空态），业务定内容（列定义 + 数据 + 行点击→Drawer）。
 * playground(research) 与 ai-social(阶段) 等共用同一个列表；各自传 columns + items + onRowClick，
 * 行点击通常配 canonical `SideDrawer`/`DrawerShell` 弹明细（由调用方渲染）。
 *
 * 不内嵌任何 research/social 语义；维度子状态、origin badge 等业务逻辑由调用方在 column.render 注入。
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/common';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';

export interface MissionTaskColumn<T> {
  key: string;
  /** 表头文案 */
  label: ReactNode;
  /** 列宽 class（如 'w-12' / 'w-[36%]'），可选 */
  className?: string;
  /** 单元格渲染（业务注入：标题/角色/状态徽标/操作等） */
  render: (item: T, index: number) => ReactNode;
}

export interface MissionTaskListProps<T> {
  items: T[];
  columns: MissionTaskColumn<T>[];
  /** 取每行唯一 key（默认取 item.id） */
  getRowKey?: (item: T) => string;
  /** 当前选中行 key（高亮） */
  selectedKey?: string | null;
  /** 行点击（通常 → 打开 Drawer 明细）；不传则行不可点 */
  onRowClick?: (item: T) => void;
  /** 空态 */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  className?: string;
}

export function MissionTaskList<T>({
  items,
  columns,
  getRowKey,
  selectedKey,
  onRowClick,
  emptyTitle = '暂无任务',
  emptyDescription,
  emptyIcon,
  className,
}: MissionTaskListProps<T>) {
  const keyOf = (item: T, i: number): string =>
    getRowKey?.(item) ?? (item as { id?: string }).id ?? String(i);

  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon}
      />
    );
  }

  return (
    <div className={cn('p-4', className)}>
      <Table>
        <THead>
          <Tr>
            {columns.map((col) => (
              <Th key={col.key} className={col.className}>
                {col.label}
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {items.map((item, i) => {
            const rowKey = keyOf(item, i);
            const selected = selectedKey != null && rowKey === selectedKey;
            return (
              <Tr
                key={rowKey}
                hoverable
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={cn(
                  onRowClick && 'cursor-pointer',
                  selected && 'bg-violet-50'
                )}
              >
                {columns.map((col) => (
                  <Td key={col.key} className={col.className}>
                    {col.render(item, i)}
                  </Td>
                ))}
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
