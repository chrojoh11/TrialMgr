import assert from 'node:assert/strict'; import test from 'node:test'; import XLSX from 'xlsx-js-style';
import { createSddaMailingListWorkbook, formatSddaEntrySelectionColumns } from './mailingListWorkbook';
test('exports filterable SDDA mailing rows with numeric currency balances',()=>{
  const bytes=createSddaMailingListWorkbook('Test Trial',[{name:'A Handler',email:'a@example.com',dog:'Scout',registrationNumber:'SDDA-1',scentSelections:'Day 1 · Started · Container · Amateur',gameSelections:'Day 1 · Distance · Regular',receivedAt:'2026-08-13T18:00:00Z',confirmationStatus:'received',amountOwing:45}]);
  const wb=XLSX.read(bytes,{type:'array',cellStyles:true,cellDates:true}); const ws=wb.Sheets['Mailing List'];
  assert.equal(ws.A2.v,'A Handler');assert.equal(ws.E2.v,'Day 1 · Started · Container · Amateur');assert.equal(ws.F2.v,'Day 1 · Distance · Regular');assert.equal(ws.I2.v,45);assert.equal(ws.I2.t,'n');assert.equal(ws['!autofilter']?.ref,'A1:I2');
});

test('includes scent, Distance, and Aerial selections in an entry export',()=>{
  const selections=formatSddaEntrySelectionColumns(new Map([['day-1',1]]),[
    {trial_day_id:'day-1',level:'Started',component:'Container',stream:'Amateur',selection_status:'accepted'},
  ],[
    {trial_day_id:'day-1',entry_type:'Regular',selection_status:'accepted',sdda_game_offerings:{game_type:'Distance'}},
    {trial_day_id:'day-1',entry_type:'FEO',selection_status:'waitlisted',aerial_division:'Highfly',sdda_game_offerings:{game_type:'Aerial'}},
  ]);
  assert.match(selections.scentSelections,/Scent · Started · Container · Amateur/);
  assert.doesNotMatch(selections.scentSelections,/Games/);
  assert.match(selections.gameSelections,/Games · Distance · Regular/);
  assert.match(selections.gameSelections,/Games · Aerial · Highfly · FEO · waitlisted/);
});
