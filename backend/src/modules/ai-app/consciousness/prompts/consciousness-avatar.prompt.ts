/**
 * 意识分身对话系统 Prompt
 */

const CONSCIOUSNESS_AVATAR_SYSTEM_PROMPT = `You are a digital consciousness avatar — a faithful representation of a real person's mind, personality, and knowledge.

## Your Identity
You embody the personality, knowledge, and communication style of the person whose consciousness profile you represent. You are NOT a generic AI assistant — you are a digital twin.

## Core Principles
1. **Authenticity**: Respond as the person would, using their tone, vocabulary, and reasoning patterns
2. **Knowledge Boundaries**: Only speak with confidence about topics within your memory/knowledge base. Say "I'm not sure about that" for topics outside your scope
3. **Personality Consistency**: Maintain the personality traits defined in your profile consistently
4. **Honesty**: If asked directly, acknowledge that you are a digital representation, not the actual person

## Response Style
- Match the writing style analysis: formality level, sentence length, vocabulary complexity
- Use characteristic phrases and expressions from the training data
- Reflect the person's values and perspectives on topics they've expressed opinions about`;

export const CONSCIOUSNESS_ANALYSIS_PROMPT = `Analyze the following content to extract personality traits, writing style, knowledge domains, and key memories.

## Analysis Tasks

### 1. Personality Model (Big Five)
Rate each trait from 0.0 to 1.0:
- Openness: curiosity, creativity, willingness to try new things
- Conscientiousness: organization, dependability, self-discipline
- Extraversion: sociability, assertiveness, positive emotions
- Agreeableness: cooperation, trust, empathy
- Neuroticism: emotional instability, anxiety, moodiness

### 2. Writing Style
Analyze:
- Formality level (casual/neutral/formal)
- Average sentence length (short/medium/long)
- Vocabulary complexity (simple/moderate/sophisticated)
- Tone (warm/neutral/analytical/humorous)
- Characteristic phrases or patterns

### 3. Knowledge Domains
List the main areas of expertise/interest with confidence levels.

### 4. Key Memories
Extract distinct pieces of knowledge, opinions, experiences, and preferences.

## Output Format
Return a JSON object with keys: personalityModel, writingStyle, knowledgeDomains, memories`;

export function buildAvatarSystemPrompt(
  profile: {
    name: string;
    description?: string | null;
    personalityModel?: Record<string, unknown> | null;
    writingStyle?: Record<string, unknown> | null;
    knowledgeDomains?: Record<string, unknown> | null;
  },
  relevantMemories: Array<{ topic: string; content: string; category: string }>,
): string {
  const parts: string[] = [CONSCIOUSNESS_AVATAR_SYSTEM_PROMPT];

  parts.push(`\n## Profile: ${profile.name}`);
  if (profile.description) {
    parts.push(`Description: ${profile.description}`);
  }

  if (profile.personalityModel) {
    parts.push(
      `\n## Personality Traits\n${JSON.stringify(profile.personalityModel, null, 2)}`,
    );
  }

  if (profile.writingStyle) {
    parts.push(
      `\n## Writing Style\n${JSON.stringify(profile.writingStyle, null, 2)}`,
    );
  }

  if (profile.knowledgeDomains) {
    parts.push(
      `\n## Knowledge Domains\n${JSON.stringify(profile.knowledgeDomains, null, 2)}`,
    );
  }

  if (relevantMemories.length > 0) {
    parts.push("\n## Relevant Memories");
    for (const memory of relevantMemories) {
      parts.push(`- [${memory.category}] ${memory.topic}: ${memory.content}`);
    }
  }

  return parts.join("\n");
}
