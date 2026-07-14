# Six & Out — Brain

This is a running log of **why** things are the way they are: features shipped
and decisions made on this project, in the order they happened. It's an
Obsidian vault, and it's committed to git alongside the code.

This complements [CLAUDE.md](../../CLAUDE.md), which stays the source of truth
for *what the code does and how it's structured*. This vault is for the
context that doesn't live in the code: the reasoning, the tradeoffs, the "we
tried X first" history.

## Structure

- `features/` — one note per shipped feature
- `decisions/` — one note per notable decision (architecture, business rules,
  anything a future reader would otherwise have to reconstruct from git blame)

## Note convention

- Filename: `YYYY-MM-DD-short-title.md`
- Frontmatter: `date`, `type: feature|decision`, `tags`
- Body: one-line summary, then **Why**, then **Notes/links** (use
  `[[wiki-links]]` to connect related notes)

## Adding an entry

Whenever we ship a feature or make a decision worth remembering, add a note
here — ask Claude to log it, or write it directly. Keep entries short; this is
for quick capture, not detailed documentation (that belongs in code comments
or `CLAUDE.md` where it's non-obvious).
