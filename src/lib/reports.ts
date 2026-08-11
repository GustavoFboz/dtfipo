
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import type { CaseRow, Profile } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

// Extended jsPDF type to include autoTable
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
  lastAutoTable: {
    finalY: number;
  };
}

async function getBase64FromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Error loading image for PDF:", e);
    return null;
  }
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
  const primaryColor = [84, 168, 251]; // #54A8FB (System primary blue)

  // 1. Header (Lab Info)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("IPO", margin, 25);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.setFont("helvetica", "normal");
  doc.text("Instituto Praia de Odontologia", margin, 32);
  doc.text("Controle Digital de Casos Clínicos", margin, 37);

  // 2. Document Info
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR");
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });

  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO DE CASOS", pageWidth - margin, 25, { align: "right" });
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150);
  doc.text(`Emissão: ${dateStr} às ${timeStr}`, pageWidth - margin, 32, { align: "right" });
  
  let periodText = "Período: Todos";
  if (filters.dateRange?.start && filters.dateRange?.end) {
    periodText = `Período: ${filters.dateRange.start.split('-').reverse().join('/')} até ${filters.dateRange.end.split('-').reverse().join('/')}`;
  }
  doc.text(periodText, pageWidth - margin, 37, { align: "right" });

  doc.setDrawColor(240);
  doc.line(margin, 45, pageWidth - margin, 45);

  // 3. Professionals Involved (Summary)
  // Fetch profiles to get avatars
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url, role");
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  const uniqueProfProfiles = new Map<string, { name: string; avatar: string | null; role: string }>();
  cases.forEach(c => {
    if (c.doctor) {
      // Find doctor in profiles by name (denormalized) or ID if we had it
      const p = (profiles || []).find((p: any) => p.full_name === c.doctor?.name);
      uniqueProfProfiles.set(c.doctor.id, { 
        name: c.doctor.name, 
        avatar: p?.avatar_url || null, 
        role: "Dentista" 
      });
    }
    if (c.cadista) {
      const p = c.cadista.user_id ? profileMap.get(c.cadista.user_id) : profiles?.find(p => p.full_name === c.cadista?.name);
      uniqueProfProfiles.set(c.cadista.id, { 
        name: c.cadista.name, 
        avatar: p?.avatar_url || null, 
        role: "Cadista" 
      });
    }
  });

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50);
  doc.text("Profissionais Envolvidos", margin, 55);

  let profX = margin;
  let profY = 65;
  const profsList = Array.from(uniqueProfProfiles.values());

  for (const p of profsList) {
    if (profX > pageWidth - 50) {
      profX = margin;
      profY += 18;
    }
    
    const avatarBase64 = p.avatar ? await getBase64FromUrl(p.avatar) : null;
    
    if (avatarBase64) {
      try {
        doc.saveGraphicsState();
        doc.clip();
        doc.addImage(avatarBase64, 'JPEG', profX, profY - 5, 10, 10);
        doc.restoreGraphicsState();
      } catch (e) {
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.circle(profX + 5, profY, 5, "F");
      }
    } else {
      doc.setFillColor(240, 244, 250);
      doc.circle(profX + 5, profY, 5, "F");
      doc.setFontSize(7);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(p.name[0].toUpperCase(), profX + 5, profY + 1, { align: "center" });
    }
    
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(p.name.split(' ')[0], profX + 12, profY - 1);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150);
    doc.text(p.role, profX + 12, profY + 3);
    
    profX += 45;
  }

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
    theme: 'striped',
    headStyles: {
      fillColor: [248, 249, 251],
      textColor: [84, 168, 251],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
      lineWidth: 0.1,
      lineColor: [230, 230, 230]
    },
    styles: {
      fontSize: 8,
      cellPadding: 4,
      font: "helvetica",
      textColor: [80, 80, 80],
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 12 },
      5: { fontStyle: 'bold', textColor: [50, 50, 50] },
      6: { halign: 'center', fontSize: 7 }
    },
    alternateRowStyles: {
      fillColor: [252, 253, 255]
    },
    margin: { left: margin, right: margin },
    didDrawCell: (data: any) => {
      // Additional styling or drawings per cell if needed
    }
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(180);
    doc.text(
      `DentalFlow Pro - Página ${i} de ${pageCount} - Gerado automaticamente`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`IPO-Relatorio-Casos-${dateStr.replace(/\//g, '-')}.pdf`);
}
