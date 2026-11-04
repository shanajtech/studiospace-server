import { PDFDocument } from 'pdfkit';
import { fileURLToPath } from 'node:url';

const font=fileURLToPath(new URL('../assets/NotoSansBengali.ttf',import.meta.url));
const currency=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
const date=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' UTC';
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ');

export function bookingInvoice(booking){
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:48,font,info:{Title:`StudioSpace booking ${booking._id}`,Author:'StudioSpace',Subject:'Confirmed studio reservation invoice'}});
    const chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    const ink='#203c31',muted='#62716a',orange='#d86b36',line='#dce2dc';
    const left=48,width=499;
    doc.rect(0,0,596,115).fill('#f1f4ed');
    doc.fillColor(ink).fontSize(25).text('studiospace',left,36);
    doc.fontSize(9).fillColor(muted).text('ROOM FOR YOUR NEXT BIG IDEA',left,72);
    doc.fontSize(9).fillColor(orange).text('RESERVATION INVOICE',350,41,{width:197,align:'right'});
    doc.fillColor(ink).text(booking.status,350,65,{width:197,align:'right'});
    let y=140;
    doc.fontSize(19).fillColor(ink).text(clean(booking.studioTitle),left,y,{width});y=doc.y+8;
    doc.fontSize(10).fillColor(muted).text(clean(booking.location),left,y,{width});y=doc.y+20;
    doc.fontSize(8).text(`INVOICE SS-${String(booking._id).toUpperCase()}`,left,y);
    doc.text(`Booking created: ${date(booking.createdAt)}`,left,doc.y+3);y=doc.y+23;
    function block(label,values,x,top,blockWidth){
      doc.fillColor(orange).fontSize(9).text(label,x,top,{width:blockWidth});
      doc.fillColor(ink).fontSize(10);
      for(const value of values)doc.text(clean(value),x,doc.y+5,{width:blockWidth});
      return doc.y;
    }
    const guestY=block('BOOKED BY',[booking.userName,booking.userEmail],left,y,235);
    const hostY=block('HOST',[booking.hostEmail],312,y,235);
    y=Math.max(guestY,hostY)+25;
    const scheduleY=block('RESERVED HOURS',[`Start: ${date(booking.start)}`,`End: ${date(booking.end)}`],left,y,width);
    y=scheduleY+10;
    const hours=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(booking.hours);
    doc.fontSize(10).fillColor(muted).text(`${hours} hour${booking.hours===1?'':'s'}  /  ${booking.guests} guest${booking.guests===1?'':'s'}`,left,y,{width});y=doc.y+26;
    doc.moveTo(left,y).lineTo(left+width,y).strokeColor(line).stroke();y+=16;
    function row(label,value,total=false){
      doc.fillColor(total?ink:muted).fontSize(total?15:11).text(label,left,y,{width:350});
      const labelEnd=doc.y;
      doc.fillColor(ink).text(value,410,y,{width:137,align:'right'});y=Math.max(doc.y,labelEnd)+15;
    }
    row(`Studio hire (${hours} hrs at ${currency(booking.hourlyRate)}/hr)`,currency(Math.round(booking.hours*booking.hourlyRate*100)/100));
    row('Security deposit',currency(booking.deposit));
    doc.moveTo(left,y-3).lineTo(left+width,y-3).strokeColor(line).stroke();y+=12;
    row('Reservation total',currency(booking.total),true);y+=12;
    doc.fontSize(10).fillColor(orange).text('PAYMENT NOT COLLECTED BY STUDIOSPACE',left,y,{width});
    doc.fontSize(9).fillColor(muted).text('This invoice records a confirmed reservation and its agreed estimate. It is not proof of payment. Arrange payment and security-deposit returns directly with the host.',left,doc.y+8,{width,lineGap:3});
    doc.fontSize(8).text('Keep this document for your booking records. All reservation times above are shown in UTC.',left,doc.y+20,{width});
    doc.end();
  });
}

