// Client-side generation of a self-contained results HTML file (single story or full session).

export interface VoteLine {
  name: string;
  vote: string;
}

export interface StorySection {
  title: string;
  mean: number | null;
  median: number | null;
  recommended: string | null;
  override?: string | null;
  votes: VoteLine[];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function fmt(n: number | null): string {
  return n === null ? '—' : (Math.round(n * 100) / 100).toString();
}

function sectionHtml(s: StorySection): string {
  const rows = s.votes
    .map((v) => `<tr><td>${esc(v.name)}</td><td>${esc(v.vote)}</td></tr>`)
    .join('');
  const override =
    s.override != null
      ? `<p><strong>Final score (override):</strong> ${esc(s.override)}</p>`
      : '';
  return `
    <section>
      <h2>${esc(s.title || 'Untitled story')}</h2>
      <p><strong>Mean:</strong> ${fmt(s.mean)} &nbsp; <strong>Median:</strong> ${fmt(s.median)} &nbsp; <strong>Recommended:</strong> ${esc(s.recommended ?? '—')}</p>
      ${override}
      <table><thead><tr><th>Participant</th><th>Vote</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
}

export function buildResultsHtml(docTitle: string, sections: StorySection[]): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(docTitle)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
  h1 { color: #c97b1e; }
  section { border-top: 1px solid #ddd; padding-top: 1rem; margin-top: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin-top: .5rem; }
  th, td { text-align: left; padding: .3rem .6rem; border-bottom: 1px solid #eee; }
</style></head><body>
<h1>${esc(docTitle)}</h1>
${sections.map(sectionHtml).join('')}
</body></html>`;
}

export function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
