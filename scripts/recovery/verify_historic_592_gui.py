"""Read-only Windows GUI for historic 592 encrypted objects in 33 ZIP volumes.

Never uploads, extracts, logs or displays private source paths and names.
"""
from __future__ import annotations
import importlib.util
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, ttk

try:
    from verify_zip_payloads import verify_archived_subset
except ImportError:
    # Source file preserves its original hyphenated name for existing CLIs.
    spec = importlib.util.spec_from_file_location(
        "verify_zip_payloads", Path(__file__).with_name("verify-zip-payloads.py"))
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    verify_archived_subset = module.verify_archived_subset


def main():
    root = tk.Tk()
    root.title("DentalFlow — Conferência dos 592 anexos históricos")
    root.geometry("810x540")
    root.minsize(690, 485)
    outer = ttk.Frame(root, padding=26)
    outer.pack(fill="both", expand=True)

    ttk.Label(outer, text="DentalFlow · Conferir 592 arquivos",
              font=("Segoe UI", 19)).pack(anchor="w", pady=(0, 9))
    ttk.Label(outer, text="Conferência dos 33 volumes ZIP históricos de 29/10.\n"
              "Nenhum documento será extraído, transferido ou gravado em texto claro.",
              wraplength=730).pack(anchor="w", pady=(0, 18))
    names=[
        "1. Índice histórico criptografado de 29/10 (.dfenc)",
        "2. Chave privada ORIGINAL de 29/10 (.bin)",
        "3. Pasta contendo 33 ZIPs históricos (Parte_01.zip a Parte_33.zip)",
    ]
    paths=[tk.StringVar() for _ in names]
    captions=[tk.StringVar(value="Não selecionado") for _ in names]
    for i, name in enumerate(names):
        ttk.Label(outer, text=name).pack(anchor="w", pady=(0, 3))
        line=ttk.Frame(outer)
        line.pack(fill="x", pady=(0, 12))
        ttk.Label(line, textvariable=captions[i],
                  foreground="#586270").pack(side="left",fill="x",expand=True)
        def choose(idx=i):
            location = (filedialog.askdirectory(title=names[idx]) if idx==2
                        else filedialog.askopenfilename(title=names[idx]))
            if location:
                paths[idx].set(location)
                captions[idx].set("Selecionado ✓")
        ttk.Button(line,text="Escolher",command=choose).pack(side="right")
    ttk.Separator(outer,orient="horizontal").pack(fill="x",pady=(8,13))
    status=tk.StringVar(value="Nenhum arquivo verificado.")
    counts=tk.StringVar(value="")
    ttk.Label(outer,textvariable=status,wraplength=740,
              font=("Segoe UI",11)).pack(anchor="w",pady=(0,10))
    ttk.Label(outer,textvariable=counts,wraplength=740).pack(anchor="w",pady=(0,14))

    def start():
        if not all(x.get() for x in paths):
            status.set("Selecione os três itens para iniciar.")
            return
        folder=Path(paths[2].get())
        found=sum((folder / f"DentalFlow_Anexos_2026-10-29_Parte_{n:02d}.zip").is_file()
                  for n in range(1,34))
        if found!=33:
            status.set(f"Encontrados {found}/33 volumes ZIP nesta pasta.")
            counts.set("Esta conferência exige todos os 33 ZIPs históricos.\n"
                       "Não confunda com os 14 arquivos .dfenc recuperados.")
            return
        button.configure(state="disabled")
        status.set("Verificando assinaturas e arquivos cifrados…")
        counts.set("Pode levar algum tempo com os arquivos grandes. "
                   "Não feche o programa durante a conferência.")
        params=tuple(x.get() for x in paths)

        def work():
            def progress(i,total):
                root.after(0,lambda a=i,b=total: status.set(
                    f"Pacotes históricos verificados: {a}/{b}"))
            try:
                result=verify_archived_subset(*params,on_progress=progress)
                error=False
            except Exception:
                result,error=None,True
            def finished():
                button.configure(state="normal")
                if error:
                    status.set("Não foi possível validar todos os 33 volumes.")
                    counts.set("Confira se usou índice e chave originais de 29/10 "
                               "e se todos os ZIPs estão completos. "
                               "Os arquivos originais foram preservados.")
                else:
                    status.set(
                        f"Arquivos do backup histórico conferidos: "
                        f"{result['archived_objects_verified']}/592")
                    counts.set(
                        f"ZIPs validados: {result['zip_manifests_verified']}/33.\n"
                        f"Dados recuperáveis nos ZIPs antigos: "
                        f"{result['verified_decrypted_bytes_without_plaintext_files']:,} bytes.\n"
                        "Os outros 116 já foram conferidos em pacote separado.\n"
                        "A restauração integrada de 708 anexos com o banco e "
                        "o beta pago CONTINUAM pendentes.")
            root.after(0,finished)
        threading.Thread(target=work,daemon=True).start()

    button=ttk.Button(outer,text="Conferir 592 arquivos (somente leitura)",command=start)
    button.pack(anchor="w",pady=(3,16))
    ttk.Label(outer,text="A chave e os arquivos ficam no seu computador. "
              "Envie ao chat somente as contagens finais, nunca os ZIPs, "
              "o índice, a chave ou caminhos particulares.",
              foreground="#596273",wraplength=720).pack(anchor="w")
    root.mainloop()


if __name__=="__main__":
    main()
