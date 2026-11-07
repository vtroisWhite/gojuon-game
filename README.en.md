# Kana Learning

[Play](https://vtroisWhite.github.io/gojuon-game/) · [简体中文](README.md)

A responsive hiragana and katakana practice game. Choose your range, learn at your pace, and keep progress in your browser.

## Features and controls

- Learn by row: meet 3–5 kana with learning cards, then practice. Previously viewed units can be included.
- Free practice: combine six categories, filter rows, select either direction or a balanced mix, and choose 10/20/40/all questions. Kana do not repeat within a session.
- Due review: schedule each kana and direction separately, prioritizing correction and overdue items.
- Confusable kana: practice similar shapes and personal wrong-choice pairs, with explanations after answering.
- Three numbered choices plus “I do not know.” Optionally think before revealing choices. Correct answers support manual, standard or fast continuation; mistakes wait for confirmation.
- Learning, review and contrast sessions allow at most one spaced reinforcement per missed item. Items without enough spacing wait for later practice.
- No countdown; backgrounding pauses automatically. Simplified Chinese and English are supported.

| Action | Keyboard shortcut |
| --- | --- |
| Choose an answer | `1`, `2`, `3` (including numpad) |
| I do not know | `0` (including numpad) |
| Pause / resume | `Space` |
| Continue manually | `Enter` |

Each script contains 46 basic, 25 voiced/semi-voiced and 33 contracted entries: 208 in total. Contracted entries include voiced and semi-voiced forms.

## Learning records

Main accuracy, streaks and recent performance use first attempts. Reinforcement reports corrections separately. Cards are unscored. “I do not know” counts as an unsuccessful answer without creating a confusion pair.

Each kana and direction tracks performance, the latest 20 first answers, wrong-choice pairs, all-answer average time and correct first-answer average time in milliseconds, including sample counts. Timing excludes pauses, background time and feedback. Speed trends compare matching practice conditions.

Review intervals grow with performance, starting at 1/3/7/14/30 days. Same-day repeats and corrections after seeing an answer do not advance spaced-review stages. The kana chart shows coverage, familiarity and due status.

The latest 100 session summaries are retained without reducing cumulative totals. Reloading preserves question order, choices and feedback, and restores paused. Ending or replacing a session records it as unfinished.

Data stays in this browser’s `localStorage`, under `gojuon-game:v1`. There are no learning-data uploads, accounts or analytics. Clearing records requires confirmation. Storage errors allow temporary practice; development data with a different structure can be cleared and reset.

## Romanization

Common spellings include `shi / chi / tsu / fu`. Both `じ / ぢ` map to `ji`, and `ず / づ` to `zu`. `を / ヲ` is displayed as `wo`, usually pronounced `o`; equivalent sounds are excluded from distractors. Extended loanword combinations are outside the basic contracted set.

Reference: [Agency for Cultural Affairs kana chart](https://www.bunka.go.jp/seisaku/kokugo_nihongo/kyoiku/seikatsusha/h24_nihongo_program_a/pdf/a_56.pdf).

## Development

Use **Node.js 24** and npm. Project files use UTF-8.

```sh
npm ci
npm run dev
```

Local checks: `npm run typecheck`, `npm test`, `npm run build`. Feedback, review intervals and statistical thresholds are configured in `src/config.ts`.
