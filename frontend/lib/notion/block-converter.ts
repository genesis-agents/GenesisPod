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

// BlockNote inline content types
interface BlockNoteInlineContent {
  type: string;
  text?: string;
  href?: string;
  styles?: Record<string, boolean>;
  content?: BlockNoteInlineContent[];
  [key: string]: unknown;
}

interface NotionTableRow {
  table_row?: {
    cells?: NotionRichText[][];
  };
}

interface NotionBlockContent {
  rich_text?: NotionRichText[];
  language?: string;
  caption?: NotionRichText[];
  icon?: unknown;
  file?: { url: string };
  external?: { url: string };
  table_width?: number;
  [key: string]: unknown;
}

interface NotionBlock {
  id: string;
  type: string;
  children?: NotionTableRow[];
  table?: { table_width?: number };
  paragraph?: NotionBlockContent;
  heading_1?: NotionBlockContent;
  heading_2?: NotionBlockContent;
  heading_3?: NotionBlockContent;
  bulleted_list_item?: NotionBlockContent;
  numbered_list_item?: NotionBlockContent;
  to_do?: NotionBlockContent & { checked?: boolean };
  quote?: NotionBlockContent;
  code?: NotionBlockContent & { language?: string };
  callout?: NotionBlockContent & { icon?: { emoji?: string } };
  image?: NotionBlockContent;
  [key: string]: unknown;
}

// Convert Notion rich text to BlockNote inline content
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BlockNote's inline content types are complex, using any for flexibility
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BlockNote content types are complex
function convertInlineContentToNotionRichText(
  content: any[] | undefined
): NotionRichText[] {
  if (!content || content.length === 0) {
    return [];
  }

  const result: NotionRichText[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BlockNote content structure varies
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- BlockNote link content
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
        const imageBlock = block.image;
        const imageUrl =
          imageBlock?.file?.url || imageBlock?.external?.url || '';
        if (imageUrl) {
          blocks.push({
            type: 'image',
            props: {
              url: imageUrl,
              caption: imageBlock?.caption?.[0]?.plain_text || '',
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
              rows: block.children.map((row: NotionTableRow) => ({
                cells:
                  row.table_row?.cells?.map((cell: NotionRichText[]) =>
                    convertNotionRichTextToInlineContent(cell)
                  ) || [],
              })),
            },
          };
          blocks.push(tableContent as PartialBlock);
        }
        break;

      default:
        // For unsupported blocks, try to extract text content
        flushList();
        const blockContent = block[type] as NotionBlockContent | undefined;
        if (blockContent?.rich_text) {
          blocks.push({
            type: 'paragraph',
            content: convertNotionRichTextToInlineContent(
              blockContent.rich_text
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
            rich_text: convertInlineContentToNotionRichText(block.content),
          },
        });
        break;

      case 'heading':
        const level = block.props?.level || 1;
        const headingType = `heading_${level}` as
          | 'heading_1'
          | 'heading_2'
          | 'heading_3';
        notionBlocks.push({
          id,
          type: headingType,
          [headingType]: {
            rich_text: convertInlineContentToNotionRichText(block.content),
          },
        });
        break;

      case 'bulletListItem':
        notionBlocks.push({
          id,
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: convertInlineContentToNotionRichText(block.content),
          },
        });
        break;

      case 'numberedListItem':
        notionBlocks.push({
          id,
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: convertInlineContentToNotionRichText(block.content),
          },
        });
        break;

      case 'checkListItem':
        notionBlocks.push({
          id,
          type: 'to_do',
          to_do: {
            rich_text: convertInlineContentToNotionRichText(block.content),
            checked: block.props?.checked || false,
          },
        });
        break;

      case 'codeBlock':
        notionBlocks.push({
          id,
          type: 'code',
          code: {
            rich_text: convertInlineContentToNotionRichText(block.content),
            language: block.props?.language || 'plain text',
          },
        });
        break;

      case 'image':
        const url = block.props?.url;
        if (url) {
          notionBlocks.push({
            id,
            type: 'image',
            image: {
              type: 'external',
              external: { url },
              caption: block.props?.caption
                ? [
                    {
                      type: 'text',
                      text: { content: block.props.caption },
                      plain_text: block.props.caption,
                    },
                  ]
                : [],
            },
          });
        }
        break;

      case 'table':
        // Handle table conversion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tableContent = block.content;
        if (tableContent?.rows) {
          notionBlocks.push({
            id,
            type: 'table',
            table: {
              table_width: tableContent.rows[0]?.cells?.length || 1,
            } as {
              table_width: number;
              has_column_header: boolean;
              has_row_header: boolean;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            children: tableContent.rows.map((row) => ({
              type: 'table_row',
              table_row: {
                cells:
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
                  row.cells?.map((cell: unknown) =>
                    convertInlineContentToNotionRichText(cell as any[])
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
              rich_text: convertInlineContentToNotionRichText(block.content),
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
    const blockContent = block[type] as NotionBlockContent | undefined;
    const richText = blockContent?.rich_text;

    if (richText) {
      textParts.push(
        richText.map((t: NotionRichText) => t.plain_text).join('')
      );
    }
  }

  return textParts.join('\n');
}
