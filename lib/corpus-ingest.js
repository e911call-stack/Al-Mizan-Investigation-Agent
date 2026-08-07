import { callAgentTool } from './llm';

const SPLIT_TOOL = {
  name: 'split_law_into_articles',
  description: 'Split raw law text into clean, individual articles, removing anything that is not the actual statutory text.',
  input_schema: {
    type: 'object',
    properties: {
      articles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            articleNumber: { type: 'string', description: 'The article number as it appears in the source, e.g. "4" or "85 مكررة".' },
            chapter: { type: 'string', description: 'The chapter/part heading this article falls under, if stated nearby in the source. Empty string if none.' },
            textAr: { type: 'string', description: 'The clean statutory text of this article only — no chapter summaries, no website commentary, no watermark text.' },
            extractionFlag: { type: 'string', description: 'Note any corrupted characters, ambiguous line breaks, or suspected transcription errors found in the source for this article. Empty string if none.' }
          },
          required: ['articleNumber', 'textAr', 'extractionFlag']
        }
      },
      strippedCommentaryCount: { type: 'integer', description: 'How many non-statutory commentary/summary blocks were found and excluded.' }
    },
    required: ['articles', 'strippedCommentaryCount']
  }
};

const SYSTEM_PROMPT = `You split raw legal text (often copied from a website republication of a law) into individual, clean articles for a legal corpus.

Critical rules:
- Include ONLY the actual statutory text of each article. Many source documents interleave editorial commentary — summary paragraphs explaining what a chapter "aims to do", written in a promotional or explanatory style distinct from statutory language (e.g. starting with phrases like "يهدف هذا الفصل إلى..."). These are NOT part of the law. Exclude them entirely and count them in strippedCommentaryCount.
- Also exclude watermarks, "By [website name]", "Last updated" bylines, and any other website chrome that isn't statutory text.
- Preserve the actual article text exactly as written, including sub-paragraphs (أ, ب, ج...) and numbered sub-items.
- If you see a character that looks corrupted or a sentence that reads as scrambled/reordered in a way inconsistent with normal legal Arabic, do your best to reconstruct the evident intended reading, but ALWAYS note this in extractionFlag for that article — never silently "fix" text without flagging it.
- Do not invent, summarize, or paraphrase article text. Reproduce it as given, minus the commentary noise.
- Always respond by calling the split_law_into_articles tool.`;

export async function splitLawIntoArticles(rawText) {
  const result = await callAgentTool({
    system: SYSTEM_PROMPT,
    userContent: rawText,
    tool: SPLIT_TOOL,
    maxTokens: 8000
  });
  return result;
}
