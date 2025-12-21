/**
 * Notion Block <-> BlockNote Block Converter
 *
 * Converts between Notion API block format and BlockNote editor format
 */

import { Block, PartialBlock } from '@blocknote/core';

// Notion block types
interface NotionRichText {
  type: 'text';
  text: {
    content: string;
    link?: { url: string } | null;
  };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  plain_text: string;
  href?: string | null;
}

interface NotionBlock {
  id: string;
  type: string;
  [key: string]: any;
}

// Convert Notion rich text to BlockNote inline content
function convertNotionRichTextToInlineContent(
  richText: NotionRichText[] | undefined
): any[] {
  if (!richText || richText.length === 0) {
    return [];
  }

  return richText.map((text) => {
    const styles: Record<string, boolean> = {};

    if (text.annotations?.bold) styles.bold = true;
    if (text.annotations?.italic) styles.italic = true;
    if (text.annotations?.strikethrough) styles.strike = true;
    if (text.annotations?.underline) styles.underline = true;
    if (text.annotations?.code) styles.code = true;

    if (text.href) {
      return {
        type: 'link',
        href: text.href,
        content: [
          {
            type: 'text',
            text: text.plain_text,
            styles,
          },
        ],
      };
    }

    return {
      type: 'text',
      text: text.plain_text,
      styles,
    };
  });
}

// Convert BlockNote inline content to Notion rich text
function convertInlineContentToNotionRichText(
  content: any[] | undefined
): NotionRichText[] {
  if (!content || content.length === 0) {
    return [];
  }

  const result: NotionRichText[] = [];

  const processContent = (item: any): NotionRichText[] => {
    if (item.type === 'text') {
      return [
        {
          type: 'text',
          text: {
            content: item.text || '',
            link: null,
          },
          annotations: {
            bold: item.styles?.bold || false,
            italic: item.styles?.italic || false,
            strikethrough: item.styles?.strike || false,
            underline: item.styles?.underline || false,
            code: item.styles?.code || false,
          },
          plain_text: item.text || '',
          href: null,
        },
      ];
    }

    if (item.type === 'link') {
      const linkContent = item.content || [];
      return linkContent.map((c: any) => ({
        type: 'text' as const,
        text: {
          content: c.text || '',
          link: { url: item.href },
        },
        annotations: {
          bold: c.styles?.bold || false,
          italic: c.styles?.italic || false,
          strikethrough: c.styles?.strike || false,
          underline: c.styles?.underline || false,
          code: c.styles?.code || false,
        },
        plain_text: c.text || '',
        href: item.href,
      }));
    }

    return [];
  };

  for (const item of content) {
    result.push(...processContent(item));
  }

  return result;
}

/**
 * Convert Notion blocks to BlockNote blocks
 */
export function notionBlocksToBlockNote(
  notionBlocks: NotionBlock[]
): PartialBlock[] {
  if (!notionBlocks || notionBlocks.length === 0) {
    return [
      {
        type: 'paragraph',
        content: [],
      },
    ];
  }

  const blocks: PartialBlock[] = [];
  let currentListItems: PartialBlock[] = [];
  let currentListType: 'bulletListItem' | 'numberedListItem' | null = null;

  const flushList = () => {
    if (currentListItems.length > 0) {
      blocks.push(...currentListItems);
      currentListItems = [];
      currentListType = null;
    }
  };

  for (const block of notionBlocks) {
    const { type } = block;

    switch (type) {
      case 'paragraph':
        flushList();
        blocks.push({
          type: 'paragraph',
          content: convertNotionRichTextToInlineContent(
            block.paragraph?.rich_text
          ),
        });
        break;

      case 'heading_1':
        flushList();
        blocks.push({
          type: 'heading',
          props: { level: 1 },
          content: convertNotionRichTextToInlineContent(
            block.heading_1?.rich_text
          ),
        });
        break;

      case 'heading_2':
        flushList();
        blocks.push({
          type: 'heading',
          props: { level: 2 },
          content: convertNotionRichTextToInlineContent(
            block.heading_2?.rich_text
          ),
        });
        break;

      case 'heading_3':
        flushList();
        blocks.push({
          type: 'heading',
          props: { level: 3 },
          content: convertNotionRichTextToInlineContent(
            block.heading_3?.rich_text
          ),
        });
        break;

      case 'bulleted_list_item':
        if (currentListType !== 'bulletListItem') {
          flushList();
          currentListType = 'bulletListItem';
        }
        currentListItems.push({
          type: 'bulletListItem',
          content: convertNotionRichTextToInlineContent(
            block.bulleted_list_item?.rich_text
          ),
        });
        break;

      case 'numbered_list_item':
        if (currentListType !== 'numberedListItem') {
          flushList();
          currentListType = 'numberedListItem';
        }
        currentListItems.push({
          type: 'numberedListItem',
          content: convertNotionRichTextToInlineContent(
            block.numbered_list_item?.rich_text
          ),
        });
        break;

      case 'to_do':
        flushList();
        blocks.push({
          type: 'checkListItem',
          props: {
            checked: block.to_do?.checked || false,
          },
          content: convertNotionRichTextToInlineContent(block.to_do?.rich_text),
        });
        break;

      case 'quote':
        flushList();
        // BlockNote doesn't have a native quote block, use paragraph with styling
        blocks.push({
          type: 'paragraph',
          props: {
            textColor: 'gray',
          },
          content: convertNotionRichTextToInlineContent(block.quote?.rich_text),
        });
        break;

      case 'code':
        flushList();
        blocks.push({
          type: 'codeBlock',
          props: {
            language: block.code?.language || 'plain text',
          },
          content: convertNotionRichTextToInlineContent(block.code?.rich_text),
        });
        break;

      case 'divider':
        flushList();
        // BlockNote doesn't have a divider, skip or use a separator
        blocks.push({
          type: 'paragraph',
          content: [{ type: 'text', text: '───────────────────', styles: {} }],
        });
        break;

      case 'callout':
        flushList();
        // Convert callout to a styled paragraph
        const emoji = block.callout?.icon?.emoji || '💡';
        const calloutContent = convertNotionRichTextToInlineContent(
          block.callout?.rich_text
        );
        blocks.push({
          type: 'paragraph',
          props: {
            backgroundColor: 'yellow',
          },
          content: [
            { type: 'text', text: `${emoji} `, styles: {} },
            ...calloutContent,
          ],
        });
        break;

      case 'image':
        flushList();
        const imageUrl =
          block.image?.file?.url || block.image?.external?.url || '';
        if (imageUrl) {
          blocks.push({
            type: 'image',
            props: {
              url: imageUrl,
              caption: block.image?.caption?.[0]?.plain_text || '',
            },
          });
        }
        break;

      case 'table':
        flushList();
        // BlockNote has table support
        if (block.table?.table_width && block.children) {
          const tableContent = {
            type: 'table' as const,
            content: {
              type: 'tableContent' as const,
              rows: block.children.map((row: any) => ({
                cells:
                  row.table_row?.cells?.map((cell: any) =>
                    convertNotionRichTextToInlineContent(cell)
                  ) || [],
              })),
            },
          };
          blocks.push(tableContent as any);
        }
        break;

      default:
        // For unsupported blocks, try to extract text content
        flushList();
        if (block[type]?.rich_text) {
          blocks.push({
            type: 'paragraph',
            content: convertNotionRichTextToInlineContent(
              block[type].rich_text
            ),
          });
        }
        break;
    }
  }

  flushList();

  // Ensure at least one block exists
  if (blocks.length === 0) {
    blocks.push({
      type: 'paragraph',
      content: [],
    });
  }

  return blocks;
}

