import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSddaEntryCsv } from './entryCsv';

test('parses Google Forms-style quoted SDDA CSV responses', () => {
  const csv = 'Handler Name,Email,Dog Call Name,Dog Registered Name,SDDA Number,Registration Pending,Breed,Stream,Level,Components,Trial Day\n"Chris, Jr.",c@example.ca,Finn,Finnegan,SDDA-1,No,Spaniel,Amateur,Started,"Container;Interior",1';
  const result = parseSddaEntryCsv(csv);
  assert.equal(result.errors.length, 0); assert.equal(result.entries[0].handlerName, 'Chris, Jr.');
  assert.deepEqual(result.entries[0].components, ['Container', 'Interior']);
});

test('reports invalid rows without accepting them', () => {
  const csv = 'handler_name,dog_call_name,sdda_registration_number,registration_pending,stream,level,components,trial_day\nChris,Finn,,No,Pro,Patrol,Vehicle,5';
  const result = parseSddaEntryCsv(csv); assert.equal(result.entries.length, 0); assert.match(result.errors[0], /stream/);
});
