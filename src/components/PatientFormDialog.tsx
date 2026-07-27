import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { adminCreate, adminUpdate } from "@/lib/api";
import { broadcastEntity } from "@/lib/optimistic";
import type { Patient } from "@/lib/types";

type Props = {
  trigger?: React.ReactNode;
  patient?: Patient;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (id: string) => void;
};

const empty = {
  first_name: "",
  last_name: "",
  age: 0,
  birth_date: "",
  gender: "",
  cpf: "",
  rg: "",
  phone: "",
  email: "",
  address: "",
  medical_history: "",
  allergies: "",
  medications: "",
  clinical_notes: "",
  notes: "",
};

export function PatientFormDialog({ trigger, patient, open: openProp, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [f, setF] = useState({ ...empty });
  const editing = !!patient;

  useEffect(() => {
    if (open) {
      if (patient) {
        setF({
          first_name: patient.first_name ?? patient.name?.split(" ")[0] ?? "",
          last_name: patient.last_name ?? patient.name?.split(" ").slice(1).join(" ") ?? "",
          age: patient.age ?? 0,
          birth_date: patient.birth_date ?? "",
          gender: patient.gender ?? "",
          cpf: patient.cpf ?? "",
          rg: patient.rg ?? "",
          phone: patient.phone ?? "",
          email: patient.email ?? "",
          address: patient.address ?? "",
          medical_history: patient.medical_history ?? "",
          allergies: patient.allergies ?? "",
          medications: patient.medications ?? "",
          clinical_notes: patient.clinical_notes ?? "",
          notes: patient.notes ?? "",
        });
      } else {
        setF({ ...empty });
      }
    }
  }, [open, patient]);

  const save = useMutation({
    mutationFn: async () => {
      const first = f.first_name.trim();
      const last = f.last_name.trim();
      if (!first) throw new Error("Informe ao menos o nome");
      const fullName = [first, last].filter(Boolean).join(" ");
      const payload = {
        name: fullName,
        first_name: first,
        last_name: last || null,
        age: Number(f.age) || 0,
        birth_date: f.birth_date || null,
        gender: f.gender || null,
        cpf: f.cpf || null,
        rg: f.rg || null,
        phone: f.phone || null,
        email: f.email || null,
        address: f.address || null,
        medical_history: f.medical_history || null,
        allergies: f.allergies || null,
        medications: f.medications || null,
        clinical_notes: f.clinical_notes || null,
        notes: f.notes || null,
      };
      if (editing && patient) {
        await adminUpdate("patients", patient.id, payload);
        return { id: patient.id, row: { id: patient.id, ...(patient as any), ...payload } };
      }
      await adminCreate("patients", payload);
      return { id: null as string | null, row: null };
    },
    onSuccess: (res) => {
      toast.success(editing ? "Paciente atualizado" : "Paciente cadastrado");
      // Optimistic: patch patients cache
      if (res.row) {
        qc.setQueriesData<any[]>({ queryKey: ["patients"] }, (old) =>
          Array.isArray(old) ? old.map((p) => (p.id === res.id ? { ...p, ...res.row } : p)) : old,
        );
        qc.setQueryData(["patient", res.id], (old: any) => (old ? { ...old, ...res.row } : res.row));
        // Optimistic: patch every case referencing this patient so cadistas see it instantly.
        qc.setQueriesData<any[]>({ queryKey: ["cases"] }, (old) =>
          Array.isArray(old)
            ? old.map((c) => (c.patient_id === res.id ? { ...c, patient: { ...(c.patient ?? {}), ...res.row } } : c))
            : old,
        );
        qc.setQueriesData<any>({ queryKey: ["case"] }, (old: any) =>
          old && old.patient_id === res.id ? { ...old, patient: { ...(old.patient ?? {}), ...res.row } } : old,
        );
        // Peer broadcast to other tabs/devices
        broadcastEntity("patients", editing ? "update" : "insert", res.row);
      }
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["patient", patient?.id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      setOpen(false);
      onSaved?.(res.id ?? patient?.id ?? "");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar paciente" : "Novo paciente"}</DialogTitle>
          <DialogDescription>
            Apenas o nome é obrigatório. Todos os outros campos são opcionais e podem ser ajustados depois.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="basic">Básico</TabsTrigger>
            <TabsTrigger value="contact">Contato</TabsTrigger>
            <TabsTrigger value="clinical">Clínico</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome *</Label><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
              <div><Label>Sobrenome</Label><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
              <div><Label>Idade</Label><Input type="number" min={0} value={f.age} onChange={(e) => setF({ ...f, age: Number(e.target.value) })} /></div>
              <div><Label>Data de nascimento</Label><Input type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></div>
              <div><Label>Sexo</Label><Input value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })} placeholder="M / F / Outro" /></div>
              <div><Label>CPF</Label><Input value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
              <div><Label>RG</Label><Input value={f.rg} onChange={(e) => setF({ ...f, rg: e.target.value })} /></div>
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-3 pt-3">
            <div><Label>Telefone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><Label>Endereço</Label><Textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
            <div><Label>Observações gerais</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="clinical" className="space-y-3 pt-3">
            <div><Label>Histórico médico</Label><Textarea rows={3} value={f.medical_history} onChange={(e) => setF({ ...f, medical_history: e.target.value })} /></div>
            <div><Label>Alergias</Label><Textarea rows={2} value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} /></div>
            <div><Label>Medicamentos em uso</Label><Textarea rows={2} value={f.medications} onChange={(e) => setF({ ...f, medications: e.target.value })} /></div>
            <div><Label>Notas clínicas</Label><Textarea rows={3} value={f.clinical_notes} onChange={(e) => setF({ ...f, clinical_notes: e.target.value })} /></div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {editing ? "Salvar alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
