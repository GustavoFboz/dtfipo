import { jsPDF } from "jspdf";
import autoTable, { UserOptions } from "jspdf-autotable";
import type { CaseRow } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

// Extended jsPDF type to include autoTable if used as method
interface jsPDFWithAutoTable extends jsPDF {
  lastAutoTable: {
    finalY: number;
  };
}



async function getBase64FromUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  
  console.log(`[PDF Report] Processing image URL: ${url}`);
  
  try {
    // If it is a Supabase storage URL, we might need a different approach due to CORS
    // but first let's try a standard fetch with a proxy-like header
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit', // Crucial for some CORS setups
      headers: {
        'Accept': 'image/*'
      }
    });


    if (!res.ok) {
      console.warn(`[PDF Report] Failed to fetch image: ${res.status} ${res.statusText} for URL: ${url}`);
      
      // Fallback for Supabase storage if it is a private bucket but public link is expected
      if (url.includes('/storage/v1/object/public/')) {
         console.log("[PDF Report] Attempting alternative fetch for public storage URL");
      }
      return null;
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      console.warn("[PDF Report] Fetched image blob is empty");
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Verify we actually got a valid data URL
        if (result && result.startsWith('data:image/')) {
          resolve(result);
        } else {
          console.warn("[PDF Report] FileReader did not produce a valid data:image URL");
          resolve(null);
        }
      };
      reader.onerror = (e) => {
        console.error("[PDF Report] FileReader error:", e);
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("[PDF Report] Error in getBase64FromUrl:", e);
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
    console.log(`Starting PDF generation for ${cases.length} cases`);
    const doc = new jsPDF({

      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      putOnlyUsedFonts: true
    }) as jsPDFWithAutoTable;
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const primaryColor = [84, 168, 251]; // #54A8FB

    // 1. Header
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

    // 3. Professionals
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url, role");
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const uniqueProfProfiles = new Map<string, { name: string; avatar: string | null; role: string }>();
    cases.forEach(c => {
      if (c.doctor) {
        const profId = c.doctor.id || c.doctor.name;
        if (!uniqueProfProfiles.has(profId)) {
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
      
      let imageAdded = false;
      if (avatarBase64 && avatarBase64.startsWith('data:image/')) {
        try {
          const typeMatch = avatarBase64.match(/^data:image\/([a-zA-Z+]+);base64,/);
          const type = typeMatch ? typeMatch[1].toUpperCase() : 'JPEG';
          const validTypes = ['JPEG', 'PNG', 'WEBP'];
          const format = validTypes.includes(type) ? type : 'JPEG';
          
          // Verify base64 integrity before adding
          if (avatarBase64.length > 100) {
            doc.addImage(avatarBase64, format as any, profX, profY - 5, 10, 10);
            imageAdded = true;
          }
        } catch (e) {
          console.warn("Failed to add image to PDF", e);
        }

      }
      
      if (!imageAdded) {
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
        if (c.entry_date) {
          entryDateStr = c.entry_date.split('T')[0].split('-').reverse().join('/');
        } else if (c.created_at) {
          entryDateStr = c.created_at.split('T')[0].split('-').reverse().join('/');
        }
      } catch (e) {
        console.warn("[PDF Report] Error parsing entry date:", e);
      }

      let deliveryDateStr = "-";
      try {
        if (c.delivery_date) {
          deliveryDateStr = c.delivery_date.split('T')[0].split('-').reverse().join('/');
        }
      } catch (e) {
        console.warn("[PDF Report] Error parsing delivery date:", e);
      }

      const patientName = c.patient?.name || (typeof c.patient === 'string' ? c.patient : "N/A");
      const doctorName = c.doctor?.name || (typeof c.doctor === 'string' ? c.doctor : "-");
      const stageName = c.current_stage?.name || (c.finished || c.status === 'finalizado' ? "Finalizado" : "Pendente");
      const statusLabel = c.status ? String(c.status).toUpperCase() : "N/A";

      return [
        c.case_number || "-",
        patientName,
        doctorName,
        entryDateStr,
        deliveryDateStr,
        stageName,
        statusLabel
      ];
    });

    autoTable(doc, {
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

    console.log("PDF generated successfully, saving...");
    doc.save(`IPO-Relatorio-Casos-${dateStr.replace(/\//g, '-')}.pdf`);

  } catch (error: any) {
    console.error("Critical error in generateCasesReport:", error);
    throw new Error(error?.message || "Erro desconhecido ao gerar o PDF");
  }
}
