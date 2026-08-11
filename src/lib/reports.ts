import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CaseRow } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

// Ensure the plugin is registered correctly if it's being used as a method
// although we'll use the standalone function for reliability.
if (!(jsPDF as any).prototype.autoTable) {
  (jsPDF as any).prototype.autoTable = function(options: any) {
    autoTable(this, options);
    return this;
  };
}

/**
 * Fetches an image from a URL and converts it to a Base64 string.
 * Optimized for Supabase storage and CORS.
 */
async function getBase64FromUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { 'Accept': 'image/*' }
    });

    if (!res.ok) return null;

    const blob = await res.blob();
    if (blob.size === 0) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result && result.startsWith('data:image/') ? result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("[PDF Report] Image fetch error:", e);
    return null;
  }
}

/**
 * Generates and downloads a detailed PDF report of clinical cases.
 */
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
    // 1. Initialize Document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const primaryColor: [number, number, number] = [84, 168, 251]; // #54A8FB

    // 2. Header (Logo & Title)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("IPO", margin, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.setFont("helvetica", "normal");
    doc.text("Instituto Praia de Odontologia", margin, 32);
    doc.text("Controle Digital de Casos Clínicos", margin, 37);

    // Document Meta
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
      const start = filters.dateRange.start.split('-').reverse().join('/');
      const end = filters.dateRange.end.split('-').reverse().join('/');
      periodText = `Período: ${start} até ${end}`;
    }
    doc.text(periodText, pageWidth - margin, 37, { align: "right" });

    doc.setDrawColor(240);
    doc.line(margin, 45, pageWidth - margin, 45);

    // 3. Professionals Section
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url");
    const uniqueProfs = new Map<string, { name: string; avatar: string | null; role: string }>();

    cases.forEach(c => {
      if (c.doctor?.name) {
        const id = `doc-${c.doctor.name}`;
        if (!uniqueProfs.has(id)) {
          const p = profiles?.find(p => p.full_name === c.doctor?.name);
          uniqueProfs.set(id, { name: c.doctor.name, avatar: p?.avatar_url || null, role: "Dentista" });
        }
      }
      if (c.cadista?.name) {
        const id = `cad-${c.cadista.name}`;
        if (!uniqueProfs.has(id)) {
          const p = profiles?.find(p => p.full_name === c.cadista?.name);
          uniqueProfs.set(id, { name: c.cadista.name, avatar: p?.avatar_url || null, role: "Cadista" });
        }
      }
    });

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50);
    doc.text("Profissionais Envolvidos", margin, 55);

    let profX = margin;
    let profY = 65;
    const profsList = Array.from(uniqueProfs.values());

    for (const p of profsList) {
      if (profX > pageWidth - 50) {
        profX = margin;
        profY += 18;
      }
      
      let imageAdded = false;
      if (p.avatar) {
        const base64 = await getBase64FromUrl(p.avatar);
        if (base64) {
          try {
            const format = base64.toLowerCase().includes('png') ? 'PNG' : 'JPEG';
            doc.addImage(base64, format, profX, profY - 5, 10, 10);
            imageAdded = true;
          } catch (e) {
            console.warn("[PDF Report] Avatar add error", e);
          }
        }
      }
      
      if (!imageAdded) {
        doc.setFillColor(240, 244, 250);
        doc.circle(profX + 5, profY, 5, "F");
        doc.setFontSize(7);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(p.name?.[0]?.toUpperCase() || "?", profX + 5, profY + 1, { align: "center" });
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

    // 4. Data Table
    const tableData = cases.map(c => [
      c.case_number || "-",
      c.patient?.name || (typeof c.patient === 'string' ? c.patient : "-"),
      c.doctor?.name || "-",
      c.entry_date ? c.entry_date.split('T')[0].split('-').reverse().join('/') : (c.created_at?.split('T')[0].split('-').reverse().join('/') || "-"),
      c.delivery_date ? c.delivery_date.split('T')[0].split('-').reverse().join('/') : "-",
      c.current_stage?.name || (c.finished ? "Finalizado" : "Pendente"),
      (c.status || "N/A").toUpperCase()
    ]);

    autoTable(doc, {
      startY: profY + 15,
      head: [['Nº', 'Paciente', 'Doutor', 'Entrada', 'Entrega', 'Etapa Atual', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [248, 249, 251],
        textColor: primaryColor,
        fontSize: 8,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 8,
        cellPadding: 4,
        textColor: [80, 80, 80],
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 15 },
        5: { fontStyle: 'bold', textColor: [50, 50, 50] },
        6: { halign: 'center' }
      },
      margin: { left: margin, right: margin }
    });

    // 5. Footer (Pagination)
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(180);
      doc.text(
        `DentalFlow Pro - Página ${i} de ${pageCount} - Gerado em ${dateStr}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
    }

    // 6. Finalize and Save
    doc.save(`Relatorio-Casos-IPO-${dateStr.replace(/\//g, '-')}.pdf`);

  } catch (error) {
    console.error("PDF generation failed:", error);
    throw error;
  }
}
