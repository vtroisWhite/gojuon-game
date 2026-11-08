# Third-party data

`src/data/phonetic-neighbors.json` is derived from [jiroshimaya/kanasim](https://github.com/jiroshimaya/kanasim), revision `f067a4e8be10d818b37b8b9f08de933dae01524b`, under [Apache-2.0](public/licenses/kanasim-LICENSE.txt). Attribution and license copies are shipped in `public/licenses/`.

The original acoustic-model distance CSV is filtered to this game's readings and structures, then reduced to eight neighbors per reading. These rankings are supplementary acoustic similarity, not learner error probabilities. Regenerate with Node.js 24: `node --use-env-proxy scripts/generate-phonetic-neighbors.mjs`.
