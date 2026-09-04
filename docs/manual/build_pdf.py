from io import BytesIO
from pathlib import Path
from lxml import etree
from PIL import Image as PILImage
from docx import Document
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph as P, Spacer, PageBreak, Image, Table, TableStyle, KeepTogether

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'SDDA-TrialDesk-Secretary-Manual.docx'
OUT=ROOT/'SDDA-TrialDesk-Secretary-Manual.pdf'
GREEN=colors.HexColor('#294F73'); GOLD=colors.HexColor('#526B83'); INK=colors.HexColor('#18232F')
MUTED=colors.HexColor('#637080'); LIGHT=colors.HexColor('#F1F4F7')

styles=getSampleStyleSheet()
body=ParagraphStyle('Body',parent=styles['BodyText'],fontName='Helvetica',fontSize=9.2,leading=11.4,textColor=INK,spaceAfter=5)
title=ParagraphStyle('Title2',parent=body,fontName='Helvetica-Bold',fontSize=27,leading=31,textColor=GREEN,alignment=TA_CENTER,spaceAfter=10)
subtitle=ParagraphStyle('Subtitle2',parent=body,fontSize=12,leading=15,textColor=MUTED,alignment=TA_CENTER,spaceAfter=10)
h1=ParagraphStyle('H1',parent=body,fontName='Helvetica-Bold',fontSize=17,leading=21,textColor=GREEN,spaceBefore=10,spaceAfter=7,keepWithNext=True)
h2=ParagraphStyle('H2',parent=body,fontName='Helvetica-Bold',fontSize=13,leading=16,textColor=GREEN,spaceBefore=8,spaceAfter=5,keepWithNext=True)
h3=ParagraphStyle('H3',parent=body,fontName='Helvetica-Bold',fontSize=10.5,leading=13,textColor=GOLD,spaceBefore=6,spaceAfter=3,keepWithNext=True)
caption=ParagraphStyle('Caption',parent=body,fontName='Helvetica-Oblique',fontSize=7.8,leading=9.5,textColor=MUTED,alignment=TA_CENTER,spaceAfter=8)
bullet=ParagraphStyle('Bullet2',parent=body,leftIndent=15,firstLineIndent=-8,bulletIndent=5,spaceAfter=3)

def clean(text):
    return (text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
      .replace('→','-&gt;').replace('–','-').replace('—','-').replace('•',' | ')
      .replace('☐','[ ]').replace('“','"').replace('”','"').replace('’',"'").replace('…','...'))

def runs_html(p):
    out=[]
    for r in p.runs:
        t=clean(r.text)
        if not t: continue
        if r.bold: t=f'<b>{t}</b>'
        if r.italic: t=f'<i>{t}</i>'
        out.append(t)
    return ''.join(out) or clean(p.text)

def iter_blocks(document):
    parent=document.element.body
    for child in parent.iterchildren():
        if child.tag.endswith('}p'): yield Paragraph(child,document)
        elif child.tag.endswith('}tbl'): yield DocxTable(child,document)

def page_num(canvas, doc):
    canvas.saveState(); canvas.setFont('Helvetica',7.5); canvas.setFillColor(MUTED)
    canvas.drawString(.78*inch,.38*inch,'SDDA TrialDesk | July 2026 Rulebook workflow')
    canvas.drawRightString(7.72*inch,.38*inch,f'Page {doc.page}'); canvas.restoreState()

def image_from_paragraph(p):
    blips=p._p.xpath('.//a:blip')
    if not blips: return None
    rid=blips[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
    part=p.part.related_parts[rid]; data=part.blob
    with PILImage.open(BytesIO(data)) as im: w,h=im.size
    maxw=6.75*inch; maxh=7.2*inch; scale=min(maxw/w,maxh/h)
    return Image(BytesIO(data),width=w*scale,height=h*scale)

story=[]; docx=Document(SOURCE)
for block in iter_blocks(docx):
    if isinstance(block, Paragraph):
        xml=block._p.xml
        if 'w:type="page"' in xml: story.append(PageBreak()); continue
        img=image_from_paragraph(block)
        if img: story.append(KeepTogether([img,Spacer(1,3)])); continue
        text=block.text.strip()
        if not text: story.append(Spacer(1,4)); continue
        style_name=block.style.name if block.style else ''
        st=body
        if style_name=='Title': st=title
        elif style_name=='Subtitle': st=subtitle
        elif style_name=='Heading 1': st=h1
        elif style_name=='Heading 2': st=h2
        elif style_name=='Heading 3': st=h3
        elif text.startswith('Figure '): st=caption
        elif style_name.startswith('List Bullet'):
            story.append(P(clean(text),bullet,bulletText='-')); continue
        story.append(P(runs_html(block),st))
    else:
        data=[]
        for ri,row in enumerate(block.rows):
            is_header=ri==0 and len(block.rows)>1
            data.append([P(clean(cell.text),ParagraphStyle('Cell',parent=body,fontSize=7.7,leading=9.3,spaceAfter=0,textColor=colors.white if is_header else INK,fontName='Helvetica-Bold' if is_header else 'Helvetica')) for cell in row.cells])
        if not data: continue
        cols=len(data[0]); widths=[6.75*inch/cols]*cols
        if cols==2: widths=[1.75*inch,5*inch]
        t=Table(data,colWidths=widths,repeatRows=1,hAlign='CENTER')
        commands=[('GRID',(0,0),(-1,-1),.35,colors.HexColor('#D9D8CF')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]
        if len(data)>1:
            commands += [('BACKGROUND',(0,0),(-1,0),GREEN),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold')]
            for r in range(2,len(data),2): commands.append(('BACKGROUND',(0,r),(-1,r),LIGHT))
        else: commands += [('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#E8EFF5'))]
        t.setStyle(TableStyle(commands)); story.append(t); story.append(Spacer(1,7))

pdf=SimpleDocTemplate(str(OUT),pagesize=letter,rightMargin=.78*inch,leftMargin=.78*inch,topMargin=.62*inch,bottomMargin=.58*inch,title='SDDA TrialDesk Secretary Manual',author='SDDA TrialDesk')
pdf.build(story,onFirstPage=page_num,onLaterPages=page_num)
print(OUT)
