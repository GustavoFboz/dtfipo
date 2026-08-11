
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
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Error fetching image for PDF:", e);
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
  try {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      putOnlyUsedFonts: true
    }) as jsPDFWithAutoTable;
    
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
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, full_name, avatar_url, role");
    if (profilesError) {
      console.error("Error fetching profiles for report:", profilesError);
    }
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const uniqueProfProfiles = new Map<string, { name: string; avatar: string | null; role: string }>();
    cases.forEach(c => {
      if (c.doctor) {
        const profId = c.doctor.id || c.doctor.name; // Use ID if available, fallback to name
        if (!uniqueProfProfiles.has(profId)) {
          // Check if it's a doctor with a linked user_id
          const doctorRecord = c.doctor as any;
          const p = (profiles || []).find((p: any) => 
            p.full_name === c.doctor?.name || 
            (doctorRecord?.user_id && p.id === doctorRecord.user_id)
          );
          uniqueProfProfiles.set(profId, { 
            name: c.doctor.name, 
            avatar: p?.avatar_url || null, 
            role: "Dentista" 
          });
        }
      }
      if (c.cadista) {
        const profId = c.cadista.id || c.cadista.name;
        if (!uniqueProfProfiles.has(profId)) {
          const p = c.cadista.user_id ? profileMap.get(c.cadista.user_id) : (profiles || []).find((p: any) => p.full_name === c.cadista?.name);
          uniqueProfProfiles.set(profId, { 
            name: c.cadista.name, 
            avatar: p?.avatar_url || null, 
            role: "Cadista" 
          });
        }
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
      
      let avatarBase64: string | null = null;
      if (p.avatar) {
        try {
          avatarBase64 = await getBase64FromUrl(p.avatar);
        } catch (e) {
          console.error("Failed to fetch avatar base64", e);
        }
      }
      
      if (avatarBase64 && avatarBase64.startsWith('data:image/')) {
        try {
          const typeMatch = avatarBase64.match(/^data:image\/([a-zA-Z+]+);base64,/);
          const type = typeMatch ? typeMatch[1].toUpperCase() : 'JPEG';
          const validTypes = ['JPEG', 'PNG', 'WEBP'];
          const format = validTypes.includes(type) ? type : 'JPEG';
          
          doc.addImage(avatarBase64, format as any, profX, profY - 5, 10, 10);
        } catch (e) {
          console.warn("Failed to add image to PDF, using fallback circle", e);
          doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
          doc.circle(profX + 5, profY, 5, "F");
        }
      } else {
        doc.setFillColor(240, 244, 250);
        doc.circle(profX + 5, profY, 5, "F");
        doc.setFontSize(7);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(p.name ? p.name[0].toUpperCase() : "?", profX + 5, profY + 1, { align: "center" });
      }
      
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.setFont("helvetica", "bold");
      doc.text(p.name ? p.name.split(' ')[0] : "Profissional", profX + 12, profY - 1);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150);
      doc.text(p.role || "Membro", profX + 12, profY + 3);
      
      profX += 45;
    }

    // 4. Cases Table
    const tableData = cases.map(c => {
      let entryDateStr = "-";
      try {
        if (c.entry_date) entryDateStr = c.entry_date.split('T')[0].split('-').reverse().join('/');
      } catch (e) {}

      let deliveryDateStr = "-";
      try {
        if (c.delivery_date) deliveryDateStr = c.delivery_date.split('T')[0].split('-').reverse().join('/');
      } catch (e) {}

      return [
        c.case_number || "-",
        c.patient?.name || "N/A",
        c.doctor?.name || "-",
        entryDateStr,
        deliveryDateStr,
        c.current_stage?.name || "Pendente",
        c.status ? String(c.status).toUpperCase() : "N/A"
      ];
    });

    const autoTableOptions = {
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
        0: { cellWidth: 15 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 'auto' },
        5: { fontStyle: 'bold', textColor: [50, 50, 50] },
        6: { halign: 'center', fontSize: 7 }
      },
      alternateRowStyles: {
        fillColor: [252, 253, 255]
      },
      margin: { left: margin, right: margin }
    };

    doc.autoTable(autoTableOptions);

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
  } catch (error) {
    console.error("Critical error in generateCasesReport:", error);
    throw error;
  }
}
