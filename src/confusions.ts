import { KANA, KANA_BY_ID } from './kana';
import type { KanaEntry, Language, Question } from './types';

interface ConfusionPair {
  glyphs: [string, string];
  hint: Record<Language, string>;
}
const BASIC: ConfusionPair[] = [
  {
    glyphs: ['シ', 'ツ'],
    hint: {
      'zh-CN': 'シ 的短笔较偏竖向排列；ツ 的短笔较偏横向排列。对照两个字的起笔位置。',
      en: 'In シ the short strokes stack more vertically; in ツ they sit more horizontally. Compare their starting points.',
    },
  },
  {
    glyphs: ['ソ', 'ン'],
    hint: {
      'zh-CN': '对照短笔与长笔的起笔位置：ソ 较靠上，ン 较靠左。',
      en: 'Compare where the strokes begin: ソ starts nearer the top, ン nearer the left.',
    },
  },
  {
    glyphs: ['ぬ', 'め'],
    hint: {
      'zh-CN': 'ぬ 的右下有小圈，め 没有这个小圈。',
      en: 'ぬ has a small loop at the lower right; め does not.',
    },
  },
  {
    glyphs: ['れ', 'ね'],
    hint: {
      'zh-CN': 'ね 的右侧收笔带圈；れ 的右侧收笔不带圈。',
      en: 'ね ends in a loop on the right; れ does not.',
    },
  },
  {
    glyphs: ['は', 'ほ'],
    hint: {
      'zh-CN': 'ほ 的右侧比 は 多一横。',
      en: 'ほ has an extra horizontal stroke on the right compared with は.',
    },
  },
  {
    glyphs: ['さ', 'き'],
    hint: {
      'zh-CN': 'き 的上部比 さ 多一横。',
      en: 'き has one more horizontal stroke at the top than さ.',
    },
  },
  {
    glyphs: ['ル', 'レ'],
    hint: {
      'zh-CN': 'ル 有分开的左右两部分；レ 是一笔相连的字形。',
      en: 'ル has separate left and right parts; レ is a connected stroke.',
    },
  },
  {
    glyphs: ['ク', 'ケ'],
    hint: {
      'zh-CN': 'ケ 的上部有横笔，ク 的上部更像一个角。',
      en: 'ケ has a horizontal stroke across the top; ク begins with a corner shape.',
    },
  },
  {
    glyphs: ['ろ', 'る'],
    hint: {
      'zh-CN': 'る 的收笔有小圈，ろ 没有。',
      en: 'る ends with a small loop; ろ does not.',
    },
  },
  {
    glyphs: ['わ', 'れ'],
    hint: {
      'zh-CN': 'わ 的右侧是弯曲的围合部分，れ 的右侧向外舒展。',
      en: 'わ curves around on the right; れ extends outward.',
    },
  },
  {
    glyphs: ['わ', 'ね'],
    hint: {
      'zh-CN': 'ね 的右下收笔带小圈，わ 没有这个小圈。',
      en: 'ね ends with a small loop at the lower right; わ does not.',
    },
  },
];
export const CONFUSION_PAIRS: readonly ConfusionPair[] = BASIC;
export function relatedGlyphs(entry: KanaEntry): string[] {
  return CONFUSION_PAIRS.flatMap((pair) =>
    pair.glyphs.includes(entry.glyph) ? pair.glyphs.filter((glyph) => glyph !== entry.glyph) : [],
  );
}
export function getConfusionFeedback(
  question: Question,
  choice: string | null,
  language: Language,
): { target: KanaEntry; mistaken: KanaEntry | null; hint: string } | null {
  const target = KANA_BY_ID[question.kanaId];
  if (!target || choice === null || choice === question.correctAnswer) return null;
  const matches = KANA.filter(
    (entry) =>
      entry.script === target.script &&
      (question.direction === 'romaji-kana' ? entry.glyph === choice : entry.romaji === choice),
  );
  const mistaken = matches.length === 1 ? matches[0] : null;
  const pair = mistaken
    ? CONFUSION_PAIRS.find(
        (item) => item.glyphs.includes(target.glyph) && item.glyphs.includes(mistaken.glyph),
      )
    : undefined;
  let hint = pair?.hint[language];
  if (mistaken?.baseGlyph === target.baseGlyph) {
    hint =
      language === 'zh-CN'
        ? '基础字形相同：注意清音、浊点「゛」和半浊点「゜」的区别。'
        : 'The base shape is the same. Check for no mark, dakuten ゛ or handakuten ゜.';
  } else if (
    mistaken &&
    target.structure === 'yoon' &&
    mistaken.structure === 'yoon' &&
    target.series === mistaken.series
  ) {
    hint =
      language === 'zh-CN'
        ? '前面的假名相同，注意小写的 ゃ／ゅ／ょ。'
        : 'The initial kana is the same. Compare the small ゃ / ゅ / ょ.';
  } else if (
    mistaken &&
    target.structure === 'yoon' &&
    mistaken.structure === 'yoon' &&
    target.vowel === mistaken.vowel
  ) {
    hint =
      language === 'zh-CN'
        ? '后面的小写假名相同，注意前面的假名及辅音区别。'
        : 'The small kana is the same. Compare the initial kana and consonant.';
  } else if (mistaken && target.series === mistaken.series && !hint) {
    hint =
      language === 'zh-CN'
        ? '属于同一读音系列，注意不同元音及对应字形。'
        : 'These belong to the same reading series. Compare the vowels and shapes.';
  }
  return {
    target,
    mistaken,
    hint:
      hint ??
      (language === 'zh-CN'
        ? '对照字形和读音，再认读一次。'
        : 'Compare the shapes and readings, then try again.'),
  };
}
