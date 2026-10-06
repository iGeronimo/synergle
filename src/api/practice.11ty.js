/** Emits one JSON file per practice puzzle: /data/practice/<n>.json */
export const data = {
  pagination: { data: "game.practice", size: 1, alias: "puzzle" },
  permalink: (data) => `/data/practice/${data.puzzle.id}.json`,
  eleventyExcludeFromCollections: true,
  layout: false,
};

export function render({ puzzle }) {
  return JSON.stringify(puzzle);
}
