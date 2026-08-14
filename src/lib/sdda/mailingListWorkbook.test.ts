import assert from 'node:assert/strict'; import test from 'node:test'; import XLSX from 'xlsx-js-style';
import { createSddaMailingListWorkbook } from './mailingListWorkbook';
test('exports filterable SDDA mailing rows with numeric currency balances',()=>{
  const bytes=createSddaMailingListWorkbook('Test Trial',[{name:'A Handler',email:'a@example.com',dog:'Scout',registrationNumber:'SDDA-1',selections:'Day 1 · Started · Container · Amateur',receivedAt:'2026-08-13T18:00:00Z',confirmationStatus:'received',amountOwing:45}]);
  const wb=XLSX.read(bytes,{type:'array',cellStyles:true,cellDates:true}); const ws=wb.Sheets['Mailing List'];
  assert.equal(ws.A2.v,'A Handler');assert.equal(ws.E2.v,'Day 1 · Started · Container · Amateur');assert.equal(ws.H2.v,45);assert.equal(ws.H2.t,'n');assert.equal(ws['!autofilter']?.ref,'A1:H2');
});
