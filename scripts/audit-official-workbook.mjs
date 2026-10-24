import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';

const [sourcePath] = process.argv.slice(2);
if (!sourcePath) throw new Error('Usage: node scripts/audit-official-workbook.mjs <official-workbook.xlsx>');

const files = unzipSync(readFileSync(sourcePath));
const workbookXml = strFromU8(files['xl/workbook.xml']);
const relationshipXml = strFromU8(files['xl/_rels/workbook.xml.rels']);
const relationships = new Map(
  [...relationshipXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)].map(
    (match) => [match[1], match[2]]
  )
);
const sheets = new Map(
  [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g)].map(
    (match) => {
      const target = relationships.get(match[2]);
      return [match[1], target?.startsWith('/') ? target.slice(1) : `xl/${target?.replace(/^\.\.\//, '')}`];
    }
  )
);

let formulaCount = 0;
let allFormulaText = '';
for (const path of sheets.values()) {
  if (!path || !files[path]) continue;
  const formulas = [...strFromU8(files[path]).matchAll(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/g)];
  formulaCount += formulas.length;
  allFormulaText += `\n${formulas.map((match) => match[1]).join('\n')}`;
}

const namedCells = [];
for (const match of workbookXml.matchAll(/<definedName\b[^>]*\bname="([^"]+)"[^>]*>([^<]*)<\/definedName>/g)) {
  const reference = match[2].match(/^'([^']+)'!\$([A-Z]+)\$(\d+)$/);
  if (!reference) continue;
  const address = `${reference[2]}${reference[3]}`;
  const path = sheets.get(reference[1]);
  const xml = path && files[path] ? strFromU8(files[path]) : '';
  const cell = xml.match(new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*>[\\s\\S]*?<\\/c>`))?.[0] || '';
  namedCells.push({
    name: match[1],
    reference: `${reference[1]}!${address}`,
    formula: cell.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1] || null,
    formulaReferences: [...allFormulaText.matchAll(new RegExp(`\\b${match[1]}\\b`, 'g'))].length,
  });
}

const queryReferences = Object.entries(files)
  .filter(([, bytes]) => strFromU8(bytes).includes('qselFutureTrials'))
  .map(([path]) => path);

process.stdout.write(
  JSON.stringify(
    {
      sourcePath,
      packageParts: Object.keys(files).length,
      worksheets: sheets.size,
      formulaCount,
      queryReferences,
      namedCells,
    },
    null,
    2
  )
);
