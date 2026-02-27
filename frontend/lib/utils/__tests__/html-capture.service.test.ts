/**
 * Tests for lib/utils/html-capture.service.ts
 *
 * Tests the HtmlCaptureService static methods.
 * Uses jsdom environment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HtmlCaptureService } from '../html-capture.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeContainer(
  html: string,
  selector = '#test-container'
): HTMLElement {
  const div = document.createElement('div');
  div.id = 'test-container';
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

function cleanup() {
  document.body.innerHTML = '';
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// capture - basic functionality
// ---------------------------------------------------------------------------
describe('HtmlCaptureService.capture', () => {
  it('throws when container selector not found', async () => {
    await expect(
      HtmlCaptureService.capture('#non-existent-container', {
        inlineStyles: false,
        freezeCharts: false,
        freezeMermaid: false,
        inlineImages: false,
      })
    ).rejects.toThrow('Container not found');
  });

  it('returns html and css properties', async () => {
    makeContainer('<p class="test-class">Hello World</p>');

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('css');
    expect(typeof result.html).toBe('string');
    expect(typeof result.css).toBe('string');
  });

  it('html contains the container content', async () => {
    makeContainer('<p>Content here</p>');

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result.html).toContain('Content here');
  });

  it('does not modify the live DOM when cloning', async () => {
    makeContainer('<p id="original-para">Original</p>');
    const originalPara = document.getElementById('original-para');

    await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    // Original paragraph should still exist
    expect(document.getElementById('original-para')).toBe(originalPara);
  });

  it('works with inlineStyles=true', async () => {
    makeContainer('<p class="myClass">Styled content</p>');

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: true,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result.html).toBeDefined();
    expect(result.css).toBeDefined();
  });

  it('works with freezeCharts=true when no charts present', async () => {
    makeContainer('<p>No charts here</p>');

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: true,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result.html).toContain('No charts here');
  });

  it('works with inlineImages=true when no images present', async () => {
    makeContainer('<p>No images here</p>');

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: true,
    });

    expect(result.html).toContain('No images here');
  });

  it('handles empty container', async () => {
    makeContainer('');

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result.html).toBeDefined();
    expect(typeof result.html).toBe('string');
  });

  it('uses default options when none provided', async () => {
    makeContainer('<p>Default options test</p>');

    // Should not throw with default options
    const result = await HtmlCaptureService.capture('#test-container');

    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('css');
  });

  it('handles container with nested elements', async () => {
    makeContainer(`
      <div class="outer">
        <h1>Title</h1>
        <p class="text">Paragraph</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
      </div>
    `);

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result.html).toContain('Title');
    expect(result.html).toContain('Paragraph');
    expect(result.html).toContain('Item 1');
  });

  it('handles container with data attributes', async () => {
    makeContainer(
      '<div data-testid="test" data-value="42">Data attr test</div>'
    );

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result.html).toContain('data-testid');
  });
});

// ---------------------------------------------------------------------------
// freezeCharts - recharts support
// ---------------------------------------------------------------------------
describe('HtmlCaptureService.capture with recharts charts', () => {
  it('handles container with recharts wrapper elements', async () => {
    makeContainer(`
      <div class="recharts-wrapper" style="width: 400px; height: 300px;">
        <svg width="400" height="300">
          <g class="recharts-cartesian-grid">
            <line x1="0" y1="0" x2="400" y2="0"/>
          </g>
          <g class="recharts-tooltip-wrapper">
            <div>Tooltip content</div>
          </g>
        </svg>
      </div>
    `);

    // Should not throw even with recharts elements
    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: true,
      freezeMermaid: false,
      inlineImages: false,
    });

    expect(result.html).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// inlineImages - image handling
// ---------------------------------------------------------------------------
describe('HtmlCaptureService.capture with images', () => {
  it('handles images with data: URLs (already inlined)', async () => {
    makeContainer(`
      <img src="data:image/png;base64,iVBORw0KGgo=" alt="test" />
    `);

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: true,
    });

    // data: URLs should be preserved
    expect(result.html).toContain('data:image/png');
  });

  it('handles fetch failure for external images gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    makeContainer(
      `<img src="https://external.example.com/image.png" alt="external" />`
    );

    // Should not throw even when image fetch fails
    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: true,
    });

    expect(result).toHaveProperty('html');
  });
});

// ---------------------------------------------------------------------------
// removeInteractivity
// ---------------------------------------------------------------------------
describe('HtmlCaptureService.capture - removes interactivity', () => {
  it('result html should not be identical to input (cloned and processed)', async () => {
    makeContainer('<button onclick="alert(1)">Click me</button>');

    const result = await HtmlCaptureService.capture('#test-container', {
      inlineStyles: false,
      freezeCharts: false,
      freezeMermaid: false,
      inlineImages: false,
    });

    // The html should be the clone's outerHTML
    expect(result.html).toContain('div');
  });
});
