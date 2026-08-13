import { SDDA_COMPONENTS, SDDA_LEVELS, SDDA_STREAMS, type SddaComponent, type SddaLevel, type SddaStream } from './offerings';

export interface SddaCsvEntry {
  rowNumber: number; handlerName: string; handlerEmail: string; handlerPhone: string;
  dogCallName: string; dogRegisteredName: string; registrationNumber: string;
  registrationPending: boolean; breed: string; stream: SddaStream; level: SddaLevel;
  components: SddaComponent[]; trialDay: number;
}

function parseCsvRows(text: string) {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = '';
    } else value += char;
  }
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const aliases: Record<string, string[]> = {
  handlerName: ['handler_name', 'handler', 'name'], handlerEmail: ['handler_email', 'email', 'email_address'], handlerPhone: ['handler_phone', 'phone', 'phone_number'],
  dogCallName: ['dog_call_name', 'call_name'], dogRegisteredName: ['dog_registered_name', 'registered_name'],
  registrationNumber: ['sdda_registration_number', 'registration_number', 'sdda_number', 'dog_registered_number'],
  registrationPending: ['registration_pending', 'sdda_registration_pending'], breed: ['breed'], stream: ['stream', 'division', 'amateur_or_working_stream'],
  level: ['level'], components: ['components', 'component'], trialDay: ['trial_day', 'day', 'day_number'],
};

const levelNames = SDDA_LEVELS.map((level) => level.toLowerCase());
const componentNames: Record<string, SddaComponent> = {
  container: 'Container', containers: 'Container', interior: 'Interior', exterior: 'Exterior',
};

function parseGoogleFormEntries(rows: string[][], headers: string[]) {
  const offeringColumns = headers.map((header, index) => ({ header, index }))
    .filter(({ header }) => /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)_(started|advanced|excellent|elite)$/.test(header));
  if (!offeringColumns.length) return null;

  const weekdays = [...new Set(offeringColumns.map(({ header }) => header.split('_')[0]))];
  const fieldIndex = (field: string) => aliases[field].map((name) => {
    const exact = headers.indexOf(name);
    return exact >= 0 ? exact : headers.findIndex((header) => header.startsWith(`${name}_`));
  }).find((index) => index >= 0) ?? -1;
  for (const field of ['handlerName', 'dogCallName', 'stream']) {
    if (fieldIndex(field) < 0) throw new Error(`CSV is missing required column: ${aliases[field][0]}`);
  }
  const get = (row: string[], field: string) => row[fieldIndex(field)]?.trim() || '';
  const entries: SddaCsvEntry[] = []; const errors: string[] = [];

  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    const rawStreamSelection = get(row, 'stream');
    const streamSelections = new Map<SddaLevel, SddaStream>();
    for (const match of rawStreamSelection.matchAll(/(Started|Advanced|Excellent|Elite)\s*-\s*(Amateur|Working)/gi)) {
      const level = SDDA_LEVELS.find((value) => value.toLowerCase() === match[1].toLowerCase());
      const stream = SDDA_STREAMS.find((value) => value.toLowerCase() === match[2].toLowerCase());
      if (level && stream) streamSelections.set(level, stream);
    }

    for (const { header, index } of offeringColumns) {
      const selection = row[index]?.trim();
      if (!selection) continue;
      const [weekday, rawLevel] = header.split('_');
      const levelIndex = levelNames.indexOf(rawLevel);
      const level = SDDA_LEVELS[levelIndex];
      // Match the established TrialDesk behavior: prefer the stream explicitly
      // selected for this level; otherwise Working anywhere makes the fallback
      // Working, and a blank/non-Working response defaults to Amateur.
      const stream = streamSelections.get(level) ?? (/working/i.test(rawStreamSelection) ? 'Working' : 'Amateur');
      const components = /all_?3_components?/i.test(normalize(selection))
        ? [...SDDA_COMPONENTS]
        : selection.split(/[,;|]/).map((value) => componentNames[normalize(value)]).filter(Boolean);
      try {
        const handler = get(row, 'handlerName'); const dog = get(row, 'dogCallName');
        if (!handler || !dog) throw new Error('handler name and dog call name are required');
        if (!components.length) throw new Error(`invalid components for ${header.replace('_', ' ')}`);
        const registration = get(row, 'registrationNumber');
        entries.push({ rowNumber, handlerName: handler, handlerEmail: get(row, 'handlerEmail'), handlerPhone: get(row, 'handlerPhone'), dogCallName: dog,
          dogRegisteredName: get(row, 'dogRegisteredName'), registrationNumber: registration, registrationPending: !registration, breed: get(row, 'breed'),
          stream, level, components, trialDay: weekdays.indexOf(weekday) + 1 });
      } catch (error) { errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'invalid row'}`); }
    }
  });
  return { entries, errors };
}

export function parseSddaEntryCsv(text: string) {
  const rows = parseCsvRows(text); if (rows.length < 2) throw new Error('CSV must include a header and at least one entry row.');
  const headers = rows[0].map(normalize);
  const googleFormResult = parseGoogleFormEntries(rows, headers);
  if (googleFormResult) return googleFormResult;
  const indexOf = (field: string) => aliases[field].map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  for (const field of ['handlerName', 'dogCallName', 'registrationNumber', 'registrationPending', 'stream', 'level', 'components', 'trialDay']) {
    if (indexOf(field) < 0) throw new Error(`CSV is missing required column: ${aliases[field][0]}`);
  }
  const get = (row: string[], field: string) => row[indexOf(field)]?.trim() || '';
  const entries: SddaCsvEntry[] = []; const errors: string[] = [];
  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2;
    try {
      const stream = get(row, 'stream') as SddaStream; const level = get(row, 'level') as SddaLevel;
      const components = get(row, 'components').split(/[;|]/).map((value) => value.trim()).filter(Boolean) as SddaComponent[];
      const pending = /^(true|yes|y|1)$/i.test(get(row, 'registrationPending'));
      const registration = get(row, 'registrationNumber'); const handler = get(row, 'handlerName'); const dog = get(row, 'dogCallName');
      if (!handler || !dog) throw new Error('handler_name and dog_call_name are required');
      if (!SDDA_STREAMS.includes(stream)) throw new Error('stream must be Amateur or Working');
      if (!SDDA_LEVELS.includes(level)) throw new Error('invalid SDDA level');
      if (!components.length || components.some((value) => !SDDA_COMPONENTS.includes(value))) throw new Error('invalid SDDA components');
      if (!pending && !registration) throw new Error('registration number required unless pending');
      const trialDay = Number(get(row, 'trialDay')); if (!Number.isInteger(trialDay) || trialDay < 1 || trialDay > 4) throw new Error('trial_day must be 1 through 4');
      entries.push({ rowNumber, handlerName: handler, handlerEmail: get(row, 'handlerEmail'), handlerPhone: get(row, 'handlerPhone'), dogCallName: dog,
        dogRegisteredName: get(row, 'dogRegisteredName'), registrationNumber: registration, registrationPending: pending, breed: get(row, 'breed'), stream, level, components, trialDay });
    } catch (error) { errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'invalid row'}`); }
  });
  return { entries, errors };
}
