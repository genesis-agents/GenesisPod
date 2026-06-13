import { describe, expect, it } from 'vitest';
import { humanizeApiError } from '../api-error';

describe('humanizeApiError', () => {
  it('用户实证 402：provider 全 Key 失败 + quota 原文 → 友好中文', () => {
    const raw = JSON.stringify({
      statusCode: 402,
      timestamp: '2026-06-12T07:23:34.958Z',
      path: '/api/v1/foresight/topics/x/intake/extract',
      method: 'POST',
      message:
        "All API key(s) for provider 'deepseek' failed. Last error: QUOTA_EXCEEDED - Payment required - quota exceeded",
      code: 'INTERNAL_ERROR',
    });
    const out = humanizeApiError(402, raw);
    expect(out).toContain('deepseek');
    expect(out).toContain('模型设置');
    expect(out).not.toContain('statusCode');
    expect(out).not.toContain('QUOTA_EXCEEDED');
  });

  it('后端已人性化的中文 message 直接透传', () => {
    const raw = JSON.stringify({
      statusCode: 400,
      message: '主题还没有带证伪信号（falsifier）的假设卡 —— 先录入假设',
    });
    expect(humanizeApiError(400, raw)).toBe(
      '主题还没有带证伪信号（falsifier）的假设卡 —— 先录入假设'
    );
  });

  it('context 前缀拼接', () => {
    const out = humanizeApiError(
      400,
      JSON.stringify({ message: '编号已存在' }),
      '新建假设卡'
    );
    expect(out).toBe('新建假设卡失败：编号已存在');
  });

  it('限流签名 → 友好语', () => {
    expect(
      humanizeApiError(
        429,
        JSON.stringify({ message: 'Too Many Requests: rate limit hit' })
      )
    ).toContain('限流');
  });

  it('Nest validation message 数组拼接', () => {
    const raw = JSON.stringify({
      statusCode: 400,
      message: ['name should not be empty', 'layers must be an array'],
    });
    const out = humanizeApiError(400, raw);
    expect(out).toContain('请求无效');
    expect(out).toContain('name should not be empty');
  });

  it('未知英文错误 → 状态码兜底 + 截短详情，不糊整段', () => {
    const long = 'x'.repeat(500);
    const out = humanizeApiError(500, JSON.stringify({ message: long }));
    expect(out).toContain('服务开小差');
    expect(out.length).toBeLessThan(200);
  });

  it('空响应体 → 仅状态码标签', () => {
    expect(humanizeApiError(404, '')).toBe('资源不存在或已被删除');
    expect(humanizeApiError(401, '')).toContain('重新登录');
  });

  it('非 JSON 纯文本体也能处理', () => {
    expect(humanizeApiError(502, 'Bad Gateway')).toContain('暂时不可达');
  });
});
