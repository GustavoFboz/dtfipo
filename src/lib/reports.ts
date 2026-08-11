
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { CaseRow } from "@/lib/types";

// Extender o tipo jsPDF para incluir autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
  lastAutoTable: {
    finalY: number;
  };
}

export async function generateCasesReport(
  cases: CaseRow[],
  filters: {
    activeFilter: string;
    dateRange: { start: string; end: string } | null;
    doctorIds: string[];
    cadistaIds: string[];
  }
) {
  const doc = new jsPDF() as jsPDFWithAutoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;

  // Primary identity color
  const primaryColor = [59, 130, 246]; // #3B82F6

  // 1. Header (Lab Info)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("IPO", margin, 25);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.text("Instituto Praia de Odontologia", margin, 32);
  doc.text("Avenida Principal, 1000 - Centro", margin, 37);
  doc.text("Contato: (00) 0000-0000 | ipo@odontologia.com", margin, 42);

  // 2. Document Info
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR");
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });

  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO DE CASOS", pageWidth - margin, 25, { align: "right" });
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Emissão: ${dateStr} às ${timeStr}`, pageWidth - margin, 32, { align: "right" });
  
  let periodText = "Período: Todos";
  if (filters.dateRange?.start && filters.dateRange?.end) {
    periodText = `Período: ${filters.dateRange.start.split('-').reverse().join('/')} até ${filters.dateRange.end.split('-').reverse().join('/')}`;
  }
  doc.text(periodText, pageWidth - margin, 37, { align: "right" });

  doc.setDrawColor(230);
  doc.line(margin, 50, pageWidth - margin, 50);

  // 3. Professionals Involved (Summary)
  // Collect unique doctors and cadistas from the case list
  const uniqueProfProfiles = new Map<string, { name: string; avatar: string | null; role: string }>();
  cases.forEach(c => {
    if (c.doctor) uniqueProfProfiles.set(c.doctor.id, { name: c.doctor.name, avatar: null, role: "Doutor" });
    if (c.cadista) uniqueProfProfiles.set(c.cadista.id, { name: c.cadista.name, avatar: null, role: "Cadista" });
  });

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text("Profissionais Envolvidos no Período", margin, 60);

  let profX = margin;
  let profY = 68;
  const profs = Array.from(uniqueProfProfiles.values()).slice(0, 10); // Limit summary

  profs.forEach((p, idx) => {
    if (profX > pageWidth - 60) {
      profX = margin;
      profY += 15;
    }
    
    // Avatar placeholder (circle)
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFillColor(245, 249, 255);
    doc.circle(profX + 5, profY, 5, "FD");
    doc.setFontSize(7);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(p.name[0].toUpperCase(), profX + 5, profY + 1, { align: "center" });
    
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(p.name.split(' ')[0], profX + 12, profY + 0.5);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(p.role, profX + 12, profY + 3.5);
    
    profX += 45;
  });

  // 4. Cases Table
  const tableData = cases.map(c => [
    c.case_number || "-",
    c.patient?.name || "N/A",
    c.doctor?.name || "-",
    c.entry_date ? c.entry_date.split('T')[0].split('-').reverse().join('/') : "-",
    c.delivery_date ? c.delivery_date.split('T')[0].split('-').reverse().join('/') : "-",
    c.current_stage?.name || "Pendente",
    c.status.toUpperCase()
  ]);

  doc.autoTable({
    startY: profY + 15,
    head: [['Nº', 'Paciente', 'Doutor', 'Entrada', 'Entrega', 'Etapa Atual', 'Status']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: 255,
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left'
    },
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 15 },
      5: { fontStyle: 'bold' },
      6: { halign: 'center' }
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    margin: { left: margin, right: margin }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Página ${i} de ${pageCount} - DentalFlow Pro Report`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`relatorio-casos-${dateStr.replace(/\//g, '-')}.pdf`);
}
