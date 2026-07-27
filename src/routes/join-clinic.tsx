// @ts-nocheck
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchClinics, fetchMyMemberships, requestJoinClinic } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Clock, CheckCircle2, XCircle, LogOut, Plus } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";


export const Route = createFileRoute("/join-clinic")({
  ssr: false,
  beforeLoad: async () => {
    // Clinic/membership schema is not restored yet; skip the join flow and
    // send every authenticated user straight to the app.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { invite: undefined, mode: undefined } });
    }
    throw redirect({ to: "/" });
  },
  component: JoinClinicPage,
});

function JoinClinicPage() {
  const router = useRouter();
  const { data: clinics = [], isLoading } = useQuery({ queryKey: ["clinics"], queryFn: fetchClinics });
  const { data: memberships = [], refetch } = useQuery({
    queryKey: ["my_memberships"],
    queryFn: fetchMyMemberships,
    refetchInterval: 5000,
  });

  // Detect approval: when any membership becomes "active", reload into the app.
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current) return;
    if (memberships.some((m) => m.status === "active")) {
      notifiedRef.current = true;
      toast.success("Sua solicitação foi aprovada! Redirecionando...");
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    }
  }, [memberships]);

  const join = useMutation({
    mutationFn: requestJoinClinic,
    onSuccess: () => {
      toast.success("Solicitação enviada! Aguarde a aprovação do administrador.");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const statusOf = (clinicId: string) =>
    memberships.find((m) => m.clinic_id === clinicId)?.status;

  const [companyName, setCompanyName] = useState("");
  const [companyKind, setCompanyKind] = useState<"consultorio" | "laboratorio">("consultorio");
  const createCompany = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_company_account", {
        p_name: companyName.trim(),
        p_kind: companyKind,
        p_full_name: null as unknown as string,
      });
      if (error) throw new Error(error.message);
      const res = data as { success: boolean; error?: string };
      if (!res?.success) throw new Error(res?.error ?? "Erro ao criar consultório");
    },
    onSuccess: () => {
      toast.success("Consultório criado!");
      setTimeout(() => (window.location.href = "/"), 800);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    // Hard redirect avoids any router/loader race that could keep the page.
    window.location.href = "/auth";
    // Fallback in case the assignment is intercepted
    setTimeout(() => router.navigate({ to: "/auth", replace: true, search: { invite: undefined, mode: undefined } }), 50);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-start justify-center p-6 md:p-12">
      <div className="w-full max-w-3xl">
        <div className="flex justify-between items-start mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-[10px] font-bold text-primary uppercase tracking-[0.08em] mb-4">
              <Building2 className="h-3 w-3" />
              Acesso ao Sistema
            </div>
            <h1 className="text-4xl md:text-5xl font-light text-slate-900 tracking-tight">
              Junte-se a um <span className="text-primary">consultório</span>
            </h1>
            <p className="text-slate-500 font-light mt-3 max-w-xl">
              Para acessar o sistema, envie uma solicitação para o consultório do qual você faz parte.
              Um administrador irá revisar e aprovar seu acesso.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="text-slate-600">
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>

        <div className="mb-8 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-4 w-4 text-primary" />
            <h2 className="font-medium text-slate-900">Criar um novo consultório ou laboratório</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <div>
              <Label className="text-xs text-slate-500">Nome</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ex.: Clínica Sorriso" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Tipo</Label>
              <Select value={companyKind} onValueChange={(v) => setCompanyKind(v as "consultorio" | "laboratorio")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultorio">Consultório</SelectItem>
                  <SelectItem value="laboratorio">Laboratório</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => createCompany.mutate()}
                disabled={createCompany.isPending || companyName.trim().length < 2}
              >
                {createCompany.isPending ? "Criando..." : "Criar"}
              </Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando consultórios...</div>
        ) : (
          <div className="space-y-4">
            {clinics.map((c) => {
              const status = statusOf(c.id);
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900">{c.name}</h3>
                      {status && (
                        <div className="mt-1">
                          {status === "pending" && (
                            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                              <Clock className="h-3 w-3 mr-1" /> Solicitação pendente
                            </Badge>
                          )}
                          {status === "active" && (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
                            </Badge>
                          )}
                          {status === "rejected" && (
                            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                              <XCircle className="h-3 w-3 mr-1" /> Recusado
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => join.mutate(c.id)}
                    disabled={join.isPending || status === "pending" || status === "active"}
                  >
                    {status === "pending"
                      ? "Aguardando"
                      : status === "active"
                      ? "Membro"
                      : status === "rejected"
                      ? "Solicitar novamente"
                      : "Solicitar entrada"}
                  </Button>
                </div>
              );
            })}
            {clinics.length === 0 && (
              <div className="text-center py-12 text-slate-400">Nenhum consultório cadastrado ainda.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
