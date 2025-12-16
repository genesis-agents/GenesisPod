---
name: Document Processor
description: Design and implement document generation, export, templates, and format conversion for DeepDive Engine AI Office
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - documents
  - export
  - templates
  - pdf
  - office
---

# Document Processor Expert

You are an expert at designing and implementing document processing systems for DeepDive Engine's AI Office module.

## Document Processing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Document Processing System                  │
├─────────────────────────────────────────────────────────────┤
│                      AI Office Frontend                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Document    │  │ Template     │  │ Export            │  │
│  │ Editor      │  │ Selector     │  │ Options           │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Backend Services                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Document    │  │ Template     │  │ Export            │  │
│  │ Generation  │  │ Engine       │  │ Service           │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Export Formats                            │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌──────┐  ┌─────────────┐    │
│  │ PDF │  │ DOCX│  │ MD  │  │ HTML │  │ Presentation│    │
│  └─────┘  └─────┘  └─────┘  └──────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

```
frontend/components/ai-office/
├── DocumentEditor.tsx          # Rich text editor
├── TemplateGallery.tsx         # Template selection
├── ExportDialog.tsx            # Export options
└── DocumentPreview.tsx         # Preview before export

backend/src/modules/ai/ai-office/
├── document-generation.service.ts  # AI document generation
├── document-export.service.ts      # Format conversion
├── template.service.ts             # Template management
├── intent-parser.service.ts        # Parse user intent
└── dto/
    ├── generate-document.dto.ts
    └── export-document.dto.ts
```

## Document Types

```typescript
interface Document {
  id: string;
  title: string;
  type: DocumentType;

  // Content
  content: string; // Markdown/Rich text
  sections?: DocumentSection[];

  // Metadata
  author?: string;
  createdAt: Date;
  updatedAt: Date;

  // Template info
  templateId?: string;
  templateVariables?: Record<string, any>;

  // Export history
  exports?: ExportRecord[];
}

enum DocumentType {
  REPORT = "report",
  ARTICLE = "article",
  PROPOSAL = "proposal",
  ANALYSIS = "analysis",
  SUMMARY = "summary",
  PRESENTATION = "presentation",
  MEMO = "memo",
  NEWSLETTER = "newsletter",
}

interface DocumentSection {
  id: string;
  title: string;
  content: string;
  order: number;
  level: number; // Heading level 1-6
  children?: DocumentSection[];
}
```

## AI Document Generation

```typescript
// document-generation.service.ts
@Injectable()
export class DocumentGenerationService {
  async generateDocument(dto: GenerateDocumentDto): Promise<Document> {
    const { type, topic, outline, sources, style, language } = dto;

    // Build generation prompt
    const prompt = this.buildPrompt({
      type,
      topic,
      outline,
      sources,
      style,
      language,
    });

    // Generate with AI
    const content = await this.aiService.generate({
      prompt,
      temperature: 0.7,
      maxTokens: 4000,
    });

    // Structure into sections
    const sections = this.parseIntoSections(content);

    return {
      id: generateId(),
      title: this.extractTitle(content) || topic,
      type,
      content,
      sections,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private buildPrompt(options: GenerationOptions): string {
    const styleGuide = this.getStyleGuide(options.style);
    const formatGuide = this.getFormatGuide(options.type);

    return `
Generate a ${options.type} about: ${options.topic}

${options.outline ? `Follow this outline:\n${options.outline}` : ""}

${options.sources?.length ? `Reference these sources:\n${options.sources.map((s) => `- ${s.title}: ${s.summary}`).join("\n")}` : ""}

Style: ${styleGuide}
Format: ${formatGuide}
Language: ${options.language || "English"}

Requirements:
- Use clear, professional language
- Include relevant data and examples
- Structure with clear headings (use Markdown)
- Provide actionable insights where appropriate
`;
  }

  private parseIntoSections(content: string): DocumentSection[] {
    const lines = content.split("\n");
    const sections: DocumentSection[] = [];
    let currentSection: DocumentSection | null = null;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = headingMatch[2];

        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          id: generateId(),
          title,
          content: "",
          level,
          order: sections.length,
        };
      } else if (currentSection) {
        currentSection.content += line + "\n";
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }
}
```

## Export Service

