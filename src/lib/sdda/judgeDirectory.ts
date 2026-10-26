export interface SddaJudge {
  sdda_contact_id: number;
  display_name: string;
  source_checked_on: string;
}

// Official SDDA Trial Workbook judge directory, checked 2026-09-21.
// The database copy can be refreshed without changing code; this list keeps trial setup usable
// during a deployment in which the additive directory migration has not yet been applied.
export const SDDA_JUDGE_DIRECTORY_FALLBACK: SddaJudge[] = [
  [8498, 'Stephanie Bacon'], [392, 'Jane Book'], [783, 'Marie-Noelle Cote'],
  [310, 'Norm Dressler'], [311, 'Jean-Marc Dugas'], [1057, 'Chelsea Dujardin'],
  [287, 'Paul Dyer'], [531, 'Yvonne Ferguson'], [288, 'Russell Fox'],
  [2014, 'Julie Gaboury'], [1114, 'Leslie Gardiner'], [16761, 'Danielle Getzie'],
  [388, 'Richard Greenall'], [1252, 'Christine Guay'], [701, 'Chris Hansen'],
  [743, 'Michelle Hasselbach'], [1137, 'Richard Hatchman'], [761, 'Sandra Hebert'],
  [1855, 'Ashley Horan'], [4740, 'Cathy Jenkins'], [441, 'Ryan-Ann King'],
  [1530, 'Pam Koiner'], [324, 'Kelly Ladouceur'], [50377, 'Guy LaHaye'],
  [1889, 'Lou-Anne Lambert'], [1411, 'Christina Legien'], [328, 'Sheri Luzzi'],
  [434, 'John Mairs'], [1058, 'Carrie McAunaul'], [6258, 'Lane Michie'],
  [652, 'Patricia Noble'], [2112, 'Beverley Owocki'], [819, 'Monique Pouliot'],
  [3916, 'Annick Samson'], [1082, 'Marina Skoreiko'], [291, 'Pando Stepanis'],
  [4341, 'Cathy Teeft'], [463, 'Doug Teeft'], [1590, 'Doug Wilson'],
  [383, 'Heather Wilson'], [1591, 'Debbie Wixalbrown'], [37710, 'Alli Yerxa'],
  [405, 'Shanna Zook'],
].map(([sdda_contact_id, display_name]) => ({
  sdda_contact_id: Number(sdda_contact_id),
  display_name: String(display_name),
  source_checked_on: '2026-09-21',
})).sort((a, b) => a.display_name.localeCompare(b.display_name));

