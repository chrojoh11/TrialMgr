import XLSX from 'xlsx-js-style';

export type MailingListRow = {
  name:string; email:string; dog:string; registrationNumber:string; selections:string;
  receivedAt:string; confirmationStatus:string; amountOwing:number;
};

type ScentSelection = {
  trial_day_id: string;
  level: string;
  component: string;
  stream: string;
  selection_status?: string | null;
};

type GameSelection = {
  trial_day_id: string;
  entry_type: string;
  selection_status?: string | null;
  requested_team_partner?: string | null;
  aerial_division?: string | null;
  sdda_game_offerings?: { game_type: string } | null;
};

const statusSuffix = (status?: string | null) =>
  status && status !== 'accepted' ? ` · ${status.replaceAll('_', ' ')}` : '';

/** One readable list containing every Scent and Games selection on the entry. */
export function formatSddaEntrySelections(
  dayMap: Map<string, number>,
  scentRuns: ScentSelection[] = [],
  gameRuns: GameSelection[] = [],
) {
  const scent = scentRuns
    .slice()
    .sort(
      (a, b) =>
        (dayMap.get(a.trial_day_id) || 0) - (dayMap.get(b.trial_day_id) || 0) ||
        a.level.localeCompare(b.level) ||
        a.component.localeCompare(b.component),
    )
    .map(
      (run) =>
        `Day ${dayMap.get(run.trial_day_id) || '?'} · Scent · ${run.level} · ${run.component} · ${run.stream}${statusSuffix(run.selection_status)}`,
    );
  const games = gameRuns
    .slice()
    .sort(
      (a, b) =>
        (dayMap.get(a.trial_day_id) || 0) - (dayMap.get(b.trial_day_id) || 0) ||
        (a.sdda_game_offerings?.game_type || '').localeCompare(b.sdda_game_offerings?.game_type || ''),
    )
    .map((run) => {
      const game = run.sdda_game_offerings?.game_type || 'Game';
      const details = [
        `Day ${dayMap.get(run.trial_day_id) || '?'}`,
        'Games',
        game,
        game === 'Aerial' ? run.aerial_division : '',
        run.entry_type || 'Regular',
        game === 'Team' && run.requested_team_partner
          ? `Partner: ${run.requested_team_partner}`
          : '',
      ].filter(Boolean);
      return `${details.join(' · ')}${statusSuffix(run.selection_status)}`;
    });
  return [...scent, ...games].join('; ');
}

export function createSddaMailingListWorkbook(trialName:string, rows:MailingListRow[]) {
  const headers=['Name','Email','Dog','SDDA Number','Entry Selections Received','Received','Status','Amount Owing'];
  const data=rows.map(row=>[row.name,row.email,row.dog,row.registrationNumber,row.selections,
    row.receivedAt?new Date(row.receivedAt):'',row.confirmationStatus,row.amountOwing]);
  const ws=XLSX.utils.aoa_to_sheet([headers,...data]);
  ws['!cols']=[{wch:24},{wch:32},{wch:18},{wch:18},{wch:70},{wch:20},{wch:14},{wch:16}];
  ws['!autofilter']={ref:`A1:H${Math.max(1,rows.length+1)}`};
  ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
  const headerStyle={fill:{fgColor:{rgb:'225F45'}},font:{bold:true,color:{rgb:'FFFFFF'}},alignment:{vertical:'center'}};
  headers.forEach((_,index)=>{const cell=ws[XLSX.utils.encode_cell({r:0,c:index})];if(cell)cell.s=headerStyle;});
  for(let row=1;row<=rows.length;row++){
    const received=ws[XLSX.utils.encode_cell({r:row,c:5})]; if(received) received.z='yyyy-mm-dd hh:mm';
    const owing=ws[XLSX.utils.encode_cell({r:row,c:7})]; if(owing){owing.z='"$"#,##0.00;[Red]-"$"#,##0.00';owing.s={font:{bold:true,color:{rgb:rows[row-1].amountOwing>0?'9C3B22':'225F45'}}};}
    const selection=ws[XLSX.utils.encode_cell({r:row,c:4})]; if(selection)selection.s={alignment:{wrapText:true,vertical:'top'}};
  }
  ws['!rows']=[{hpt:26},...rows.map(()=>({hpt:34}))];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Mailing List');
  wb.Props={Title:`${trialName} mailing list`,Subject:'SDDA entry confirmations and balances',Author:'SDDA TrialDesk'};
  return XLSX.write(wb,{type:'array',bookType:'xlsx',cellStyles:true}) as ArrayBuffer;
}
