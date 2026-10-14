"""Render the per-design ledger without replacing narrative or audit notes."""
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
catalog = json.loads((ROOT / 'catalog.json').read_text())
models = catalog['designs']
assert len({row['slug'] for row in models}) == len(models)
counts = Counter(row['status'] for row in models)
lines = ['## Per-design progress', '', 'Inventory: ' + str(len(models)) + ' entries. ' + '; '.join(f'{key}: {value}' for key, value in sorted(counts.items())) + '.', '', '| Design / tutorial | Difficulty | Eligibility | Progress | Fold file / notes |', '| --- | --- | --- | --- | --- |']
for row in models:
    notes = []
    if row.get('model'):
        assert (ROOT / row['model']).is_file(), row['model']
        notes.append(f"[Open .osf]({row['model']})")
    if row.get('report'):
        notes.append(f"[Batch notes]({row['report']})")
    if row.get('notes'):
        notes.append(row['notes'].replace('|', '/').replace('\n', ' '))
    lines.append(f"| [{row['title']}]({row['url']}) | {row['difficulty']} | {row['eligibility']} | {row['status']} | {'; '.join(notes)} |")
text = (ROOT / 'PROGRESS.md').read_text()
start, tail = text.split('<!-- catalog:start -->', 1)
_, end = tail.split('<!-- catalog:end -->', 1)
(ROOT / 'PROGRESS.md').write_text(start + '<!-- catalog:start -->\n\n' + '\n'.join(lines) + '\n\n<!-- catalog:end -->' + end)
