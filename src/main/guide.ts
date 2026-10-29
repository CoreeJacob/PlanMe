// A guide to PlanMe's files, for another app or assistant that reads or changes boards. PlanMe
// keeps it up to date at <boards folder>/.planme/file-format.md (hidden in Finder).

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { FORMAT } from '@shared/types'
import { writeFileAtomic } from './files'

export const GUIDE = `# PlanMe file format (format ${FORMAT})

PlanMe is a planning board app (sticky notes, shapes, arrows, to-do lists, sections, pictures,
on tabs). Everything is plain JSON in this folder, and you may read and change it. If PlanMe is
open on a board you change, the board updates within a second: what you changed flashes, and the
person can undo your change with ⌘Z. If you both changed the same item, your version wins.

This guide is written by PlanMe and kept up to date; don't edit it.

## Rules

- **Write each file whole, in one go:** write to a temporary file next to it (e.g. \`board.json.tmp\`),
  then rename it over the real one. A half-written file is ignored until it's complete.
- **Keep \`"format": ${FORMAT}\`** in board.json and in every tab file. PlanMe refuses newer formats.
- **Ids** are any strings, unique within the board (random UUIDs are best). Never reuse or change an
  existing item's id: links, arrows and undo depend on them.
- Keep the JSON valid, and keep fields you don't understand as they were.
- Change what you mean to change and leave the rest alone (including each tab's \`view\`).
- Folder names starting with "." (like this one) aren't boards.

## Folders

\`\`\`
<boards folder>/
  .planme/file-format.md   this guide
  My Game/                 one folder per board (the folder name is the board's name)
    board.json             the tabs, in order, and the board's statuses
    tabs/<tab id>.json     what's on each tab
    images/                pictures the board uses (any sub-folders)
\`\`\`

To make a new board, make a folder with a board.json and a file for each of its tabs.

## board.json

\`\`\`json
{
  "format": ${FORMAT},
  "tabs": [{ "id": "a1", "name": "Overview" }, { "id": "b2", "name": "Level 1" }],
  "statuses": [
    { "id": "todo", "name": "To do", "color": "grey", "kind": "todo" },
    { "id": "doing", "name": "Doing", "color": "blue", "kind": "doing" },
    { "id": "done", "name": "Done", "color": "green", "kind": "done" },
    { "id": "blocked", "name": "Blocked", "color": "red", "kind": "other" }
  ],
  "tags": [{ "id": "art", "name": "Art", "color": "purple" }, { "id": "combat", "name": "Combat", "color": "red" }]
}
\`\`\`

- \`tabs\`: in the order they're shown. Adding a tab means adding it here AND writing its tab file
  (write the tab file first). Removing one: take it out of here, then delete its file.
- \`statuses\`: the board's own list. \`kind\` is \`todo\` (not started), \`doing\`, \`done\` (finished:
  it fades on the board) or \`other\`. Colours: grey, blue, green, red, orange, yellow, purple, pink, teal.
- \`tags\`: optional, the board's own tags: what area of the game something is part of. Same colours
  as statuses. To use a new tag, add it here first.

## tabs/<tab id>.json

\`\`\`json
{ "format": ${FORMAT}, "id": "b2", "view": { "x": 0, "y": 0, "zoom": 1 }, "items": [ ... ] }
\`\`\`

\`items\` are drawn in order (later ones on top; sections are always behind everything).

### Positions

Board units are pixels at 100% zoom. \`x\`, \`y\` is an item's top-left corner; \`y\` grows downwards.
The point 0,0 is in the middle of a new tab's screen, and a laptop screen shows roughly
1200 × 750 units around it. Leave gaps (40 or more) between things so they don't overlap.

### Every item except arrows has

| field | |
|---|---|
| \`id\`, \`type\` | \`type\` is one of note, text, box, section, todo, image |
| \`x\`, \`y\`, \`w\`, \`h\` | position and size (at least 20 wide and high) |
| \`text\` | the words, as simple HTML: only \`<b>\`, \`<i>\`, \`<u>\`, \`<div>\` (a line) and \`<br>\`; escape \`<\`, \`>\` and \`&\` |
| \`status\` | optional: the id of one of the board's statuses |
| \`statusAt\` | optional: when the status was set, in milliseconds since 1970 |
| \`link\` | optional: \`{ "type": "tab", "tab": "<tab id>" }\`, \`{ "type": "item", "item": "<item id on any tab>" }\` or \`{ "type": "web", "url": "https://…" }\` |
| \`locked\` | optional: \`true\` stops the person moving, resizing or deleting it by accident |
| \`tags\` | optional: ids of the board's tags, e.g. \`["art", "combat"]\` |
| \`details\` | optional: longer notes behind the short \`text\`, as the same simple HTML plus \`<ul>\`/\`<ol>\` and \`<li>\` lists. Put long descriptions here and keep \`text\` short |

### The kinds, with their own fields and usual sizes

- **note** (sticky note, 200 × 200): \`color\`: yellow, orange, pink, purple, blue, teal, green or grey.
  The words shrink to fit, so keep them short.
- **text** (words on their own, 240 wide): \`color\`: default, grey, red, orange, green, blue or purple;
  \`fontSize\` (20 is normal). \`h\` follows the words (PlanMe sets it).
- **box** (a shape with words in the middle, 200 × 120): \`shape\`: rect, rounded, oval, diamond,
  parallelogram or cylinder; \`fill\`: none, white or a note colour; \`border\`: a text colour or none.
- **section** (a labelled area that holds what's fully inside it, 600 × 400): \`color\`: a note colour;
  \`text\` is its title. Put things inside by placing them entirely within its rectangle.
- **todo** (a to-do list, 260 wide): \`color\`: white or a note colour; \`text\` is its title;
  \`entries\`: \`[{ "id": "…", "text": "plain words", "done": false }]\`; \`auto\`: \`true\` lets its
  status follow its ticks (the board's first status of kind todo with none ticked, doing with
  some, done with all),
  \`false\` keeps the \`status\` you give it. \`h\` follows the lines (PlanMe sets it).
- **image** (a picture): \`src\`: its path inside the board's folder, always starting \`images/\`
  (copy the picture file in there first); \`name\`: its file name. Keep \`w\`/\`h\` in the picture's proportions.

### Arrows

\`\`\`json
{
  "id": "…", "type": "arrow", "text": "",
  "from": { "item": "<item id>", "x": 0, "y": 0 },
  "to": { "item": null, "x": 400, "y": 120 },
  "route": "straight", "heads": "end", "dashed": false, "color": "default", "width": 2
}
\`\`\`

- An end joined to an item has its \`item\` id (and \`x\`, \`y\` roughly where it was, as a fallback);
  it meets the item on the side facing the other end. A loose end has \`item: null\` and sits at \`x\`, \`y\`.
  Arrows join to notes, text, boxes, to-do lists and pictures, not sections.
- \`route\`: straight or elbow. \`heads\`: end, both or none. \`color\`: a text colour. \`width\`: 2, 3.5 or 5.
- \`text\` is an optional label. An optional \`pin\` (\`{ "x": 1, "y": 0.5 }\`, fractions of the item's
  width and height) fixes an end to one spot on the item's edge.

## A whole tab file

\`\`\`json
{
  "format": ${FORMAT},
  "id": "b2",
  "view": { "x": 0, "y": 0, "zoom": 1 },
  "items": [
    { "id": "s1", "type": "section", "text": "Act 1", "x": -400, "y": -250, "w": 800, "h": 500, "color": "blue" },
    { "id": "n1", "type": "note", "text": "Opening cutscene", "x": -350, "y": -180, "w": 200, "h": 200, "color": "yellow" },
    { "id": "n2", "type": "box", "text": "Boss <b>fight</b>", "x": 100, "y": -140, "w": 200, "h": 120,
      "shape": "rounded", "fill": "white", "border": "default", "status": "doing", "link": { "type": "tab", "tab": "a1" } },
    { "id": "a1x", "type": "arrow", "text": "", "from": { "item": "n1", "x": 0, "y": 0 }, "to": { "item": "n2", "x": 0, "y": 0 },
      "route": "straight", "heads": "end", "dashed": false, "color": "default", "width": 2 },
    { "id": "t1", "type": "todo", "text": "Jobs", "x": -350, "y": 60, "w": 260, "h": 120, "color": "white", "auto": true,
      "entries": [{ "id": "e1", "text": "Draw the map", "done": true }, { "id": "e2", "text": "Write the music", "done": false }] }
  ]
}
\`\`\`
`

/** Writes the guide into a boards folder, if it isn't there already as it is now. */
export async function writeGuide(root: string): Promise<void> {
  const file = path.join(root, '.planme', 'file-format.md')
  const current = await fs.readFile(file, 'utf8').catch(() => null)
  if (current !== GUIDE) await writeFileAtomic(file, GUIDE)
}
