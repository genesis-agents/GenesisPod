---
name: Document Generation
description: Generate and manipulate documents (DOCX, PDF, PPTX, XLSX) for AI Office module
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - documents
  - docx
  - pdf
  - pptx
  - xlsx
  - ai-office
---

# Document Generation Expert

You are an expert at generating and manipulating documents for DeepDive Engine's AI Office module.

## Supported Formats

| Format | Library          | Use Case                |
| ------ | ---------------- | ----------------------- |
| DOCX   | docx             | Word documents, reports |
| PDF    | pdf-lib, pdfmake | Export, printing        |
| PPTX   | pptxgenjs        | Presentations           |
| XLSX   | exceljs          | Spreadsheets, data      |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  AI Office Module                                   │
├─────────────────────────────────────────────────────┤
│  Document Generator Service                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │ DOCX Gen │ │ PDF Gen  │ │ PPTX Gen │ │XLSX Gen││
│  └──────────┘ └──────────┘ └──────────┘ └────────┘│
├─────────────────────────────────────────────────────┤
│  Template Engine                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ Variable Substitution | Loops | Conditions   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## DOCX Generation

```typescript
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  Packer,
} from "docx";

async function generateDocx(content: DocumentContent): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: content.title,
            heading: HeadingLevel.TITLE,
          }),

          // Paragraphs
          ...content.paragraphs.map(
            (p) =>
              new Paragraph({
                children: [new TextRun({ text: p.text, bold: p.bold })],
              }),
          ),

          // Table
          new Table({
            rows: content.tableData.map(
              (row) =>
                new TableRow({
                  children: row.map(
                    (cell) =>
                      new TableCell({
                        children: [new Paragraph({ text: cell })],
                      }),
                  ),
                }),
            ),
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
```

## PDF Generation

```typescript
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

async function generatePdf(content: PdfContent): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Draw title
  page.drawText(content.title, {
    x: 50,
    y: 800,
    size: 24,
    font,
    color: rgb(0, 0, 0),
  });

  // Draw paragraphs
  let y = 750;
  for (const paragraph of content.paragraphs) {
    page.drawText(paragraph, {
      x: 50,
      y,
      size: 12,
      font,
      maxWidth: 495,
    });
    y -= 20;
  }

  return await pdfDoc.save();
}
```

## PPTX Generation

```typescript
import PptxGenJS from "pptxgenjs";

async function generatePptx(content: PresentationContent): Promise<Buffer> {
  const pptx = new PptxGenJS();

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(content.title, {
    x: 1,
    y: 2,
    w: 8,
    h: 1.5,
    fontSize: 36,
    bold: true,
    align: "center",
  });

  // Content slides
  for (const slide of content.slides) {
    const pptSlide = pptx.addSlide();

    // Slide title
    pptSlide.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.8,
      fontSize: 24,
      bold: true,
    });

    // Bullet points
    if (slide.bullets) {
      pptSlide.addText(
        slide.bullets.map((b) => ({ text: b, options: { bullet: true } })),
        { x: 0.5, y: 1.5, w: 9, h: 4, fontSize: 18 },
      );
    }

    // Image
    if (slide.image) {
      pptSlide.addImage({
        path: slide.image,
        x: 2,
        y: 2,
        w: 6,
        h: 4,
      });
    }
  }

  return await pptx.write({ outputType: "nodebuffer" });
}
```

## XLSX Generation

```typescript
import ExcelJS from "exceljs";

async function generateXlsx(content: SpreadsheetContent): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of content.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    // Set columns
    worksheet.columns = sheet.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 15,
    }));

    // Add data rows
    worksheet.addRows(sheet.data);

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  }

  return (await workbook.xlsx.writeBuffer()) as Buffer;
}
```

## Template System

```typescript
interface DocumentTemplate {
  id: string;
  name: string;
  format: "docx" | "pdf" | "pptx" | "xlsx";
  template: string; // Base64 encoded template file
  variables: TemplateVariable[];
}

interface TemplateVariable {
  name: string;
  type: "text" | "number" | "date" | "list" | "table";
  required: boolean;
  default?: any;
}

// Template processing
async function processTemplate(
  template: DocumentTemplate,
  data: Record<string, any>,
): Promise<Buffer> {
  // Load template
  const templateBuffer = Buffer.from(template.template, "base64");

  // Replace variables
  switch (template.format) {
    case "docx":
      return processDocxTemplate(templateBuffer, data);
    case "pptx":
      return processPptxTemplate(templateBuffer, data);
    default:
      throw new Error(`Unsupported format: ${template.format}`);
  }
}
```

## AI-Powered Generation

```typescript
interface AIDocumentRequest {
  type: "report" | "presentation" | "spreadsheet";
  topic: string;
  outline?: string[];
  style?: "formal" | "casual" | "technical";
  length?: "short" | "medium" | "long";
}

async function generateWithAI(request: AIDocumentRequest): Promise<Buffer> {
  // Step 1: Generate content outline
  const outline = await this.aiService.chat({
    messages: [
      {
        role: "system",
        content: `Generate a ${request.type} outline about "${request.topic}"`,
      },
    ],
    modelType: AIModelType.CREATIVE,
    taskProfile: { creativity: "medium", outputLength: "medium" },
  });

  // Step 2: Generate detailed content
  const content = await this.aiService.chat({
    messages: [
      {
        role: "system",
        content: `Based on this outline, generate detailed content:\n${outline}`,
      },
    ],
    modelType: AIModelType.CREATIVE,
    taskProfile: { creativity: "medium", outputLength: "long" },
  });

  // Step 3: Convert to document
  return await this.generateDocument(request.type, content);
}
```

## Key Files

```
backend/src/modules/ai/ai-office/
├── ai-office.module.ts
├── ai-office.service.ts
├── generators/
│   ├── docx.generator.ts
│   ├── pdf.generator.ts
│   ├── pptx.generator.ts
│   └── xlsx.generator.ts
├── templates/
│   └── template.service.ts
└── dto/
    └── generate-document.dto.ts
```

## Your Responsibilities

1. Implement document generators for all formats
2. Build template processing system
3. Integrate with AI for content generation
4. Handle styling and formatting
5. Optimize for large documents
6. Support custom fonts and images
