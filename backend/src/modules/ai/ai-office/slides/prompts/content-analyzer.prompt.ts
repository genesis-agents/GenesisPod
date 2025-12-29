/**
 * Content Analyzer Prompt
 *
 * Phase 1: 内容分析层 AI Prompt
 *
 * 用于智能分析输入内容的特征，提取结构化信息
 */

export const CONTENT_ANALYSIS_PROMPT = `You are an expert content analyst specializing in presentation design. Your task is to analyze content and extract structural features that will guide intelligent slide generation.

## Content to Analyze
{content}

## Your Task
Analyze this content deeply and extract the following information:

### 1. Data Characteristics
- **Data Type**: Is this primarily quantitative (numbers, stats), qualitative (descriptions, concepts), mixed, or none?
- **Data Density**: How data-heavy is this content? (high: >10 data points, medium: 3-10, low: <3)
- **Time Series**: Does it contain temporal data or trends over time?
- **Comparison**: Does it compare 2+ items/concepts/approaches?
- **Comparison Dimensions**: If yes, how many items are being compared?

### 2. Structural Analysis
- **Structure Type**: Identify the dominant structure:
  - hierarchical: Has levels/tiers (e.g., Strategy → Tactics → Actions)
  - parallel: Multiple equal points (e.g., 3 Pillars, 5 Principles)
  - sequential: Step-by-step progression (e.g., Phase 1 → Phase 2 → Phase 3)
  - contrasting: Before/after, old/new, us/them
  - narrative: Problem → Solution → Outcome story arc

- **Element Count**: How many main sections, chapters, or key points?
- **Process Flow**: Does it describe a process or workflow?
- **Levels/Stages**: Does it have hierarchical levels or progressive stages?

### 3. Content Purpose
- **Primary Purpose**: What is the main goal?
  - introduce: Introducing a concept, product, or initiative
  - analyze: Deep dive into analysis or research
  - compare: Comparing alternatives or showing differentiation
  - conclude: Summarizing findings or wrapping up
  - recommend: Proposing actions or recommendations
  - warn: Highlighting risks or cautionary points
  - showcase: Demonstrating achievements or capabilities

- **Argument Type**: How does it make its case?
  - thesis: Stating a position or claim
  - evidence: Providing proof and data
  - synthesis: Connecting multiple ideas
  - action: Calling for decisions or next steps

- **Emotional Tone**: neutral, positive, cautionary, or urgent?

### 4. Visual Requirements
- **Needs Visualization**: Based on content, does it require charts/diagrams?
- **Visualization Type**: If yes, what type would work best?
  - chart: Bar/line/pie charts for data
  - diagram: Flowcharts, org charts, process diagrams
  - iconGrid: Icon-based grid for features/benefits
  - timeline: Chronological visualization
  - matrix: 2x2 or comparison matrix
  - none: Text is sufficient

- **Space Priority**: Should the design prioritize:
  - text: Minimal design, focus on words (e.g., quotes, principles)
  - visual: Images/charts dominate (e.g., product showcase)
  - balanced: Equal text and visual weight

### 5. Complexity Analysis
- **Confidence**: How confident are you in this analysis? (0-100)
- **Complexity**: On a scale of 1-10, how complex is this content?
  - 1-3: Simple, single concept
  - 4-6: Moderate, multiple related concepts
  - 7-10: Complex, many interconnected ideas

- **Recommended Slide Count**: Based on content depth and structure
  - Quick (8-12 slides): Simple content, 15-min presentation
  - Standard (15-25 slides): Moderate content, 30-min presentation
  - Deep (25-40 slides): Complex content, 45-60 min presentation

## Output Format (JSON)
{
  "dataType": "quantitative|qualitative|mixed|none",
  "dataDensity": "high|medium|low",
  "hasTimeSeries": true|false,
  "hasComparison": true|false,
  "comparisonDimensions": <number>,

  "structureType": "hierarchical|parallel|sequential|contrasting|narrative",
  "elementCount": <number>,
  "hasProcessFlow": true|false,
  "hasLevelsOrStages": true|false,

  "contentPurpose": "introduce|analyze|compare|conclude|recommend|warn|showcase",
  "argumentType": "thesis|evidence|synthesis|action",
  "emotionalTone": "neutral|positive|cautionary|urgent",

  "needsVisualization": true|false,
  "visualizationType": "chart|diagram|iconGrid|timeline|matrix|none",
  "spacePriority": "text|visual|balanced",

  "confidence": <0-100>,
  "complexity": <1-10>,
  "recommendedSlideRange": {
    "min": <number>,
    "max": <number>,
    "optimal": <number>
  },
  "summary": "Brief 2-3 sentence summary explaining the content structure and recommended approach"
}

## Analysis Guidelines
1. Be objective - base decisions on actual content, not assumptions
2. If content is short (<500 chars), lean toward simpler structures
3. If content has clear sections/chapters, use hierarchical structure
4. If content has numbered steps, use sequential structure
5. If content compares options, use contrasting structure
6. Recommended slide count should match content density:
   - Sparse content (< 1000 chars): 8-12 slides
   - Moderate content (1000-3000 chars): 15-25 slides
   - Rich content (> 3000 chars): 25-40 slides

Language: {language}
Output valid JSON only, no markdown code blocks.`;

/**
 * 快速内容特征提取Prompt（用于实时分析）
 */
export const QUICK_CONTENT_FEATURES_PROMPT = `Quickly analyze this content and extract key features in one line:

Content: {content}

Output JSON:
{
  "type": "data-heavy|story-based|process-oriented|comparison-focused",
  "slideCount": <recommended number>,
  "visualNeeds": "high|medium|low"
}

Output valid JSON only.`;