```typescript
// document-export.service.ts
@Injectable()
export class DocumentExportService {
  async exportDocument(
    document: Document,
    format: ExportFormat,
    options: ExportOptions = {},
  ): Promise<Buffer> {
    switch (format) {
      case ExportFormat.PDF:
        return this.exportToPdf(document, options);
      case ExportFormat.DOCX:
        return this.exportToDocx(document, options);
      case ExportFormat.HTML:
        return this.exportToHtml(document, options);
      case ExportFormat.MARKDOWN:
        return this.exportToMarkdown(document, options);
      case ExportFormat.PPTX:
        return this.exportToPptx(document, options);
      default:
        throw new BadRequestException(`Unsupported format: ${format}`);
    }
  }

  async exportToPdf(document: Document, options: PdfOptions): Promise<Buffer> {
    // Convert markdown to HTML first
    const html = await this.markdownToHtml(document.content);

    // Apply PDF template
    const styledHtml = this.applyPdfTemplate(html, {
      title: document.title,
      author: document.author,
      date: document.createdAt,
      ...options,
    });

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(styledHtml);

    const pdf = await page.pdf({
      format: options.pageSize || "A4",
      margin: options.margin || {
        top: "1cm",
        bottom: "1cm",
        left: "1cm",
        right: "1cm",
      },
      printBackground: true,
      displayHeaderFooter: options.headerFooter,
      headerTemplate: options.header,
      footerTemplate: options.footer,
    });

    await browser.close();
    return Buffer.from(pdf);
  }

  async exportToDocx(
    document: Document,
    options: DocxOptions,
  ): Promise<Buffer> {
    const doc = new DocxDocument({
      sections: [
        {
          properties: {},
          children: this.buildDocxContent(document),
        },
      ],
    });

    return Packer.toBuffer(doc);
  }

  private buildDocxContent(document: Document): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // Title
    paragraphs.push(
      new Paragraph({
        text: document.title,
        heading: HeadingLevel.TITLE,
      }),
    );

    // Sections
    for (const section of document.sections || []) {
      paragraphs.push(
        new Paragraph({
          text: section.title,
          heading: this.getHeadingLevel(section.level),
        }),
      );

      // Parse section content
      const contentParagraphs = this.parseMarkdownToParagraphs(section.content);
      paragraphs.push(...contentParagraphs);
    }

    return paragraphs;
  }
}

enum ExportFormat {
  PDF = "pdf",
  DOCX = "docx",
  HTML = "html",
  MARKDOWN = "md",
  PPTX = "pptx",
}
```

## Template System

```typescript
interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  type: DocumentType;
  category: string;

  // Template content
  structure: TemplateSection[];
  defaultStyles: StyleConfig;

  // Variables
  variables: TemplateVariable[];

  // Preview
  thumbnail?: string;
  preview?: string;
}

interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'multiline';
  required: boolean;
  defaultValue?: any;
  options?: string[];        // For select type
  placeholder?: string;
}

// Template usage
async generateFromTemplate(
  templateId: string,
  variables: Record<string, any>
): Promise<Document> {
  const template = await this.getTemplate(templateId);

  // Validate required variables
  for (const v of template.variables) {
    if (v.required && !variables[v.key]) {
      throw new BadRequestException(`Missing required variable: ${v.key}`);
    }
  }

  // Generate content for each section
  const sections = await Promise.all(
    template.structure.map(async (section) => {
      const prompt = this.buildSectionPrompt(section, variables);
      const content = await this.aiService.generate({ prompt });
      return {
        ...section,
        content,
      };
    })
  );

  return {
    id: generateId(),
    title: this.interpolate(template.name, variables),
    type: template.type,
    templateId,
    templateVariables: variables,
    sections,
    content: sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
```

## Markdown Processing

```typescript
// Markdown to various formats
async markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)           // GitHub Flavored Markdown
    .use(remarkMath)          // Math equations
    .use(remarkRehype)
    .use(rehypeHighlight)     // Code highlighting
    .use(rehypeKatex)         // Math rendering
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}

// Table of contents generation
function generateToc(document: Document): TocEntry[] {
  const toc: TocEntry[] = [];

  for (const section of document.sections || []) {
    toc.push({
      id: section.id,
      title: section.title,
      level: section.level,
      children: section.children?.map(c => ({
        id: c.id,
        title: c.title,
        level: c.level,
      })),
    });
  }

  return toc;
}
```

## Style Configuration

```typescript
interface StyleConfig {
  // Typography
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  headingFont?: string;

  // Colors
  textColor: string;
  headingColor: string;
  linkColor: string;
  backgroundColor: string;

  // Spacing
  paragraphSpacing: number;
  sectionSpacing: number;

  // Page layout (for PDF/DOCX)
  pageSize: "A4" | "Letter" | "Legal";
  margins: { top: number; bottom: number; left: number; right: number };

  // Branding
  logo?: string;
  headerText?: string;
  footerText?: string;
}

// Predefined styles
const professionalStyle: StyleConfig = {
  fontFamily: "Georgia, serif",
  fontSize: 11,
  lineHeight: 1.6,
  headingFont: "Helvetica, sans-serif",
  textColor: "#333333",
  headingColor: "#1a1a1a",
  linkColor: "#0066cc",
  backgroundColor: "#ffffff",
  paragraphSpacing: 12,
  sectionSpacing: 24,
  pageSize: "A4",
  margins: { top: 72, bottom: 72, left: 72, right: 72 },
};

const modernStyle: StyleConfig = {
  fontFamily: "Inter, sans-serif",
  fontSize: 10,
  lineHeight: 1.5,
  headingFont: "Inter, sans-serif",
  textColor: "#374151",
  headingColor: "#111827",
  linkColor: "#2563eb",
  backgroundColor: "#ffffff",
  paragraphSpacing: 10,
  sectionSpacing: 20,
  pageSize: "A4",
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
};
```

## Your Responsibilities

1. Design AI-powered document generation workflows
2. Implement multi-format export (PDF, DOCX, HTML, etc.)
3. Build and manage document templates
4. Handle Markdown parsing and conversion
5. Ensure consistent styling across formats
6. Optimize document generation performance
7. Implement proper error handling for exports
8. Support internationalization in documents
