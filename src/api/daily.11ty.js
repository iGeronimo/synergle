/** Emits one JSON file per daily puzzle: /data/daily/<n>.json */
export const data = {
  pagination: { data: "game.daily", size: 1, alias: "puzzle" },
  permalink: (data) => `/data/daily/${data.puzzle.id}.json`,
  eleventyExcludeFromCollections: true,
  layout: false,
};

export function render({ puzzle }) {
  return JSON.stringify(puzzle);
}
