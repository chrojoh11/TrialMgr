import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type EntryReceiptPdfInput={confirmationCode:string;trialName:string;handlerName:string;dogName:string;runCount:number;selections:string[];privateEditUrl?:string};
export async function createEntryReceiptPdf(input:EntryReceiptPdfInput){
  const pdf=await PDFDocument.create();const page=pdf.addPage([612,792]);const regular=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({x:0,y:700,width:612,height:92,color:rgb(0.133,0.373,0.271)});page.drawText('SDDA TrialDesk',{x:48,y:754,size:13,font:bold,color:rgb(1,1,1)});page.drawText('Entry received',{x:48,y:720,size:28,font:bold,color:rgb(1,1,1)});
  let y=660;const line=(text:string,size=12,font=regular)=>{page.drawText(text.replace(/[^ -~]/g,'-'),{x:48,y,size,font,color:rgb(0.09,0.14,0.11)});y-=22};
  line('CONFIRMATION NUMBER',10,bold);line(input.confirmationCode,22,bold);y-=8;line('Received - not yet accepted.',14,bold);line('The trial secretary must confirm this entry and provide payment instructions.');y-=10;line(input.trialName,18,bold);line(`${input.handlerName} with ${input.dogName}`);line(`${input.runCount} component run${input.runCount===1?'':'s'} requested`);
  if(input.privateEditUrl){y-=6;line('PRIVATE EDIT LINK - KEEP CONFIDENTIAL',10,bold);for(let index=0;index<input.privateEditUrl.length;index+=64)line(input.privateEditUrl.slice(index,index+64),7);line('Anyone with this link can edit the entry until it is accepted or entries close.',8)}
  y-=10;line('Selections',14,bold);
  input.selections.forEach(selection=>{if(y>60)line(`- ${selection}`,10)});page.drawText('Keep this receipt for your records.',{x:48,y:38,size:9,font:regular,color:rgb(0.35,0.4,0.37)});
  return pdf.save();
}
