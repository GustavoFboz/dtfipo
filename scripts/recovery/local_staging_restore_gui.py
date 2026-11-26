"""Windows GUI for private database restore in an ephemeral offline Docker container."""
from __future__ import annotations
import threading
import re
import tkinter as tk
from tkinter import filedialog, ttk
from local_staging_restore import read_database_export, restore_database_locally, inspect_required_extensions

def main():
    root=tk.Tk()
    root.title("DentalFlow — Restauração isolada compatível com Supabase")
    root.geometry("960x555")
    root.minsize(720,500)

    outer=ttk.Frame(root,padding=24)
    outer.pack(fill="both",expand=True)
    ttk.Label(outer,text="DentalFlow · Restauração isolada Supabase",font=("Segoe UI",17)).pack(anchor="w",pady=(0,8))
    ttk.Label(outer,text=(
        "Usa SOMENTE o pacote criptografado do BANCO de 04/11.\n"
        "Nunca envia dados ao ChatGPT, GitHub, Lovable ou Asaas.\n"
        "Para restaurar, requer Docker Desktop no Windows; Supabase PostgreSQL 17 fica sem rede,\n"
        "sem porta pública e é destruído ao final. Anexos não são importados nesta fase.\n"
        "Objetos duplicados são recriados SOMENTE no contêiner descartável."
    ),wraplength=720).pack(anchor="w",pady=(0,18))

    bundle=tk.StringVar()
    key=tk.StringVar()
    def row(label,value,directory):
        ttk.Label(outer,text=label).pack(anchor="w")
        r=ttk.Frame(outer);r.pack(fill="x",pady=(4,14))
        ttk.Entry(r,textvariable=value).pack(side="left",fill="x",expand=True)
        def choose():
            picked=(filedialog.askdirectory(title=label) if directory else
                    filedialog.askopenfilename(title=label))
            if picked:value.set(picked)
        ttk.Button(r,text="Escolher",command=choose).pack(side="left",padx=(8,0))

    row("Pasta CIFRADA do banco — catalog.dfenc e part-001.dfenc",bundle,True)
    row("Nova chave PRIVADA do banco (arquivo .bin, fora do Drive)",key,False)

    confirm=tk.BooleanVar(value=False)
    ttk.Checkbutton(outer,variable=confirm,text=(
        "Estou usando a cópia local privada e autorizo somente uma restauração DESCARTÁVEL,\n"
        "sem acesso à rede ou à produção."
    )).pack(anchor="w",pady=(4,18))

    status=tk.StringVar(value="Nenhuma operação executada.")
    summary=tk.StringVar(value="")
    ttk.Label(outer,textvariable=status,wraplength=720).pack(anchor="w",pady=(12,9))
    ttk.Label(outer,textvariable=summary,wraplength=720).pack(anchor="w",pady=(0,12))

    def action(mode):
        restore = (mode == 'restore')
        if not bundle.get().strip() or not key.get().strip():
            status.set("Escolha o pacote do banco e a nova chave.")
            return
        if restore and not confirm.get():
            status.set("Confirme o isolamento antes de iniciar a restauração.")
            return
        verify_btn.config(state="disabled")
        restore_btn.config(state="disabled")
        extension_btn.config(state="disabled")
        status.set("Autenticando backup local e verificando o PostgreSQL isolado…" if restore
                   else "Verificando a assinatura AES-256-GCM do arquivo local…")
        summary.set("Não serão enviados arquivos pela rede.")

        def task():
            try:
                if restore:
                    report=restore_database_locally(bundle.get(),key.get())
                elif mode == 'extensions':
                    report=inspect_required_extensions(bundle.get(),key.get())
                else:
                    content,kind=read_database_export(bundle.get(),key.get())
                    report={"type":kind,"bytes":len(content)}
                failure=False
            except Exception as exc:
                report=None;failure=True
                # Only show fixed safe categories, not PostgreSQL stderr or paths.
                candidate=str(exc) if isinstance(exc, ValueError) else ''
                diagnostic=(candidate if re.fullmatch(r'DF_[A-Z0-9_]{3,96}',candidate)
                            else 'DF_ISOLATED_DB_RESTORE_UNVERIFIED')

            def finish():
                verify_btn.config(state="normal")
                restore_btn.config(state="normal")
                extension_btn.config(state="normal")
                if failure:
                    status.set("Não foi possível concluir. A restauração não foi aprovada.")
                    summary.set("Código de diagnóstico: " + diagnostic + "\n"
                                "Mantenha os backups intactos; não conecte à produção. "
                                "Informe apenas este código no chat.")
                elif mode == 'extensions':
                    status.set("Extensões exigidas pelo backup: inventário lido sem executar SQL.")
                    summary.set("Quantidade: " + str(report['extension_count']) + "\n" +
                                "Extensões: " + (", ".join(report['required_extensions']) or "nenhuma no catálogo") +
                                "\nBanco e anexos NÃO restaurados. Não alterou produção.")
                elif restore:
                    status.set("Banco restaurado e conferido localmente em ambiente DESCARTÁVEL.")
                    summary.set(
                        f"Pacientes: {report['restored_patients']} · Casos: {report['restored_cases']} · "
                        f"Agendamentos: {report['restored_appointments']} · "
                        f"Metadados Storage: {report['restored_storage_metadata_rows']}.\n"
                        "O container foi removido ao final. ANEXOS AINDA NÃO RESTAURADOS. "
                        "Beta pago continua bloqueado."
                    )
                else:
                    status.set("Arquivo do banco autenticado: formato reconhecido.")
                    summary.set(
                        f"Formato: {report['type']} · Bytes: {report['bytes']:,}.\n"
                        "Verificação de formato NÃO é restauração. Docker é necessário para o próximo botão."
                    )
            root.after(0,finish)
        threading.Thread(target=task,daemon=True).start()

    buttons=ttk.Frame(outer);buttons.pack(anchor="w",pady=(12,16))
    verify_btn=ttk.Button(buttons,text="1. Verificar formato do banco",command=lambda:action('verify'))
    verify_btn.pack(side="left")
    restore_btn=ttk.Button(buttons,text="2. Restaurar em Supabase PG isolado",command=lambda:action('restore'))
    restore_btn.pack(side="left",padx=(12,0))
    extension_btn=ttk.Button(buttons,text="3. Ver extensões exigidas",command=lambda:action('extensions'))
    extension_btn.pack(side="left",padx=(12,0))

    ttk.Label(outer,text=(
        "Não inclui instalação de Supabase Auth/Storage/Edge Functions ou dados dos 708 arquivos.\n"
        "Falhas por extensão PostgreSQL ausente são bloqueios reais a investigar, não provas de recuperação."
    ),wraplength=720).pack(anchor="w")
    root.mainloop()

if __name__=="__main__":
    main()