/**
 * Convert BlockNote blocks to Notion blocks
 */
export function blockNoteToNotionBlocks(blocks: Block[]): NotionBlock[] {
  const notionBlocks: NotionBlock[] = [];

  for (const block of blocks) {
    const id = block.id || crypto.randomUUID();

    switch (block.type) {
      case 'paragraph':
        notionBlocks.push({
          id,
          type: 'paragraph',
          paragraph: {
            rich_text: convertInlineContentToNotionRichText(
              block.content as any
            ),
          },
        });
        break;

      case 'heading':
        const level = (block.props as any)?.level || 1;
        const headingType = `heading_${level}` as
          | 'heading_1'
          | 'heading_2'
          | 'heading_3';
        notionBlocks.push({
          id,
          type: headingType,
          [headingType]: {
            rich_text: convertInlineContentToNotionRichText(
              block.content as any
            ),
          },
        });
        break;

      case 'bulletListItem':
        notionBlocks.push({
          id,
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: convertInlineContentToNotionRichText(
              block.content as any
            ),
          },
        });
        break;

      case 'numberedListItem':
        notionBlocks.push({
          id,
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: convertInlineContentToNotionRichText(
              block.content as any
            ),
          },
        });
        break;

      case 'checkListItem':
        notionBlocks.push({
          id,
          type: 'to_do',
          to_do: {
            rich_text: convertInlineContentToNotionRichText(
              block.content as any
            ),
            checked: (block.props as any)?.checked || false,
          },
        });
        break;

      case 'codeBlock':
        notionBlocks.push({
          id,
          type: 'code',
          code: {
            rich_text: convertInlineContentToNotionRichText(
              block.content as any
            ),
            language: (block.props as any)?.language || 'plain text',
          },
        });
        break;

      case 'image':
        const url = (block.props as any)?.url;
        if (url) {
          notionBlocks.push({
            id,
            type: 'image',
            image: {
              type: 'external',
              external: { url },
              caption: (block.props as any)?.caption
                ? [
                    {
                      type: 'text',
                      text: { content: (block.props as any).caption },
                      plain_text: (block.props as any).caption,
                    },
                  ]
                : [],
            },
          });
        }
        break;

      case 'table':
        // Handle table conversion
        const tableContent = block.content as any;
        if (tableContent?.rows) {
          notionBlocks.push({
            id,
            type: 'table',
            table: {
              table_width: tableContent.rows[0]?.cells?.length || 1,
              has_column_header: false,
              has_row_header: false,
            },
            children: tableContent.rows.map((row: any) => ({
              type: 'table_row',
              table_row: {
                cells:
                  row.cells?.map((cell: any) =>
                    convertInlineContentToNotionRichText(cell)
                  ) || [],
              },
            })),
          });
        }
        break;

      default:
        // For any other blocks, try to convert as paragraph
        if (block.content) {
          notionBlocks.push({
            id,
            type: 'paragraph',
            paragraph: {
              rich_text: convertInlineContentToNotionRichText(
                block.content as any
              ),
            },
          });
        }
        break;
    }

    // Handle nested children blocks recursively
    if (block.children && block.children.length > 0) {
      notionBlocks.push(...blockNoteToNotionBlocks(block.children));
    }
  }

  return notionBlocks;
}

/**
 * Extract plain text from Notion blocks
 */
export function extractPlainText(notionBlocks: NotionBlock[]): string {
  const textParts: string[] = [];

  for (const block of notionBlocks) {
    const { type } = block;
    const richText = block[type]?.rich_text;

    if (richText) {
      textParts.push(
        richText.map((t: NotionRichText) => t.plain_text).join('')
      );
    }
  }

  return textParts.join('\n');
}
